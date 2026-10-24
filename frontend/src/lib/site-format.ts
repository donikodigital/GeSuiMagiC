//frontend/src/lib/site-format.ts
// Libelles et couleurs des statuts du suivi de chantier.
import { formatDate } from '@/lib/format';
import type {
  ChangeOrderStatus,
  ContractPaymentType,
  ContractStatus,
  DocumentExpiryStatus,
  PayRunStatus,
  ProjectDocumentType,
  PurchaseOrderStatus,
  QuoteLotStatus,
  ReceptionType,
  ReviewStatus,
  ScheduleStatus,
  SiteRole,
  SnagSeverity,
  SnagStatus,
  StatementStatus,
  StockMovementType,
  SupplierKind,
  SupplierQuoteStatus,
  TechReviewStatus,
  WeatherCondition,
  WorkStopReason,
} from '@/types/site';

export type Tone = 'moss' | 'safety' | 'clay' | 'ink' | 'blueprint';
type Meta = { label: string; tone: Tone };

/** Nombre a partir d'un decimal serveur (chaine) ; 0 si absent. */
export function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Quantite sans zeros inutiles (12,500 -> 12,5). */
export function formatQty(value: string | number | null | undefined): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(toNum(value));
}

export const siteRoleLabels: Record<SiteRole, string> = {
  SUPERADMIN: 'Administrateur',
  CLIENT: 'Client',
  SUPERVISOR: 'Superviseur',
  SITE_MANAGER: 'Conducteur de travaux',
  ARCHITECT: 'Architecte',
};

export const scheduleStatusMeta: Record<ScheduleStatus, Meta> = {
  DONE: { label: 'Terminée', tone: 'moss' },
  LATE: { label: 'En retard', tone: 'clay' },
  AT_RISK: { label: 'À risque', tone: 'safety' },
  ON_TRACK: { label: 'Dans les temps', tone: 'moss' },
  NOT_STARTED: { label: 'Pas commencée', tone: 'ink' },
  UNPLANNED: { label: 'Non planifiée', tone: 'ink' },
};

export const reviewStatusMeta: Record<ReviewStatus, Meta> = {
  PENDING: { label: 'À valider', tone: 'safety' },
  VALIDATED: { label: 'Validé', tone: 'moss' },
  REJECTED: { label: 'Refusé', tone: 'clay' },
};

export const techReviewMeta: Record<TechReviewStatus, Meta> = {
  NOT_REQUIRED: { label: 'Non requise', tone: 'ink' },
  PENDING: { label: 'Validation technique en attente', tone: 'safety' },
  APPROVED: { label: 'Validée techniquement', tone: 'moss' },
  REJECTED: { label: 'Refusée techniquement', tone: 'clay' },
};

export const changeOrderStatusMeta: Record<ChangeOrderStatus, Meta> = {
  PENDING: { label: 'En attente du client', tone: 'safety' },
  APPROVED: { label: 'Approuvé', tone: 'moss' },
  REJECTED: { label: 'Refusé', tone: 'clay' },
  CANCELLED: { label: 'Annulé', tone: 'ink' },
};

export const snagSeverityMeta: Record<SnagSeverity, Meta> = {
  MINOR: { label: 'Mineure', tone: 'ink' },
  MAJOR: { label: 'Majeure', tone: 'safety' },
  CRITICAL: { label: 'Critique', tone: 'clay' },
};

export const snagStatusMeta: Record<SnagStatus, Meta> = {
  OPEN: { label: 'Ouverte', tone: 'clay' },
  FIXED: { label: 'Levée, à confirmer', tone: 'safety' },
  CLOSED: { label: 'Clôturée', tone: 'moss' },
};

export const receptionTypeLabels: Record<ReceptionType, string> = {
  PHASE: "Réception d'étape",
  PROVISIONAL: 'Réception provisoire',
  FINAL: 'Réception définitive',
};

export const supplierKindLabels: Record<SupplierKind, string> = { SUPPLIER: 'Fournisseur', SUBCONTRACTOR: 'Sous-traitant' };

export const quoteLotStatusMeta: Record<QuoteLotStatus, Meta> = {
  OPEN: { label: 'Consultation en cours', tone: 'blueprint' },
  AWARDED: { label: 'Attribué', tone: 'moss' },
  CLOSED: { label: 'Clos', tone: 'ink' },
};

export const quoteStatusMeta: Record<SupplierQuoteStatus, Meta> = {
  SUBMITTED: { label: 'Reçu', tone: 'blueprint' },
  SELECTED: { label: 'Retenu', tone: 'moss' },
  REJECTED: { label: 'Écarté', tone: 'ink' },
};

export const contractStatusMeta: Record<ContractStatus, Meta> = {
  ACTIVE: { label: 'En cours', tone: 'moss' },
  COMPLETED: { label: 'Terminé', tone: 'blueprint' },
  CANCELLED: { label: 'Annulé', tone: 'ink' },
};

export const statementStatusMeta: Record<StatementStatus, Meta> = {
  SUBMITTED: { label: 'À valider', tone: 'safety' },
  VALIDATED: { label: 'Validée', tone: 'moss' },
  REJECTED: { label: 'Refusée', tone: 'clay' },
};

export const contractPaymentLabels: Record<ContractPaymentType, string> = {
  ADVANCE: 'Acompte',
  STATEMENT: 'Situation de travaux',
  RETENTION_RELEASE: 'Retenue de garantie',
  OTHER: 'Autre paiement',
};

export const orderStatusMeta: Record<PurchaseOrderStatus, Meta> = {
  ORDERED: { label: 'Commandée', tone: 'blueprint' },
  PARTIAL: { label: 'Livrée en partie', tone: 'safety' },
  DELIVERED: { label: 'Livrée', tone: 'moss' },
  CANCELLED: { label: 'Annulée', tone: 'ink' },
};

export const stockMovementLabels: Record<StockMovementType, string> = {
  IN: 'Entrée (livraison)',
  OUT: 'Consommation',
  ADJUSTMENT: "Correction d'inventaire",
  LOSS: 'Perte',
};

export const payRunStatusMeta: Record<PayRunStatus, Meta> = {
  DRAFT: { label: 'Brouillon', tone: 'ink' },
  SUBMITTED: { label: 'Soumise', tone: 'moss' },
};

export const documentTypeLabels: Record<ProjectDocumentType, string> = {
  PERMIT: 'Permis / autorisation',
  PLAN: 'Plans',
  CONTRACT: 'Contrat',
  INSURANCE: 'Assurance',
  WARRANTY: 'Garantie',
  TAX: 'Fiscal',
  OTHER: 'Autre',
};

export const documentStatusMeta: Record<DocumentExpiryStatus, Meta> = {
  NO_EXPIRY: { label: 'Sans échéance', tone: 'ink' },
  VALID: { label: 'Valide', tone: 'moss' },
  EXPIRING: { label: 'Expire bientôt', tone: 'safety' },
  EXPIRED: { label: 'Expiré', tone: 'clay' },
};

export const stopReasonLabels: Record<WorkStopReason | 'UNSPECIFIED', string> = {
  RAIN: 'Pluie',
  HOLIDAY: 'Jour férié / repos',
  MATERIAL_SHORTAGE: 'Rupture de matériaux',
  EQUIPMENT_BREAKDOWN: 'Panne de matériel',
  PAYMENT_DELAY: 'Retard de paiement',
  SAFETY: 'Sécurité',
  OTHER: 'Autre raison',
  UNSPECIFIED: 'Non précisée',
};

export const weatherLabels: Record<WeatherCondition, string> = {
  SUNNY: 'Ensoleillé',
  CLOUDY: 'Nuageux',
  RAIN: 'Pluie',
  HEAVY_RAIN: 'Forte pluie',
  WINDY: 'Venteux',
};

/** « 3 jours » / « demain » / « hier » pour une echeance. */
export function daysLabel(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  return days > 0 ? `dans ${days} jours` : `il y a ${Math.abs(days)} jours`;
}

/** Date calendaire AAAA-MM-JJ affichee sans decalage de fuseau. */
export function formatDay(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return formatDate(new Date(y, m - 1, d), pattern);
}

/** Jours entre deux dates calendaires AAAA-MM-JJ (b - a). */
export function dayDiff(a: string, b: string): number {
  const parse = (v: string) => {
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}
