//backend/src/progress/progress.calc.spec.ts
import { clampPercent, computeProjectProgress, evaluateSchedule, forecastAtCompletion, projectedEnd, summarizeStopReasons } from './progress.calc';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('computeProjectProgress', () => {
  it('fait la moyenne a poids egaux sans budgets par etape', () => {
    expect(
      computeProjectProgress([
        { progressPercent: 100, budgetAmount: null, isActive: true },
        { progressPercent: 50, budgetAmount: null, isActive: true },
        { progressPercent: 0, budgetAmount: null, isActive: true },
      ]),
    ).toBe(50);
  });

  it('pondere par le budget quand toutes les etapes en ont un', () => {
    expect(
      computeProjectProgress([
        { progressPercent: 100, budgetAmount: '10', isActive: true },
        { progressPercent: 0, budgetAmount: '90', isActive: true },
      ]),
    ).toBe(10);
  });

  it('repasse a poids egaux si une seule etape n\'a pas de budget', () => {
    expect(
      computeProjectProgress([
        { progressPercent: 100, budgetAmount: '10', isActive: true },
        { progressPercent: 0, budgetAmount: null, isActive: true },
      ]),
    ).toBe(50);
  });

  it('ignore les etapes inactives et renvoie 0 sans etape active', () => {
    expect(computeProjectProgress([{ progressPercent: 100, budgetAmount: null, isActive: false }])).toBe(0);
    expect(computeProjectProgress([])).toBe(0);
    expect(
      computeProjectProgress([
        { progressPercent: 80, budgetAmount: null, isActive: true },
        { progressPercent: 0, budgetAmount: null, isActive: false },
      ]),
    ).toBe(80);
  });

  it('borne les pourcentages', () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe('evaluateSchedule', () => {
  const phase = { plannedStart: d('2026-10-01'), plannedEnd: d('2026-10-10'), actualEnd: null };

  it('est non planifiee sans date de fin', () => {
    expect(evaluateSchedule({ plannedStart: null, plannedEnd: null, progressPercent: 10, actualEnd: null }, d('2026-10-05')).status).toBe('UNPLANNED');
  });

  it('est terminee a 100 % avec son retard reel', () => {
    const result = evaluateSchedule({ ...phase, progressPercent: 100, actualEnd: d('2026-10-14') }, d('2026-10-20'));
    expect(result).toEqual({ status: 'DONE', expectedPercent: 100, delayDays: 4 });
    expect(evaluateSchedule({ ...phase, progressPercent: 100, actualEnd: d('2026-10-08') }, d('2026-10-20')).delayDays).toBe(0);
  });

  it('est en retard quand la fin prevue est depassee', () => {
    const result = evaluateSchedule({ ...phase, progressPercent: 60 }, d('2026-10-13'));
    expect(result).toEqual({ status: 'LATE', expectedPercent: 100, delayDays: 3 });
  });

  it('n\'a pas commence avant la date de debut', () => {
    expect(evaluateSchedule({ ...phase, progressPercent: 0 }, d('2026-09-20'))).toEqual({ status: 'NOT_STARTED', expectedPercent: 0, delayDays: 0 });
  });

  it('est a risque quand l\'avancement est 15 points sous le planning', () => {
    // jour 5 sur 10 -> 50 % attendus
    const risky = evaluateSchedule({ ...phase, progressPercent: 30 }, d('2026-10-05'));
    expect(risky.status).toBe('AT_RISK');
    expect(risky.expectedPercent).toBe(50);
    expect(risky.delayDays).toBe(2);
    expect(evaluateSchedule({ ...phase, progressPercent: 40 }, d('2026-10-05')).status).toBe('ON_TRACK');
  });

  it('est dans les temps en avance sur le planning', () => {
    expect(evaluateSchedule({ ...phase, progressPercent: 90 }, d('2026-10-05')).status).toBe('ON_TRACK');
  });
});

describe('projectedEnd', () => {
  it('prend la fin la plus tardive decalee du retard', () => {
    expect(
      projectedEnd([
        { plannedEnd: d('2026-10-10'), delayDays: 0 },
        { plannedEnd: d('2026-10-08'), delayDays: 5 },
        { plannedEnd: null, delayDays: 9 },
      ]),
    ).toEqual(d('2026-10-13'));
    expect(projectedEnd([])).toBeNull();
  });
});

describe('forecastAtCompletion', () => {
  it('extrapole la depense a 100 %', () => {
    const result = forecastAtCompletion('4000000', 40, '12000000');
    expect(result.forecast?.toString()).toBe('10000000');
    expect(result.variance?.toString()).toBe('2000000');
  });

  it('annonce un depassement par une variance negative', () => {
    expect(forecastAtCompletion('6000000', 50, '10000000').variance?.toString()).toBe('-2000000');
  });

  it('ne prevoit rien sous 10 % d\'avancement', () => {
    expect(forecastAtCompletion('500000', 5, '10000000')).toEqual({ forecast: null, variance: null });
  });

  it('est egal au reel a 100 %', () => {
    expect(forecastAtCompletion('9000000', 100, '10000000').forecast?.toString()).toBe('9000000');
  });

  it('calcule la prevision sans budget mais pas d\'ecart', () => {
    const result = forecastAtCompletion('1000', 50, null);
    expect(result.forecast?.toString()).toBe('2000');
    expect(result.variance).toBeNull();
  });
});

describe('summarizeStopReasons', () => {
  it('compte les jours non travailles par raison, du plus frequent au moins frequent', () => {
    const stats = summarizeStopReasons([
      { isWorked: true, stopReason: null },
      { isWorked: false, stopReason: 'RAIN' },
      { isWorked: false, stopReason: 'RAIN' },
      { isWorked: false, stopReason: 'MATERIAL_SHORTAGE' },
      { isWorked: false, stopReason: null },
    ]);
    expect(stats).toEqual([
      { reason: 'RAIN', days: 2 },
      { reason: 'MATERIAL_SHORTAGE', days: 1 },
      { reason: 'UNSPECIFIED', days: 1 },
    ]);
  });
});
