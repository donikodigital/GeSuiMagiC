//backend/src/common/pipes/month.pipe.spec.ts
import { MonthPipe } from './month.pipe';

describe('MonthPipe', () => {
  const pipe = new MonthPipe();

  it('laisse passer un mois valide', () => {
    expect(pipe.transform('2026-10')).toBe('2026-10');
  });

  it('refuse un format invalide avec INVALID_MONTH', () => {
    for (const bad of ['2026-13', '2026-1', 'octobre', '', '2026-10-01']) {
      expect(() => pipe.transform(bad)).toThrow(expect.objectContaining({ code: 'INVALID_MONTH' }));
    }
  });
});
