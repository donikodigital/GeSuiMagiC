import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
  clientProfileId?: string; // present si role CLIENT
  supervisorProfileId?: string; // present si role SUPERVISOR
}

/** Injecte l'utilisateur authentifie (extrait du JWT) dans un handler de controller. */
export const CurrentUser = createParamDecorator((data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user: AuthenticatedUser = request.user;
  return data ? user?.[data] : user;
});
