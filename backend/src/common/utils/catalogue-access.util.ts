//backend/src/common/utils/catalogue-access.util.ts
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { AppException } from '../exceptions/app.exception';

/**
 * Catalogue (categories, materiaux, unites) par client.
 *
 * Une entree a un `ownerClientId` :
 *  - null    -> entree GLOBALE, geree par le superadmin, visible de tous ;
 *  - un id   -> entree PRIVEE de ce client, visible de lui, de ses
 *               superviseurs et du superadmin uniquement.
 * Avant, tout client ou superviseur pouvait creer des entrees visibles de
 * TOUS les autres clients (pollution du catalogue + fuite d'information).
 */

/** Forme de filtre Prisma compatible avec les 3 modeles du catalogue. */
export interface CatalogueFilter {
  OR?: Array<{ ownerClientId: string | null }>;
}

/** Client dont le catalogue prive est accessible a l'utilisateur (fail-closed). */
function tenantOf(user: AuthenticatedUser): string {
  if (!user.tenantClientId) throw AppException.forbiddenProjectAccess();
  return user.tenantClientId;
}

/** Filtre "entrees visibles par cet utilisateur" : globales + privees de son client ; tout pour le superadmin. */
export function catalogueReadFilter(user: AuthenticatedUser): CatalogueFilter {
  if (user.role === 'SUPERADMIN') return {};
  return { OR: [{ ownerClientId: null }, { ownerClientId: tenantOf(user) }] };
}

/** Une entree est-elle visible par cet utilisateur ? */
export function canReadCatalogueEntry(user: AuthenticatedUser, ownerClientId: string | null): boolean {
  if (user.role === 'SUPERADMIN') return true;
  return ownerClientId === null || ownerClientId === tenantOf(user);
}

/** Proprietaire d'une nouvelle entree : le superadmin cree du global (ou pour un client donne), les autres pour leur client. */
export function resolveCatalogueOwner(user: AuthenticatedUser, requestedOwnerClientId?: string | null): string | null {
  if (user.role === 'SUPERADMIN') return requestedOwnerClientId ?? null;
  const tenant = tenantOf(user);
  if (requestedOwnerClientId && requestedOwnerClientId !== tenant) {
    throw AppException.forbidden('CATALOGUE_FORBIDDEN', "Vous ne pouvez creer d'entree que pour votre propre catalogue.");
  }
  return tenant;
}

/**
 * Verifie que l'utilisateur peut LIRE puis MODIFIER l'entree.
 * Invisible -> 404 (on ne revele pas l'existence du catalogue d'un autre client) ;
 * visible mais globale (ou non possedee) -> 403.
 */
export function assertCanManageCatalogueEntry(user: AuthenticatedUser, ownerClientId: string | null, label: string): void {
  if (!canReadCatalogueEntry(user, ownerClientId)) throw AppException.notFound(label);
  if (user.role === 'SUPERADMIN') return;
  if (user.role !== 'CLIENT' || ownerClientId === null || ownerClientId !== user.clientProfileId) {
    throw AppException.forbidden('CATALOGUE_FORBIDDEN', 'Cette entree du catalogue global ne peut etre modifiee que par le superadmin.');
  }
}

/** Une entree de proprietaire `entryOwner` est-elle utilisable pour les donnees du client `clientId` ? */
export function isCatalogueEntryUsableBy(entryOwner: string | null, clientId: string): boolean {
  return entryOwner === null || entryOwner === clientId;
}

/**
 * Coherence parent/enfant : un materiau (enfant) d'un proprietaire donne ne peut referencer qu'une
 * categorie/unite (parent) globale ou du MEME proprietaire. Un materiau global ne peut donc pas
 * pointer vers un parent prive (cela exposerait le catalogue d'un client a tous).
 */
export function isParentCompatible(childOwner: string | null, parentOwner: string | null): boolean {
  return parentOwner === null || parentOwner === childOwner;
}
