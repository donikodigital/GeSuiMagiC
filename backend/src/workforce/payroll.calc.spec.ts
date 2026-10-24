//backend/src/workforce/payroll.calc.spec.ts
import { advanceBalance, computePayLine, periodsOverlap, sumPayLines } from './payroll.calc';

describe('payroll.calc', () => {
  it('calcule le brut et regularise toute l avance due', () => {
    const r = computePayLine({ daysWorked: 10, dailyRate: 5000, advanceOutstanding: 20000 });
    expect(r.gross.toNumber()).toBe(50000);
    expect(r.advance.toNumber()).toBe(20000);
    expect(r.net.toNumber()).toBe(30000);
  });

  it('plafonne la retenue au brut', () => {
    const r = computePayLine({ daysWorked: 1, dailyRate: 5000, advanceOutstanding: 20000 });
    expect(r.advance.toNumber()).toBe(5000);
    expect(r.net.toNumber()).toBe(0);
  });

  it('refuse une retenue superieure a ce qui est du', () => {
    const r = computePayLine({ daysWorked: 10, dailyRate: 5000, advanceOutstanding: 1000, advanceRequested: 3000 });
    expect(r.error).toBe('ADVANCE_TOO_HIGH');
  });

  it('utilise le montant a la tache quand il est donne', () => {
    const r = computePayLine({ daysWorked: 0, dailyRate: 0, taskAmount: 120000, advanceOutstanding: 0 });
    expect(r.gross.toNumber()).toBe(120000);
    expect(r.net.toNumber()).toBe(120000);
  });

  it('additionne les totaux', () => {
    const t = sumPayLines([
      { grossAmount: 100, advanceDeducted: 10, netAmount: 90 },
      { grossAmount: 50, advanceDeducted: 0, netAmount: 50 },
    ]);
    expect([t.totalGross.toNumber(), t.totalAdvance.toNumber(), t.totalNet.toNumber()]).toEqual([150, 10, 140]);
  });

  it('detecte le chevauchement de periodes', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(periodsOverlap(d('2026-10-01'), d('2026-10-15'), d('2026-10-15'), d('2026-10-31'))).toBe(true);
    expect(periodsOverlap(d('2026-10-01'), d('2026-10-14'), d('2026-10-15'), d('2026-10-31'))).toBe(false);
  });

  it('ne descend jamais sous zero pour le solde d avance', () => {
    expect(advanceBalance(100, 150).toNumber()).toBe(0);
    expect(advanceBalance(100, 40).toNumber()).toBe(60);
  });
});
