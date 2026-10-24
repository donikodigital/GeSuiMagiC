//frontend/src/lib/site-access.ts
// Droits par fonction sur un chantier. Miroir de l'affichage seulement : le serveur reste l'autorite
// (il refuse toute action non permise), ces regles servent a ne proposer que les boutons utiles.

import type { Project } from '@/types/models';

export type SiteRoleValue = NonNullable<Project['siteRole']>;

export interface SitePermissions {
  role: SiteRoleValue | null;
  /** Saisie terrain : journal, avancement, livraisons, presences, paie. */
  fieldWrite: boolean;
  /** Validation technique (conducteur de travaux, architecte). */
  techReview: boolean;
  /** Decision (client, conducteur de travaux, architecte) : avancement, situations, PV. */
  decide: boolean;
  /** Engagements financiers : client et superadmin. */
  owner: boolean;
  isClient: boolean;
  isArchitect: boolean;
  isSiteManager: boolean;
  /** Peut proposer un avenant (tout le monde sauf le client). */
  proposeChangeOrder: boolean;
  /** Passer commande : terrain + client. */
  order: boolean;
  /** Fiche fournisseur : creation ouverte au terrain et au client, modification client + conducteur. */
  createSupplier: boolean;
  editSupplier: boolean;
  /** Modifier le planning d'une etape : client, superadmin, conducteur de travaux. */
  editPlanning: boolean;
  /** Ecrire dans le journal : terrain + architecte. */
  writeLog: boolean;
  /** Lever / declarer une reserve : tout contributeur. */
  contribute: boolean;
}

export function sitePermissions(role: Project['siteRole'] | undefined): SitePermissions {
  const r = role ?? null;
  const is = (...list: SiteRoleValue[]) => r !== null && list.includes(r);
  return {
    role: r,
    fieldWrite: is('SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER'),
    techReview: is('SUPERADMIN', 'SITE_MANAGER', 'ARCHITECT'),
    decide: is('SUPERADMIN', 'CLIENT', 'SITE_MANAGER', 'ARCHITECT'),
    owner: is('SUPERADMIN', 'CLIENT'),
    isClient: r === 'CLIENT',
    isArchitect: r === 'ARCHITECT',
    isSiteManager: r === 'SITE_MANAGER',
    proposeChangeOrder: is('SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT'),
    order: is('SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER', 'CLIENT'),
    createSupplier: is('SUPERADMIN', 'CLIENT', 'SUPERVISOR', 'SITE_MANAGER'),
    editSupplier: is('SUPERADMIN', 'CLIENT', 'SITE_MANAGER'),
    editPlanning: is('SUPERADMIN', 'CLIENT', 'SITE_MANAGER'),
    writeLog: is('SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT'),
    contribute: r !== null,
  };
}
