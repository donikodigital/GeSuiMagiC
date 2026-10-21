//backend/src/common/utils/project-access.util.ts
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { AppException } from '../exceptions/app.exception';

/**
 * Filtre Prisma "projets visibles par cet utilisateur" :
 *  - SUPERADMIN  : tous les projets ;
 *  - CLIENT      : ses projets ;
 *  - SUPERVISOR  : les projets ou il a une affectation ACTIVE.
 *
 * Fail-closed : un profil manquant leve une exception au lieu de produire
 * `{ clientId: undefined }`, que Prisma traite comme "aucun filtre" (donc
 * TOUS les projets de TOUS les clients).
 */
export function projectAccessFilter(user: AuthenticatedUser): Prisma.ProjectWhereInput {
  switch (user.role) {
    case 'SUPERADMIN':
      return {};
    case 'CLIENT':
      if (!user.clientProfileId) throw AppException.forbiddenProjectAccess();
      return { clientId: user.clientProfileId };
    case 'SUPERVISOR':
      if (!user.supervisorProfileId) throw AppException.forbiddenProjectAccess();
      return { supervisors: { some: { supervisorId: user.supervisorProfileId, status: 'ACTIVE' } } };
    default:
      throw AppException.forbiddenProjectAccess();
  }
}
