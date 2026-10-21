//backend/src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { HttpStatus } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { getCachedIdentity, setCachedIdentity } from '../auth-cache';
import { accountSelect, isAccountUsable, toAuthenticatedUser } from '../account-status.util';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
  clientProfileId?: string;
  supervisorProfileId?: string;
}

/**
 * Le JWT ne sert plus qu'a prouver QUI appelle (claim `sub`). Le role, les
 * profils et surtout l'ETAT du compte sont relus en base (via un cache de
 * quelques secondes, voir auth-cache.ts).
 *
 * Avant, role et profils etaient lus dans le token : un utilisateur suspendu
 * ou desactive gardait donc un acces complet jusqu'a 15 min (duree de l'access
 * token), et un changement de role/profil n'etait pas pris en compte.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Session invalide.');
    }

    const cached = getCachedIdentity(payload.sub);
    if (cached) return cached;

    const account = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: accountSelect });
    // 401 (et non 403) : le client tente un refresh, qui echouera lui aussi
    // (meme regle) et deconnectera proprement l'utilisateur.
    if (!account || !isAccountUsable(account)) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'ACCOUNT_NOT_ACTIVE', "Ce compte n'est pas actif.");
    }

    const user = toAuthenticatedUser(account);
    setCachedIdentity(user);
    return user;
  }
}
