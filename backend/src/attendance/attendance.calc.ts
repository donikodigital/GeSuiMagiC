//backend/src/attendance/attendance.calc.ts
import { diffInDays, monthBounds, monthOf, startOfUtcDay, toIsoDate } from '../common/utils/month.util';

/** Ligne minimale d'un jour renseigne (voir WorkDay). */
export interface WorkDayRow {
  date: Date;
  isWorked: boolean;
  workersCount: number;
  phaseId: string | null;
}

export interface AttendanceStats {
  /** Jours travailles. */
  workedDays: number;
  /** Jours renseignes comme NON travailles (pluie, fete, arret...). */
  notWorkedDays: number;
  /** Jours renseignes (travailles ou non). */
  recordedDays: number;
  /** Somme des effectifs des jours travailles (jours-ouvriers). */
  workerDays: number;
}

export function computeStats(rows: WorkDayRow[]): AttendanceStats {
  let workedDays = 0;
  let notWorkedDays = 0;
  let workerDays = 0;
  for (const row of rows) {
    if (row.isWorked) {
      workedDays += 1;
      workerDays += row.workersCount;
    } else {
      notWorkedDays += 1;
    }
  }
  return { workedDays, notWorkedDays, recordedDays: rows.length, workerDays };
}

export interface MonthAttendance extends AttendanceStats {
  month: string;
  daysInMonth: number;
  /** Jours ecoules du mois, aujourd'hui inclus (0 pour un mois futur, tout le mois pour un mois passe). */
  elapsedDays: number;
  /** Jours ecoules sans aucune saisie : le superviseur n'a rien declare. */
  unrecordedDays: number;
  /** Part des jours ecoules effectivement travailles, en % (0 si aucun jour ecoule). */
  attendanceRate: number;
}

/** Statistiques d'un mois a partir des lignes DE CE MOIS. `today` : minuit UTC du jour courant. */
export function monthAttendance(rows: WorkDayRow[], month: string, today: Date = startOfUtcDay()): MonthAttendance {
  const { start, daysInMonth } = monthBounds(month);
  const stats = computeStats(rows);

  const sinceStart = diffInDays(start, today) + 1; // jours depuis le 1er du mois, aujourd'hui inclus
  const elapsedDays = Math.max(0, Math.min(daysInMonth, sinceStart));

  const recordedElapsed = rows.filter((row) => diffInDays(start, row.date) < elapsedDays).length;
  const unrecordedDays = Math.max(0, elapsedDays - recordedElapsed);
  const attendanceRate = elapsedDays === 0 ? 0 : Math.round((stats.workedDays / elapsedDays) * 1000) / 10;

  return { month, daysInMonth, elapsedDays, unrecordedDays, attendanceRate, ...stats };
}

export interface PhaseSummary {
  phaseId: string;
  name: string;
  isActive: boolean;
  workedDays: number;
  workerDays: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Totaux par etape (toutes les etapes sont renvoyees, meme sans jour travaille). */
export function summarizeByPhase(rows: WorkDayRow[], phases: { id: string; name: string; isActive: boolean }[]): PhaseSummary[] {
  return phases.map((phase) => {
    const worked = rows.filter((row) => row.isWorked && row.phaseId === phase.id);
    const dates = worked.map((row) => row.date.getTime()).sort((a, b) => a - b);
    return {
      phaseId: phase.id,
      name: phase.name,
      isActive: phase.isActive,
      workedDays: worked.length,
      workerDays: worked.reduce((total, row) => total + row.workersCount, 0),
      firstDate: dates.length ? toIsoDate(new Date(dates[0])) : null,
      lastDate: dates.length ? toIsoDate(new Date(dates[dates.length - 1])) : null,
    };
  });
}

export interface MonthSummary extends AttendanceStats {
  month: string;
}

/** Totaux par mois (du plus ancien au plus recent), uniquement pour les mois ayant au moins une saisie. */
export function summarizeByMonth(rows: WorkDayRow[]): MonthSummary[] {
  const byMonth = new Map<string, WorkDayRow[]>();
  for (const row of rows) {
    const key = monthOf(row.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }
  return Array.from(byMonth.keys())
    .sort()
    .map((month) => ({ month, ...computeStats(byMonth.get(month)!) }));
}
