//backend/src/contracts/contracts.calc.spec.ts
import { Prisma } from '@prisma/client';
import { checkPayment, computeStatement, summarizeContract, SummaryPayment, SummaryStatement } from './contracts.calc';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('computeStatement', () => {
  it('calcule periode, retenue de garantie et net a payer', () => {
    const result = computeStatement({ retentionPercent: 5, previousCumulative: 10_000_000, cumulativeAmount: 30_000_000, advanceRecovered: 2_000_000 });
    expect(result.amountThisPeriod.toString()).toBe('20000000');
    expect(result.retentionAmount.toString()).toBe('1000000');
    expect(result.netPayable.toString()).toBe('17000000');
  });

  it('arrondit la retenue a 2 decimales', () => {
    expect(computeStatement({ retentionPercent: 5, previousCumulative: 0, cumulativeAmount: '333.33' }).retentionAmount.toString()).toBe('16.67');
  });
});

describe('summarizeContract', () => {
  const statement = (over: Partial<SummaryStatement> & { id: string }): SummaryStatement => ({
    status: 'VALIDATED',
    cumulativeAmount: D(0),
    retentionAmount: D(0),
    advanceRecovered: D(0),
    netPayable: D(0),
    ...over,
  });
  const payment = (over: Partial<SummaryPayment>): SummaryPayment => ({ type: 'OTHER', amount: D(0), statementId: null, expenseStatus: 'APPROVED', ...over });

  const statements = [
    statement({ id: 's1', cumulativeAmount: D(10_000_000), retentionAmount: D(500_000), advanceRecovered: D(3_000_000), netPayable: D(6_500_000) }),
    statement({ id: 's2', cumulativeAmount: D(25_000_000), retentionAmount: D(750_000), netPayable: D(14_250_000) }),
    statement({ id: 's3', status: 'SUBMITTED', cumulativeAmount: D(40_000_000) }),
  ];

  it('cumule travaux valides, retenue, acomptes et net restant a payer', () => {
    const summary = summarizeContract(100_000_000, statements, [
      payment({ type: 'ADVANCE', amount: D(10_000_000) }),
      payment({ type: 'STATEMENT', amount: D(6_500_000), statementId: 's1' }),
    ]);

    expect(summary.validatedWorks.toString()).toBe('25000000');
    expect(summary.remainingWorks.toString()).toBe('75000000');
    expect(summary.retentionHeld.toString()).toBe('1250000');
    expect(summary.advancesPaid.toString()).toBe('10000000');
    expect(summary.advancesRecovered.toString()).toBe('3000000');
    expect(summary.advanceOutstanding.toString()).toBe('7000000');
    expect(summary.paidTotal.toString()).toBe('16500000');
    // net valide 20 750 000 - situations deja payees 6 500 000
    expect(summary.dueNow.toString()).toBe('14250000');
    expect(summary.remainingToPay.toString()).toBe('83500000');
    expect(summary.pendingStatements).toBe(1);
  });

  it('ignore un paiement dont la depense a ete refusee ou annulee', () => {
    const summary = summarizeContract(1_000, [], [
      payment({ type: 'ADVANCE', amount: D(100), expenseStatus: 'REJECTED' }),
      payment({ type: 'ADVANCE', amount: D(200), expenseStatus: 'CANCELLED' }),
      payment({ type: 'ADVANCE', amount: D(50), expenseStatus: 'PENDING' }),
    ]);
    expect(summary.advancesPaid.toString()).toBe('50');
    expect(summary.paidTotal.toString()).toBe('50');
  });
});

describe('checkPayment', () => {
  const summary = (over: Record<string, unknown> = {}) =>
    ({
      contractAmount: D(100_000_000),
      validatedWorks: D(0),
      remainingWorks: D(100_000_000),
      retentionHeld: D(0),
      retentionReleased: D(0),
      advancesPaid: D(0),
      advancesRecovered: D(0),
      advanceOutstanding: D(0),
      paidTotal: D(0),
      dueNow: D(0),
      remainingToPay: D(100_000_000),
      pendingStatements: 0,
      ...over,
    }) as ReturnType<typeof summarizeContract>;

  it('plafonne les acomptes a 30 % du marche', () => {
    expect(checkPayment({ type: 'ADVANCE', amount: 30_000_000, contractStatus: 'ACTIVE', summary: summary() }).ok).toBe(true);
    expect(checkPayment({ type: 'ADVANCE', amount: 30_000_001, contractStatus: 'ACTIVE', summary: summary() })).toMatchObject({ ok: false, code: 'ADVANCE_TOO_HIGH' });
    expect(checkPayment({ type: 'ADVANCE', amount: 10_000_000, contractStatus: 'ACTIVE', summary: summary({ advancesPaid: D(25_000_000) }) })).toMatchObject({ code: 'ADVANCE_TOO_HIGH' });
  });

  it('refuse tout paiement qui depasse le reste a payer du marche', () => {
    expect(checkPayment({ type: 'OTHER', amount: 5_000, contractStatus: 'ACTIVE', summary: summary({ remainingToPay: D(4_000) }) })).toMatchObject({ code: 'EXCEEDS_CONTRACT' });
  });

  it('exige une situation validee et ne depasse pas son net', () => {
    const statement = { status: 'VALIDATED' as const, netPayable: D(10_000_000), alreadyPaid: D(4_000_000) };
    expect(checkPayment({ type: 'STATEMENT', amount: 1, contractStatus: 'ACTIVE', summary: summary() })).toMatchObject({ code: 'STATEMENT_REQUIRED' });
    expect(checkPayment({ type: 'STATEMENT', amount: 1, contractStatus: 'ACTIVE', summary: summary(), statement: { ...statement, status: 'SUBMITTED' } })).toMatchObject({ code: 'STATEMENT_NOT_VALIDATED' });
    expect(checkPayment({ type: 'STATEMENT', amount: 6_000_000, contractStatus: 'ACTIVE', summary: summary(), statement }).ok).toBe(true);
    expect(checkPayment({ type: 'STATEMENT', amount: 6_000_001, contractStatus: 'ACTIVE', summary: summary(), statement })).toMatchObject({ code: 'EXCEEDS_STATEMENT' });
  });

  it('debloque la retenue seulement a la fin du marche et dans la limite detenue', () => {
    const held = summary({ retentionHeld: D(5_000_000), retentionReleased: D(1_000_000) });
    expect(checkPayment({ type: 'RETENTION_RELEASE', amount: 1_000, contractStatus: 'ACTIVE', summary: held })).toMatchObject({ code: 'CONTRACT_NOT_COMPLETED' });
    expect(checkPayment({ type: 'RETENTION_RELEASE', amount: 4_000_000, contractStatus: 'COMPLETED', summary: held }).ok).toBe(true);
    expect(checkPayment({ type: 'RETENTION_RELEASE', amount: 4_000_001, contractStatus: 'COMPLETED', summary: held })).toMatchObject({ code: 'EXCEEDS_RETENTION' });
  });

  it('refuse un paiement ordinaire sur un marche termine ou annule', () => {
    expect(checkPayment({ type: 'OTHER', amount: 1, contractStatus: 'COMPLETED', summary: summary() })).toMatchObject({ code: 'CONTRACT_NOT_ACTIVE' });
    expect(checkPayment({ type: 'OTHER', amount: 1, contractStatus: 'CANCELLED', summary: summary() })).toMatchObject({ code: 'CONTRACT_CANCELLED' });
  });
});
