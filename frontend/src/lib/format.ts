import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type {
  AnomalyStatus,
  DepositStatus,
  ExpensePaymentStatus,
  ExpenseStatus,
  PaymentMethod,
  ProjectStatus,
  UserStatus,
} from '@/types/models';

export function formatMoney(value: string | number, currency = 'GNF'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return `- ${currency}`;
  return `${new Intl.NumberFormat('fr-FR').format(num)} ${currency}`;
}

/** Meme rendu que formatMoney mais sans le symbole - pour les cellules de tableau denses. */
export function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '-';
  return new Intl.NumberFormat('fr-FR').format(num);
}

export function formatDate(value: string | Date, pattern = 'd MMM yyyy'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return format(date, pattern, { locale: fr });
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, "d MMM yyyy 'a' HH:mm");
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatDistanceToNow(date, { locale: fr, addSuffix: true });
}

// ----------------------------------------------------------------------------
// Libelles et couleurs de statut (utilises par le composant <StatusBadge />)
// ----------------------------------------------------------------------------

type BadgeTone = 'moss' | 'safety' | 'clay' | 'ink' | 'blueprint';

export const projectStatusMeta: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Brouillon', tone: 'ink' },
  PLANNED: { label: 'Planifie', tone: 'blueprint' },
  ACTIVE: { label: 'En cours', tone: 'moss' },
  SUSPENDED: { label: 'Suspendu', tone: 'safety' },
  COMPLETED: { label: 'Termine', tone: 'blueprint' },
  ARCHIVED: { label: 'Archive', tone: 'ink' },
};

export const depositStatusMeta: Record<DepositStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'safety' },
  APPROVED: { label: 'Valide', tone: 'moss' },
  REJECTED: { label: 'Refuse', tone: 'clay' },
  CANCELLED: { label: 'Annule', tone: 'ink' },
};

export const expenseStatusMeta: Record<ExpenseStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Brouillon', tone: 'ink' },
  PENDING: { label: 'En attente', tone: 'safety' },
  APPROVED: { label: 'Validee', tone: 'moss' },
  REJECTED: { label: 'Refusee', tone: 'clay' },
  CANCELLED: { label: 'Annulee', tone: 'ink' },
};

export const expensePaymentStatusMeta: Record<ExpensePaymentStatus, { label: string; tone: BadgeTone }> = {
  PAID_FULL: { label: 'Paye', tone: 'moss' },
  PARTIAL: { label: 'Acompte verse', tone: 'safety' },
  CREDIT: { label: 'A credit', tone: 'clay' },
};

export const anomalyStatusMeta: Record<AnomalyStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Ouvert', tone: 'clay' },
  INVESTIGATING: { label: 'En investigation', tone: 'safety' },
  RESOLVED: { label: 'Resolu', tone: 'moss' },
  REJECTED: { label: 'Rejete', tone: 'ink' },
};

export const userStatusMeta: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  INVITED: { label: 'Invite', tone: 'safety' },
  ACTIVE: { label: 'Actif', tone: 'moss' },
  SUSPENDED: { label: 'Suspendu', tone: 'clay' },
  DISABLED: { label: 'Desactive', tone: 'ink' },
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: 'Especes',
  BANK_TRANSFER: 'Virement bancaire',
  MOBILE_MONEY: 'Mobile Money',
  CHECK: 'Cheque',
  OTHER: 'Autre',
};

export function initials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}
