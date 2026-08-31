import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { addHours } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { generateSecureToken, hashToken } from './token.util';
import { JwtPayload } from './strategies/jwt.strategy';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
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
      include: { clientProfile: true, supervisorProfile: true },
    });

    if (!user || !user.passwordHash) throw AppException.invalidCredentials();

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) throw AppException.invalidCredentials();

    if (user.status !== 'ACTIVE') throw AppException.accountNotActive();

    // Client suspendu par le superadmin (section 4.1) -> acces bloque meme si status=ACTIVE
    if (user.role === 'CLIENT' && user.clientProfile && !user.clientProfile.isActive) {
      throw AppException.accountNotActive();
    }

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
  async refresh(userId: string, providedRefreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true, supervisorProfile: true },
    });
    if (!user || !user.refreshTokenHash) throw AppException.invalidCredentials();

    const matches = await argon2.verify(user.refreshTokenHash, providedRefreshToken);
    if (!matches) {
      // Reutilisation d'un refresh token perime/vole : on invalide la session par precaution.
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw AppException.invalidCredentials();
    }

    return this.issueTokenPair(user);
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

    const firstName = await this.resolveFirstName(user.id);
    const inviteUrl = `${this.config.get<string>('frontendUrl')}/invitation/accept?token=${raw}`;

    await this.notifications.send({
      userId: user.id,
      type: 'ACCOUNT_INVITATION',
      title: 'Invitation à rejoindre la plateforme',
      message: 'Un email d\'invitation vous a été envoyé pour activer votre compte.',
      emailHtml: emailTemplates.invitation(firstName, inviteUrl),
      emailSubject: 'Activez votre compte GeSuiMagiC- Suivi de Chantier',
    });
  }

  async acceptInvitation(rawToken: string, newPassword: string, meta: RequestMeta) {
    const hash = hashToken(rawToken);
    const user = await this.prisma.user.findFirst({ where: { invitationTokenHash: hash } });
    if (!user || !user.invitationTokenExpiresAt || user.invitationTokenExpiresAt < new Date()) {
      throw AppException.invalidOrExpiredToken();
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
        invitationTokenHash: null,
        invitationTokenExpiresAt: null,
      },
    });

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

    const { raw, hash } = generateSecureToken();
    const expiresAt = addHours(new Date(), 2);
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
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw AppException.invalidOrExpiredToken();
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, refreshTokenHash: null },
    });

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
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, refreshTokenHash: null } });

    await this.audit.log({
      userId,
      userRole: user.role,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: userId,
      reason: 'Changement volontaire par l\'utilisateur',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------
  private async issueTokenPair(user: {
    id: string;
    email: string;
    role: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
    clientProfile?: { id: string } | null;
    supervisorProfile?: { id: string } | null;
  }): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clientProfileId: user.clientProfile?.id,
      supervisorProfileId: user.supervisorProfile?.id,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
    });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });

    return { accessToken, refreshToken };
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
