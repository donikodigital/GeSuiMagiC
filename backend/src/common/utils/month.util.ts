//backend/src/common/utils/month.util.ts

/**
 * Dates calendaires et mois ("YYYY-MM") du suivi de chantier.
 * Tout est calcule en UTC : un jour travaille est une date calendaire (colonne SQL DATE),
 * sans heure ni fuseau, pour qu'un meme jour reste le meme pour le superviseur sur place
 * et pour le client en Europe.
 */

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_REGEX.test(value);
}

/** Index absolu d'un mois (an * 12 + mois), pour comparer et mesurer des ecarts. */
export function monthIndex(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return year * 12 + (mon - 1);
}

export function monthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

export function addMonths(month: string, count: number): string {
  return monthFromIndex(monthIndex(month) + count);
}

/** Mois ("YYYY-MM") d'une date, en UTC. */
export function monthOf(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface MonthBounds {
  /** Premier jour du mois (inclus), minuit UTC. */
  start: Date;
  /** Premier jour du mois suivant (exclu), minuit UTC. */
  end: Date;
  daysInMonth: number;
}

export function monthBounds(month: string): MonthBounds {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end, daysInMonth: Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) };
}

/** Analyse stricte d'une date "YYYY-MM-DD" (refuse "2026-02-30"). Retourne minuit UTC, ou null. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return null;
  const [year, mon, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== mon - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Minuit UTC du jour de `now`. */
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Nombre de jours entre deux dates a minuit UTC (b - a). */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
