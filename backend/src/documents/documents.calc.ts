//backend/src/documents/documents.calc.ts
import { diffInDays } from '../common/utils/month.util';

/** Seuils d'alerte d'expiration, en jours avant l'echeance (0 = jour de l'expiration ou apres). */
export const EXPIRY_ALERT_THRESHOLDS = [60, 30, 14, 7, 0] as const;

export type DocumentStatus = 'NO_EXPIRY' | 'VALID' | 'EXPIRING' | 'EXPIRED';

/** Jours restants avant l'expiration (negatif si expire), null sans date d'expiration. */
export function daysUntil(expiresAt: Date | null, today: Date): number | null {
  return expiresAt ? diffInDays(today, expiresAt) : null;
}

/** EXPIRING = expire dans moins de 60 jours. */
export function documentStatus(expiresAt: Date | null, today: Date): DocumentStatus {
  const days = daysUntil(expiresAt, today);
  if (days === null) return 'NO_EXPIRY';
  if (days < 0) return 'EXPIRED';
  return days <= EXPIRY_ALERT_THRESHOLDS[0] ? 'EXPIRING' : 'VALID';
}

/**
 * Seuil d'alerte a envoyer maintenant, ou null. Une alerte par seuil franchi : on n'envoie que si le seuil atteint
 * est plus petit que celui deja notifie (lastAlertDays).
 */
export function alertLevelToSend(expiresAt: Date | null, today: Date, lastAlertDays: number | null): number | null {
  const days = daysUntil(expiresAt, today);
  if (days === null) return null;
  const crossed = EXPIRY_ALERT_THRESHOLDS.filter((threshold) => days <= threshold);
  if (crossed.length === 0) return null;
  const level = Math.min(...crossed);
  return lastAlertDays === null || level < lastAlertDays ? level : null;
}
