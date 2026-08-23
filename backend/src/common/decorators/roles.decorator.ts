import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restreint un handler a une liste de roles (RBAC, section 56).
 * Utiliser avec RolesGuard. Exemple : @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
