//backend/src/attendance/attendance.helpers.ts
import { ProjectStatus } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { assertProjectAcceptsFinancialOperations } from '../common/utils/project-status.util';
import { diffInDays } from '../common/utils/month.util';
import { WORKDAY_EDIT_WINDOW_DAYS } from './attendance.constants';

export interface ProjectLite {
  id: string;
  name: string;
  clientId: string;
  status: ProjectStatus;
  currency: string;
}

/**
 * Le ProjectAccessGuard laisse passer le superadmin sur n'importe quel identifiant :
 * on verifie donc ici que le projet existe (404 sinon, au lieu d'ecrire dans le vide).
 */
export async function findProjectOrThrow(client: PrismaService | TxClient, projectId: string): Promise<ProjectLite> {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, clientId: true, status: true, currency: true },
  });
  if (!project) throw AppException.notFound('Projet');
  return project;
}

/** Un projet suspendu, termine ou archive n'accepte plus de saisie (sauf du superadmin, qui corrige). */
export function assertProjectOpenFor(actor: AuthenticatedUser, status: ProjectStatus): void {
  if (actor.role === 'SUPERADMIN') return;
  assertProjectAcceptsFinancialOperations(status);
}

/**
 * Regles de date d'une saisie de presence :
 *  - jamais dans le futur ;
 *  - un superviseur ne peut saisir/corriger que les WORKDAY_EDIT_WINDOW_DAYS derniers jours.
 * `today` : minuit UTC du jour courant.
 */
export function assertEditableDay(role: AuthenticatedUser['role'], date: Date, today: Date): void {
  if (date.getTime() > today.getTime()) {
    throw AppException.badRequest('FUTURE_DATE', 'Impossible de renseigner un jour à venir.');
  }
  if (role !== 'SUPERADMIN' && diffInDays(date, today) > WORKDAY_EDIT_WINDOW_DAYS) {
    throw AppException.forbidden(
      'WORKDAY_LOCKED',
      `Au-delà de ${WORKDAY_EDIT_WINDOW_DAYS} jours, seul le superadministrateur peut modifier un jour.`,
    );
  }
}
