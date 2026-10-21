//backend/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { addHours, addMinutes } from 'date-fns';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { generateSecureToken, hashToken } from './token.util';
import { JwtPayload } from './strategies/jwt.strategy';
import { AccountRecord, accountSelect, isAccountUsable } from './account-status.util';
import { getRecentRotation, invalidateIdentity, rememberRotation, withUserLock } from './auth-cache';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Delai minimal entre deux emails "mot de passe oublie" pour un meme compte (anti-spam de boite mail). */
const RESET_EMAIL_COOLDOWN_MINUTES = 2;
const RESET_TOKEN_VALIDITY_HOURS = 2;

@Injectable()
export class AuthService {
  /**
   * Hash factice, calcule une seule fois : permet de depenser le meme temps
   * CPU quand l'email n'existe pas, pour que le temps de reponse ne revele
   * pas si un compte existe (enumeration des emails par chronometrage).
   */
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --------------------------------------------------------------------
  // LOGIN
  // --------------------------------------------------------------------
  async login(email: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { ...accountSelect, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      // Meme cout CPU qu'un vrai mot de passe verifie (anti-chronometrage).
      await argon2.verify(await this.getDummyHash(), password).catch(() => false);
      throw AppException.invalidCredentials();
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) throw AppException.invalidCredentials();

    // Statut du compte + client suspendu (section 4.1) + client suspendu pour un superviseur :
    // regle unique partagee avec JwtStrategy et refresh().
    if (!isAccountUsable(user)) throw AppException.accountNotActive();

    const tokens = await this.issueTokenPair(user);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { ...tokens, user: this.toPublicUser(user) };
  }

  async logout(userId: string, meta: RequestMeta) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    invalidateIdentity(userId);
    await this.audit.log({
      userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  // --------------------------------------------------------------------
  // REFRESH (rotation)
  // --------------------------------------------------------------------
  /**
   * Rotation du refresh token.
   *
   * Corrections par rapport a l'ancienne version :
   *  - le compte est reverifie (statut, client suspendu) : un utilisateur
   *    suspendu ne pouvait plus se connecter mais pouvait renouveler sa session
   *    a l'infini ;
   *  - le meme token presente deux fois dans un court delai (double appel,
   *    deux onglets, relance reseau) renvoie la meme paire au lieu d'etre
   *    interprete comme un vol et de deconnecter l'utilisateur ;
   *  - la rotation est une mise a jour conditionnelle (compare-and-swap) :
   *    deux requetes simultanees ne peuvent pas toutes les deux "gagner".
   */
  async refresh(userId: string, providedRefreshToken: string): Promise<TokenPair> {
    if (!providedRefreshToken) throw AppException.invalidCredentials();
    const tokenKey = hashToken(providedRefreshToken);

    return withUserLock(userId, async () => {
      const replay = getRecentRotation(tokenKey, userId);
      if (replay) return replay;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { ...accountSelect, refreshTokenHash: true },
      });
      if (!user || !user.refreshTokenHash) throw AppException.invalidCredentials();

      if (!isAccountUsable(user)) {
        await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
        invalidateIdentity(user.id);
        throw AppException.accountNotActive();
      }

      const matches = await argon2.verify(user.refreshTokenHash, providedRefreshToken);
      if (!matches) {
        // Reutilisation d'un refresh token perime/vole : on invalide la session par precaution.
        await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
        throw AppException.invalidCredentials();
      }

      const pair = await this.signTokenPair(user);
      const newHash = await argon2.hash(pair.refreshToken);

      // Compare-and-swap : on ne remplace le hash que s'il vaut toujours celui
      // que l'on vient de verifier (une autre instance a pu tourner entre-temps).
      const swapped = await this.prisma.user.updateMany({
        where: { id: user.id, refreshTokenHash: user.refreshTokenHash },
        data: { refreshTokenHash: newHash },
      });
      if (swapped.count !== 1) throw AppException.invalidCredentials();

      rememberRotation(tokenKey, user.id, pair);
      return pair;
    });
  }

  // --------------------------------------------------------------------
  // INVITATION (premiere connexion securisee - section 8)
  // Email d'invitation -> lien securise -> creation du mot de passe.
  // Jamais de mot de passe permanent envoye en clair par email.
  // --------------------------------------------------------------------
  async createInvitation(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { raw, hash } = generateSecureToken();
    const expiresAt = addHours(new Date(), this.config.get<number>('invitation.tokenExpiresInHours')!);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { invitationTokenHash: hash, invitationTokenExpiresAt: expiresAt, status: 'INVITED' },
    });
    invalidateIdentity(user.id);

    const firstName = await this.resolveFirstName(user.id);
    const inviteUrl = `${this.config.get<string>('frontendUrl')}/invitation/accept?token=${raw}`;

    await this.notifications.send({
      userId: user.id,
      type: 'ACCOUNT_INVITATION',
      title: 'Invitation à rejoindre la plateforme',
      message: "Un email d'invitation vous a été envoyé pour activer votre compte.",
      emailHtml: emailTemplates.invitation(firstName, inviteUrl, this.config.get<number>('invitation.tokenExpiresInHours')!),
      emailSubject: 'Activez votre compte GeSuiMagiC - Suivi de Chantier',
    });
  }

  async acceptInvitation(rawToken: string, newPassword: string, meta: RequestMeta) {
    const hash = hashToken(rawToken);
    const user = await this.prisma.user.findFirst({ where: { invitationTokenHash: hash } });
    // Seul un compte encore "INVITED" peut etre active par ce lien : un lien
    // oublie ne doit pas pouvoir reactiver un compte suspendu ou desactive.
    if (!user || user.status !== 'INVITED' || !user.invitationTokenExpiresAt || user.invitationTokenExpiresAt < new Date()) {
      throw AppException.invalidOrExpiredToken();
    }

    const passwordHash = await argon2.hash(newPassword);

    // Usage unique garanti en base : si deux requetes utilisent le lien en meme temps, une seule passe.
    const consumed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        invitationTokenHash: hash,
        status: 'INVITED',
        invitationTokenExpiresAt: { gt: new Date() },
      },
      data: {
        passwordHash,
        status: 'ACTIVE',
        invitationTokenHash: null,
        invitationTokenExpiresAt: null,
      },
    });
    if (consumed.count !== 1) throw AppException.invalidOrExpiredToken();
    invalidateIdentity(user.id);

    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: user.id,
      reason: 'Activation du compte via invitation',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { activated: true };
  }

  // --------------------------------------------------------------------
  // MOT DE PASSE OUBLIE
  // --------------------------------------------------------------------
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Reponse volontairement identique que l'utilisateur existe ou non (anti-enumeration).
    if (!user || user.status !== 'ACTIVE') return;

    // Anti-spam : un lien a deja ete envoye il y a moins de RESET_EMAIL_COOLDOWN_MINUTES minutes.
    const now = new Date();
    if (
      user.resetTokenExpiresAt &&
      user.resetTokenExpiresAt > addMinutes(addHours(now, RESET_TOKEN_VALIDITY_HOURS), -RESET_EMAIL_COOLDOWN_MINUTES)
    ) {
      return;
    }

    const { raw, hash } = generateSecureToken();
    const expiresAt = addHours(now, RESET_TOKEN_VALIDITY_HOURS);
    await this.prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: hash, resetTokenExpiresAt: expiresAt } });

    const firstName = await this.resolveFirstName(user.id);
    const resetUrl = `${this.config.get<string>('frontendUrl')}/reset-password?token=${raw}`;

    await this.notifications.send({
      userId: user.id,
      type: 'PASSWORD_RESET',
      title: 'Réinitialisation du mot de passe',
      message: 'Une demande de réinitialisation de mot de passe a été effectuée.',
      emailHtml: emailTemplates.passwordReset(firstName, resetUrl),
      emailSubject: 'Réinitialisation de votre mot de passe',
    });
  }

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta) {
    const hash = hashToken(rawToken);
    const user = await this.prisma.user.findFirst({ where: { resetTokenHash: hash } });
    // Le lien ne doit plus fonctionner si le compte a ete suspendu/desactive depuis la demande.
    if (!user || user.status !== 'ACTIVE' || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw AppException.invalidOrExpiredToken();
    }

    const passwordHash = await argon2.hash(newPassword);
    const consumed = await this.prisma.user.updateMany({
      where: { id: user.id, resetTokenHash: hash, status: 'ACTIVE', resetTokenExpiresAt: { gt: new Date() } },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, refreshTokenHash: null },
    });
    if (consumed.count !== 1) throw AppException.invalidOrExpiredToken();
    invalidateIdentity(user.id);

    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: user.id,
      reason: 'Réinitialisation via lien "mot de passe oublié"',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw AppException.invalidCredentials();
    }
    const passwordHash = await argon2.hash(newPassword);
    // On revoque aussi tout lien de reinitialisation en cours.
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshTokenHash: null, resetTokenHash: null, resetTokenExpiresAt: null },
    });
    invalidateIdentity(userId);

    await this.audit.log({
      userId,
      userRole: user.role,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: userId,
      reason: "Changement volontaire par l'utilisateur",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------
  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) this.dummyHashPromise = argon2.hash('dummy-password-for-timing-equalisation');
    return this.dummyHashPromise;
  }

  /** Signe un couple access/refresh a partir de l'etat courant du compte (sans toucher a la base). */
  private async signTokenPair(user: Pick<AccountRecord, 'id' | 'email' | 'role' | 'clientProfile' | 'supervisorProfile'>): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clientProfileId: user.clientProfile?.id,
      supervisorProfileId: user.supervisorProfile?.id,
    };

    // jwtid : identifiant unique par jeton. Sans lui, deux jetons signes dans la meme seconde pour le meme
    // compte etaient identiques (ex: connexion puis rafraichissement immediat), ce qui rendait la rotation
    // du refresh token (et la detection de rejeu) sans effet.
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
      jwtid: randomUUID(),
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      jwtid: randomUUID(),
    });

    return { accessToken, refreshToken };
  }

  private async issueTokenPair(user: Pick<AccountRecord, 'id' | 'email' | 'role' | 'clientProfile' | 'supervisorProfile'>): Promise<TokenPair> {
    const pair = await this.signTokenPair(user);
    const refreshTokenHash = await argon2.hash(pair.refreshToken);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });
    return pair;
  }

  private async resolveFirstName(userId: string): Promise<string> {
    const [clientProfile, supervisorProfile] = await Promise.all([
      this.prisma.clientProfile.findUnique({ where: { userId } }),
      this.prisma.supervisorProfile.findUnique({ where: { userId } }),
    ]);
    return clientProfile?.firstName ?? supervisorProfile?.firstName ?? 'Bonjour';
  }

  private toPublicUser(user: { id: string; email: string; role: string }) {
    return { id: user.id, email: user.email, role: user.role };
  }
}
