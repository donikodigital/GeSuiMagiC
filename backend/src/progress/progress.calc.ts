//backend/src/progress/progress.calc.ts
import { Prisma, WorkStopReason } from '@prisma/client';
import { addDays, diffInDays } from '../common/utils/month.util';
import { roundMoney, toDecimal } from '../common/utils/money.util';

type MoneyLike = Prisma.Decimal | number | string;

// ---------------------------------------------------------------------------
// Avancement global
// ---------------------------------------------------------------------------

export interface PhaseProgressInput {
  progressPercent: number;
  budgetAmount: MoneyLike | null;
  isActive: boolean;
}

/**
 * Avancement du projet (0-100) : moyenne des etapes ACTIVES.
 * Ponderee par le budget des etapes quand TOUTES en ont un (une etape a 40 % du budget pese 40 %),
 * sinon a poids egaux. Sans etape active : 0.
 */
export function computeProjectProgress(phases: PhaseProgressInput[]): number {
  const active = phases.filter((p) => p.isActive);
  if (active.length === 0) return 0;

  const budgets = active.map((p) => (p.budgetAmount == null ? null : toDecimal(p.budgetAmount)));
  const weighted = budgets.every((b) => b !== null && b.greaterThan(0));

  let sum = toDecimal(0);
  let weights = toDecimal(0);
  active.forEach((phase, index) => {
    const weight = weighted ? (budgets[index] as Prisma.Decimal) : toDecimal(1);
    sum = sum.add(weight.mul(clampPercent(phase.progressPercent)));
    weights = weights.add(weight);
  });
  return Math.round(sum.div(weights).toNumber());
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Planning : retard / avance par etape
// ---------------------------------------------------------------------------

export type ScheduleStatus = 'DONE' | 'LATE' | 'AT_RISK' | 'ON_TRACK' | 'NOT_STARTED' | 'UNPLANNED';

export interface ScheduleInput {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  progressPercent: number;
  /** Date a laquelle l'etape a atteint 100 % (avancement valide), si c'est le cas. */
  actualEnd: Date | null;
}

export interface ScheduleResult {
  status: ScheduleStatus;
  /** Avancement attendu aujourd'hui d'apres le planning (lineaire entre debut et fin prevus). */
  expectedPercent: number | null;
  /** Jours de retard (0 si dans les temps). */
  delayDays: number;
}

/** Ecart d'avancement (en points) au-dela duquel une etape est dite « a risque ». */
export const AT_RISK_GAP_POINTS = 15;

export function evaluateSchedule(input: ScheduleInput, today: Date): ScheduleResult {
  const progress = clampPercent(input.progressPercent);
  const { plannedStart, plannedEnd } = input;

  if (progress >= 100) {
    const delay = plannedEnd && input.actualEnd ? Math.max(0, diffInDays(plannedEnd, input.actualEnd)) : 0;
    return { status: 'DONE', expectedPercent: 100, delayDays: delay };
  }
  if (!plannedEnd) return { status: 'UNPLANNED', expectedPercent: null, delayDays: 0 };

  const start = plannedStart ?? plannedEnd;
  const durationDays = Math.max(1, diffInDays(start, plannedEnd) + 1);
  let expected: number;
  if (today.getTime() < start.getTime()) expected = 0;
  else if (today.getTime() > plannedEnd.getTime()) expected = 100;
  else expected = clampPercent(((diffInDays(start, today) + 1) / durationDays) * 100);

  if (today.getTime() > plannedEnd.getTime()) {
    return { status: 'LATE', expectedPercent: 100, delayDays: diffInDays(plannedEnd, today) };
  }
  if (today.getTime() < start.getTime()) {
    return { status: 'NOT_STARTED', expectedPercent: 0, delayDays: 0 };
  }
  if (expected - progress >= AT_RISK_GAP_POINTS) {
    return { status: 'AT_RISK', expectedPercent: expected, delayDays: Math.max(1, Math.round(((expected - progress) / 100) * durationDays)) };
  }
  return { status: 'ON_TRACK', expectedPercent: expected, delayDays: 0 };
}

/** Date de fin projetee du projet : la plus tardive des fins d'etapes decalees de leur retard. */
export function projectedEnd(items: { plannedEnd: Date | null; delayDays: number }[]): Date | null {
  let latest: Date | null = null;
  for (const item of items) {
    if (!item.plannedEnd) continue;
    const candidate = addDays(item.plannedEnd, item.delayDays);
    if (!latest || candidate.getTime() > latest.getTime()) latest = candidate;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Prevision de cout a l'achevement
// ---------------------------------------------------------------------------

/** Avancement minimal pour qu'une extrapolation de cout soit jugee fiable. */
export const MIN_PROGRESS_FOR_FORECAST = 10;

export interface Forecast {
  forecast: Prisma.Decimal | null;
  /** budget - prevision : negatif = depassement prevu. */
  variance: Prisma.Decimal | null;
}

/**
 * Cout final prevu d'une etape : depense engagee ramenee a 100 % d'avancement.
 * Non calcule sous 10 % d'avancement (extrapolation trop incertaine) ; egal au reel a 100 %.
 */
export function forecastAtCompletion(spent: MoneyLike, progressPercent: number, budget: MoneyLike | null): Forecast {
  const progress = clampPercent(progressPercent);
  let forecast: Prisma.Decimal | null = null;
  if (progress >= 100) forecast = roundMoney(spent);
  else if (progress >= MIN_PROGRESS_FOR_FORECAST) forecast = roundMoney(toDecimal(spent).mul(100).div(progress));
  const variance = forecast && budget != null ? roundMoney(toDecimal(budget).sub(forecast)) : null;
  return { forecast, variance };
}

// ---------------------------------------------------------------------------
// Raisons d'arret
// ---------------------------------------------------------------------------

export type StopReasonKey = WorkStopReason | 'UNSPECIFIED';

export interface StopReasonStat {
  reason: StopReasonKey;
  days: number;
}

/** Nombre de jours non travailles par raison d'arret (jours sans raison regroupes sous UNSPECIFIED), du plus frequent au moins frequent. */
export function summarizeStopReasons(rows: { isWorked: boolean; stopReason: WorkStopReason | null }[]): StopReasonStat[] {
  const counts = new Map<StopReasonKey, number>();
  for (const row of rows) {
    if (row.isWorked) continue;
    const key: StopReasonKey = row.stopReason ?? 'UNSPECIFIED';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, days]) => ({ reason, days })).sort((a, b) => b.days - a.days || a.reason.localeCompare(b.reason));
}
