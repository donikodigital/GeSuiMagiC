//backend/src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
  clientProfileId?: string; // present si role CLIENT
  supervisorProfileId?: string; // present si role SUPERVISOR
  /**
   * Client proprietaire des donnees : le client lui-meme (role CLIENT) ou le
   * client auquel le superviseur est rattache (role SUPERVISOR). Absent pour
   * le SUPERADMIN. Sert a cloisonner les donnees par client (ex: catalogue).
   */
  tenantClientId?: string;
}

/** Injecte l'utilisateur authentifie (relu en base par JwtStrategy) dans un handler de controller. */
export const CurrentUser = createParamDecorator((data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user: AuthenticatedUser = request.user;
  return data ? user?.[data] : user;
});
