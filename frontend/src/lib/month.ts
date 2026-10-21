//frontend/src/lib/month.ts
// Mois "AAAA-MM" et dates "AAAA-MM-JJ" : manipules comme des chaines (calendaires, sans fuseau)
// pour qu'un jour ne glisse jamais d'une date a l'autre selon le navigateur.

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const pad = (n: number) => String(n).padStart(2, '0');

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function todayIso(now: Date = new Date()): string {
  return `${currentMonth(now)}-${pad(now.getDate())}`;
}

export function isValidMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[m - 1] ?? month;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** 0 = lundi ... 6 = dimanche, pour le 1er du mois. */
export function firstWeekdayOffset(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
}

export function dayIso(month: string, day: number): string {
  return `${month}-${pad(day)}`;
}

export function dayLabel(iso: string): string {
  const [year, m, d] = iso.split('-').map(Number);
  const weekday = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(Date.UTC(year, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTH_NAMES[m - 1]} ${year}`;
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (b - a). */
export function diffDays(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
