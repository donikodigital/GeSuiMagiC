//backend/src/common/utils/date-range.util.spec.ts
import { buildDateRange } from './date-range.util';

describe('buildDateRange', () => {
  it('renvoie undefined sans borne (aucun filtre)', () => {
    expect(buildDateRange()).toBeUndefined();
    expect(buildDateRange(undefined, undefined)).toBeUndefined();
  });

  it('une borne "to" sans heure INCLUT toute la journee (< lendemain minuit UTC)', () => {
    const range = buildDateRange(undefined, '2026-03-31')!;

    expect(range.lt).toEqual(new Date('2026-04-01T00:00:00.000Z'));
    expect(range.lte).toBeUndefined();
    // Une operation du 31 mars a 18 h reste dans la plage
    expect(new Date('2026-03-31T18:00:00.000Z').getTime()).toBeLessThan((range.lt as Date).getTime());
  });

  it('gere le passage de mois et d\'annee', () => {
    expect(buildDateRange(undefined, '2026-12-31')!.lt).toEqual(new Date('2027-01-01T00:00:00.000Z'));
    expect(buildDateRange(undefined, '2028-02-28')!.lt).toEqual(new Date('2028-02-29T00:00:00.000Z')); // annee bissextile
  });

  it('une borne "to" avec heure est utilisee telle quelle (<=)', () => {
    const range = buildDateRange(undefined, '2026-03-31T10:00:00.000Z')!;

    expect(range.lte).toEqual(new Date('2026-03-31T10:00:00.000Z'));
    expect(range.lt).toBeUndefined();
  });

  it('combine from et to', () => {
    const range = buildDateRange('2026-03-01', '2026-03-31')!;

    expect(range.gte).toEqual(new Date('2026-03-01'));
    expect(range.lt).toEqual(new Date('2026-04-01T00:00:00.000Z'));
  });
});
