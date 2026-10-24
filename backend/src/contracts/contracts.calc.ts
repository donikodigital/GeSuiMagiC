//backend/src/contracts/contracts.calc.ts
import { ContractPaymentType, ContractStatus, Prisma, StatementStatus } from '@prisma/client';
import { roundMoney, toDecimal } from '../common/utils/money.util';

type MoneyLike = Prisma.Decimal | number | string;

/** Un acompte ne peut pas depasser cette part du montant du marche. */
export const MAX_ADVANCE_PERCENT = 30;

// ---------------------------------------------------------------------------
// Situation de travaux
// ---------------------------------------------------------------------------

export interface StatementComputation {
  amountThisPeriod: Prisma.Decimal;
  retentionAmount: Prisma.Decimal;
  advanceRecovered: Prisma.Decimal;
  netPayable: Prisma.Decimal;
}

/**
 * Situation de travaux : le sous-traitant declare le CUMUL des travaux realises depuis le debut.
 *  - montant de la periode = cumul - cumul de la situation precedente ;
 *  - retenue de garantie = montant de la periode x pourcentage ;
 *  - net a payer = montant de la periode - retenue - acompte recupere.
 */
export function computeStatement(input: {
  retentionPercent: MoneyLike;
  previousCumulative: MoneyLike;
  cumulativeAmount: MoneyLike;
  advanceRecovered?: MoneyLike;
}): StatementComputation {
  const amountThisPeriod = roundMoney(toDecimal(input.cumulativeAmount).sub(toDecimal(input.previousCumulative)));
  const retentionAmount = roundMoney(amountThisPeriod.mul(toDecimal(input.retentionPercent)).div(100));
  const advanceRecovered = roundMoney(input.advanceRecovered ?? 0);
  const netPayable = roundMoney(amountThisPeriod.sub(retentionAmount).sub(advanceRecovered));
  return { amountThisPeriod, retentionAmount, advanceRecovered, netPayable };
}

// ---------------------------------------------------------------------------
// Synthese financiere d'un marche
// ---------------------------------------------------------------------------

export interface SummaryStatement {
  id: string;
  status: StatementStatus;
  cumulativeAmount: Prisma.Decimal;
  retentionAmount: Prisma.Decimal;
  advanceRecovered: Prisma.Decimal;
  netPayable: Prisma.Decimal;
}

export interface SummaryPayment {
  type: ContractPaymentType;
  amount: Prisma.Decimal;
  statementId: string | null;
  /** Statut de la depense associee : un paiement dont la depense est refusee ou annulee ne compte plus. */
  expenseStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | null;
}

export interface ContractSummary {
  contractAmount: Prisma.Decimal;
  /** Travaux valides depuis le debut (cumul de la derniere situation validee). */
  validatedWorks: Prisma.Decimal;
  /** Reste a executer = montant du marche - travaux valides. */
  remainingWorks: Prisma.Decimal;
  retentionHeld: Prisma.Decimal;
  retentionReleased: Prisma.Decimal;
  advancesPaid: Prisma.Decimal;
  advancesRecovered: Prisma.Decimal;
  /** Acompte verse et pas encore recupere sur les situations. */
  advanceOutstanding: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
  /** Net des situations validees qui n'est pas encore paye. */
  dueNow: Prisma.Decimal;
  /** Total engage restant a payer au maximum : montant du marche - deja paye. */
  remainingToPay: Prisma.Decimal;
  pendingStatements: number;
}

const ZERO = () => toDecimal(0);
const counts = (payment: SummaryPayment) => payment.expenseStatus !== 'REJECTED' && payment.expenseStatus !== 'CANCELLED';

export function summarizeContract(contractAmount: MoneyLike, statements: SummaryStatement[], payments: SummaryPayment[]): ContractSummary {
  const validated = statements.filter((s) => s.status === 'VALIDATED');
  const validatedWorks = validated.reduce((max, s) => (s.cumulativeAmount.greaterThan(max) ? s.cumulativeAmount : max), ZERO());
  const retentionHeld = validated.reduce((sum, s) => sum.add(s.retentionAmount), ZERO());
  const advancesRecovered = validated.reduce((sum, s) => sum.add(s.advanceRecovered), ZERO());

  const valid = payments.filter(counts);
  const sum = (type: ContractPaymentType) => valid.filter((p) => p.type === type).reduce((total, p) => total.add(p.amount), ZERO());
  const advancesPaid = sum('ADVANCE');
  const retentionReleased = sum('RETENTION_RELEASE');
  const paidTotal = valid.reduce((total, p) => total.add(p.amount), ZERO());

  const statementPaid = valid.filter((p) => p.type === 'STATEMENT').reduce((total, p) => total.add(p.amount), ZERO());
  const netValidated = validated.reduce((total, s) => total.add(s.netPayable), ZERO());
  const amount = toDecimal(contractAmount);

  return {
    contractAmount: roundMoney(amount),
    validatedWorks: roundMoney(validatedWorks),
    remainingWorks: roundMoney(amount.sub(validatedWorks)),
    retentionHeld: roundMoney(retentionHeld),
    retentionReleased: roundMoney(retentionReleased),
    advancesPaid: roundMoney(advancesPaid),
    advancesRecovered: roundMoney(advancesRecovered),
    advanceOutstanding: roundMoney(advancesPaid.sub(advancesRecovered)),
    paidTotal: roundMoney(paidTotal),
    dueNow: roundMoney(netValidated.sub(statementPaid)),
    remainingToPay: roundMoney(amount.sub(paidTotal)),
    pendingStatements: statements.filter((s) => s.status === 'SUBMITTED').length,
  };
}

// ---------------------------------------------------------------------------
// Regles d'un paiement
// ---------------------------------------------------------------------------

export interface PaymentCheckInput {
  type: ContractPaymentType;
  amount: MoneyLike;
  contractStatus: ContractStatus;
  summary: ContractSummary;
  /** Situation visee (paiement de type STATEMENT) et ce qui en a deja ete paye. */
  statement?: { status: StatementStatus; netPayable: Prisma.Decimal; alreadyPaid: Prisma.Decimal } | null;
}

export interface PaymentCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/** Valide un paiement avant de creer la depense : plafond du marche, acompte, situation validee, retenue. */
export function checkPayment(input: PaymentCheckInput): PaymentCheckResult {
  const amount = toDecimal(input.amount);
  const { summary } = input;
  const fail = (code: string, message: string): PaymentCheckResult => ({ ok: false, code, message });

  if (!amount.greaterThan(0)) return fail('INVALID_AMOUNT', 'Le montant doit être positif.');
  if (input.contractStatus === 'CANCELLED') return fail('CONTRACT_CANCELLED', 'Ce marché est annulé.');
  if (input.type !== 'RETENTION_RELEASE' && input.contractStatus !== 'ACTIVE') return fail('CONTRACT_NOT_ACTIVE', 'Ce marché est terminé : seul le déblocage de la retenue de garantie est possible.');
  if (amount.greaterThan(summary.remainingToPay)) {
    return fail('EXCEEDS_CONTRACT', `Ce paiement dépasse le reste à payer du marché (${summary.remainingToPay.toString()}).`);
  }

  switch (input.type) {
    case 'ADVANCE': {
      const cap = roundMoney(summary.contractAmount.mul(MAX_ADVANCE_PERCENT).div(100));
      if (summary.advancesPaid.add(amount).greaterThan(cap)) {
        return fail('ADVANCE_TOO_HIGH', `Les acomptes ne peuvent pas dépasser ${MAX_ADVANCE_PERCENT} % du marché (${cap.toString()}).`);
      }
      return { ok: true };
    }
    case 'STATEMENT': {
      if (!input.statement) return fail('STATEMENT_REQUIRED', 'Choisissez la situation de travaux à payer.');
      if (input.statement.status !== 'VALIDATED') return fail('STATEMENT_NOT_VALIDATED', "Cette situation n'est pas encore validée.");
      if (input.statement.alreadyPaid.add(amount).greaterThan(input.statement.netPayable)) {
        return fail('EXCEEDS_STATEMENT', `Ce paiement dépasse le net à payer de la situation (reste ${input.statement.netPayable.sub(input.statement.alreadyPaid).toString()}).`);
      }
      return { ok: true };
    }
    case 'RETENTION_RELEASE': {
      if (input.contractStatus !== 'COMPLETED') return fail('CONTRACT_NOT_COMPLETED', 'La retenue de garantie se débloque une fois le marché terminé.');
      if (summary.retentionReleased.add(amount).greaterThan(summary.retentionHeld)) {
        return fail('EXCEEDS_RETENTION', `Le déblocage dépasse la retenue détenue (reste ${summary.retentionHeld.sub(summary.retentionReleased).toString()}).`);
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}
