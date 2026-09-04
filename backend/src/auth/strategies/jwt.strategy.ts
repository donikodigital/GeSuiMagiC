//backend/src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
  clientProfileId?: string;
  supervisorProfileId?: string;
}

/**
 * Le payload du JWT embarque directement clientProfileId / supervisorProfileId
 * (fixes a la connexion) pour eviter une requete DB a chaque appel API.
 * Ils sont regeneres a chaque login/refresh, donc restent a jour rapidement
 * en cas de changement (ex: suspension traitee via `status` en DB, verifie
 * separement par les guards/services au besoin critique).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      clientProfileId: payload.clientProfileId,
      supervisorProfileId: payload.supervisorProfileId,
    };
  }
}
