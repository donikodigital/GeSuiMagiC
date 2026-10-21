//backend/src/common/utils/month.util.spec.ts
import { addDays, addMonths, diffInDays, isValidMonth, monthBounds, monthFromIndex, monthIndex, monthOf, parseIsoDate, startOfUtcDay, toIsoDate } from './month.util';

describe('month.util', () => {
  it('valide le format YYYY-MM', () => {
    expect(isValidMonth('2026-10')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('2026-1')).toBe(false);
    expect(isValidMonth('26-10')).toBe(false);
    expect(isValidMonth(202610)).toBe(false);
  });

  it('calcule les bornes d\'un mois (annees bissextiles comprises)', () => {
    expect(monthBounds('2026-02').daysInMonth).toBe(28);
    expect(monthBounds('2028-02').daysInMonth).toBe(29);
    expect(monthBounds('2026-10').daysInMonth).toBe(31);
    const { start, end } = monthBounds('2026-12');
    expect(toIsoDate(start)).toBe('2026-12-01');
    expect(toIsoDate(end)).toBe('2027-01-01');
  });

  it('additionne des mois en passant les fins d\'annee', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthFromIndex(monthIndex('2026-07'))).toBe('2026-07');
    expect(monthIndex('2027-01') - monthIndex('2026-10')).toBe(3);
  });

  it('retrouve le mois d\'une date UTC', () => {
    expect(monthOf(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
    expect(monthOf(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });

  it('analyse strictement les dates calendaires', () => {
    expect(toIsoDate(parseIsoDate('2026-10-21')!)).toBe('2026-10-21');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-10-21T10:00:00Z')).toBeNull();
    expect(parseIsoDate('21/10/2026')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
    expect(parseIsoDate('2026-02-29')).toBeNull();
  });

  it('manipule les jours a minuit UTC', () => {
    const today = startOfUtcDay(new Date('2026-10-21T22:30:00Z'));
    expect(toIsoDate(today)).toBe('2026-10-21');
    expect(toIsoDate(addDays(today, -14))).toBe('2026-10-07');
    expect(diffInDays(addDays(today, -14), today)).toBe(14);
  });
});
