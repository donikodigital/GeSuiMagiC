//backend/src/common/utils/technical-review.util.ts
import { SupervisorPosition } from '@prisma/client';
import { PrismaService, TxClient } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

type Client = PrismaService | TxClient;

const TECHNICAL_POSITIONS: SupervisorPosition[] = ['SITE_MANAGER', 'ARCHITECT'];

/** Fonction d'un superviseur sur un projet (null si non affecte ou affectation revoquee). */
export async function getPosition(client: Client, projectId: string, supervisorProfileId: string | undefined): Promise<SupervisorPosition | null> {
  if (!supervisorProfileId) return null;
  const assignment = await client.projectSupervisor.findFirst({
    where: { projectId, supervisorId: supervisorProfileId, status: 'ACTIVE' },
    select: { position: true },
  });
  return assignment?.position ?? null;
}

/**
 * Validation technique (avancement, reserves, depenses importantes) : conducteur de travaux ou architecte affecte au
 * projet, ou superadmin. Le client peut toujours decider de son propre projet, mais ce n'est pas une validation technique.
 */
export async function isTechnicalReviewer(client: Client, projectId: string, actor: AuthenticatedUser): Promise<boolean> {
  if (actor.role === 'SUPERADMIN') return true;
  if (actor.role !== 'SUPERVISOR') return false;
  const position = await getPosition(client, projectId, actor.supervisorProfileId);
  return position !== null && TECHNICAL_POSITIONS.includes(position);
}

/** Utilisateurs (userId) des responsables techniques actifs d'un projet. */
export async function listTechnicalReviewerUserIds(client: Client, projectId: string): Promise<string[]> {
  const rows = await client.projectSupervisor.findMany({
    where: { projectId, status: 'ACTIVE', position: { in: TECHNICAL_POSITIONS }, supervisor: { user: { status: 'ACTIVE' } } },
    select: { supervisor: { select: { userId: true } } },
  });
  return rows.map((r) => r.supervisor.userId);
}

/** Utilisateur (userId) du client proprietaire du projet. */
export async function getClientUserId(client: Client, clientProfileId: string): Promise<string | null> {
  const owner = await client.clientProfile.findUnique({ where: { id: clientProfileId }, select: { userId: true } });
  return owner?.userId ?? null;
}
