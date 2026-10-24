//backend/src/quality/quality.calc.spec.ts
import { snagTransition, summarizeSnags } from './quality.calc';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('summarizeSnags', () => {
  it('compte par statut, retards et reserves critiques non closes', () => {
    const summary = summarizeSnags(
      [
        { status: 'OPEN', severity: 'MINOR', dueDate: d('2026-10-01') },
        { status: 'OPEN', severity: 'CRITICAL', dueDate: null },
        { status: 'FIXED', severity: 'MAJOR', dueDate: d('2026-10-30') },
        { status: 'CLOSED', severity: 'CRITICAL', dueDate: d('2026-09-01') },
      ],
      d('2026-10-15'),
    );
    expect(summary).toEqual({ open: 2, fixed: 1, closed: 1, overdue: 1, criticalOpen: 1 });
  });
});

describe('snagTransition', () => {
  it('le terrain leve une reserve ouverte', () => {
    expect(snagTransition('OPEN', 'FIXED')).toEqual({ allowed: true, rule: 'FIELD', noteRequired: false });
  });

  it('la cloture est une decision (client / architecte / conducteur)', () => {
    expect(snagTransition('FIXED', 'CLOSED').rule).toBe('DECISION');
    expect(snagTransition('OPEN', 'CLOSED').rule).toBe('DECISION');
  });

  it('refuser une levee ou rouvrir exige un motif', () => {
    expect(snagTransition('FIXED', 'OPEN')).toEqual({ allowed: true, rule: 'DECISION', noteRequired: true });
    expect(snagTransition('CLOSED', 'OPEN').noteRequired).toBe(true);
  });

  it('refuse les transitions incoherentes', () => {
    expect(snagTransition('CLOSED', 'FIXED').allowed).toBe(false);
    expect(snagTransition('OPEN', 'OPEN').allowed).toBe(false);
    expect(snagTransition('FIXED', 'FIXED').allowed).toBe(false);
  });
});
