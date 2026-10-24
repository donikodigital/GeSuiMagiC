//backend/src/site-common/site-access.ts
import { SupervisorPosition } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { getPosition } from '../common/utils/technical-review.util';

/** Role d'un acteur SUR UN PROJET : les superviseurs sont distingues par leur fonction sur ce chantier. */
export type SiteRole = 'SUPERADMIN' | 'CLIENT' | SupervisorPosition;

/** Saisie terrain (journal, avancement, livraisons, presences...). Le client lit et valide, l'architecte controle. */
export const FIELD_WRITERS: readonly SiteRole[] = ['SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER'];
/** Validation technique : conducteur de travaux, architecte (ou superadmin). */
export const TECHNICAL_REVIEWERS: readonly SiteRole[] = ['SUPERADMIN', 'SITE_MANAGER', 'ARCHITECT'];
/** Decision sur le projet : le client decide toujours, avec les responsables techniques. */
export const DECISION_MAKERS: readonly SiteRole[] = ['SUPERADMIN', 'CLIENT', 'SITE_MANAGER', 'ARCHITECT'];
/** Engagements financiers (marches, budgets) : client et superadmin uniquement. */
export const OWNERS: readonly SiteRole[] = ['SUPERADMIN', 'CLIENT'];
/** Tout acteur qui peut contribuer (saisie terrain, client, architecte pour ses reserves). */
export const CONTRIBUTORS: readonly SiteRole[] = ['SUPERADMIN', 'CLIENT', 'SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT'];

export async function getSiteRole(client: PrismaService | TxClient, projectId: string, actor: AuthenticatedUser): Promise<SiteRole> {
  if (actor.role === 'SUPERADMIN') return 'SUPERADMIN';
  if (actor.role === 'CLIENT') return 'CLIENT';
  const position = await getPosition(client, projectId, actor.supervisorProfileId);
  if (!position) throw AppException.forbiddenProjectAccess();
  return position;
}

export function assertSiteRole(role: SiteRole, allowed: readonly SiteRole[], message = "Votre fonction sur ce chantier ne permet pas cette action."): void {
  if (!allowed.includes(role)) throw AppException.forbidden('ROLE_NOT_ALLOWED', message);
}

export function isOneOf(role: SiteRole, allowed: readonly SiteRole[]): boolean {
  return allowed.includes(role);
}
