//backend/src/deposits/currency.calc.ts
import { Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from '../common/utils/money.util';

type MoneyLike = Prisma.Decimal | number | string;

export interface ForeignDepositInput {
  /** Montant CREDITE sur le chantier, en devise du projet. */
  amount: MoneyLike;
  /** Montant envoye, en devise d'origine. */
  originalAmount: MoneyLike;
  /** Taux obtenu : 1 unite de devise d'origine = X unites de devise du projet. */
  exchangeRate: MoneyLike;
  /** Frais de transfert payes EN PLUS du montant envoye, en devise d'origine. */
  transferFees?: MoneyLike | null;
}

export interface ForeignDepositAnalysis {
  /** Montant attendu = montant envoye x taux. */
  expectedAmount: Prisma.Decimal;
  /** Ecart entre le montant credite et le montant attendu, en % du montant attendu (negatif = on a recu MOINS que prevu). */
  gapPercent: number;
  /** Total debite au client dans sa devise (montant envoye + frais). */
  totalPaidOriginal: Prisma.Decimal;
  /** Taux reellement obtenu une fois les frais comptes : montant credite / total debite. */
  effectiveRate: Prisma.Decimal;
  /** Frais en % du montant envoye. */
  feesPercent: number;
}

/** Ecart au-dela duquel la saisie est jugee incoherente (faute de frappe probable) et refusee. */
export const MAX_RATE_GAP_PERCENT = 25;

export function analyzeForeignDeposit(input: ForeignDepositInput): ForeignDepositAnalysis {
  const original = toDecimal(input.originalAmount);
  const rate = toDecimal(input.exchangeRate);
  const fees = toDecimal(input.transferFees ?? 0);
  const amount = toDecimal(input.amount);

  const expected = roundMoney(original.mul(rate));
  const totalPaid = original.add(fees);
  const gapPercent = expected.isZero() ? 0 : Math.round(amount.sub(expected).div(expected).mul(10000).toNumber()) / 100;
  const effectiveRate = totalPaid.isZero() ? toDecimal(0) : amount.div(totalPaid).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  const feesPercent = original.isZero() ? 0 : Math.round(fees.div(original).mul(10000).toNumber()) / 100;

  return { expectedAmount: expected, gapPercent, totalPaidOriginal: roundMoney(totalPaid), effectiveRate, feesPercent };
}

export interface CurrencyBucket {
  originalCurrency: string;
  count: number;
  sentOriginal: Prisma.Decimal;
  fees: Prisma.Decimal;
  credited: Prisma.Decimal;
  /** Taux moyen pondere : total credite / total debite (frais compris). */
  averageEffectiveRate: Prisma.Decimal;
  minRate: Prisma.Decimal;
  maxRate: Prisma.Decimal;
}

export interface ForeignDepositRow {
  originalCurrency: string | null;
  originalAmount: Prisma.Decimal | null;
  exchangeRate: Prisma.Decimal | null;
  transferFees: Prisma.Decimal | null;
  amount: Prisma.Decimal;
}

/** Totaux par devise d'origine des depots envoyes de l'etranger (les depots dans la devise du projet sont ignores). */
export function summarizeByCurrency(rows: ForeignDepositRow[]): CurrencyBucket[] {
  const buckets = new Map<string, CurrencyBucket>();
  for (const row of rows) {
    if (!row.originalCurrency || !row.originalAmount || !row.exchangeRate) continue;
    const fees = row.transferFees ?? toDecimal(0);
    const existing = buckets.get(row.originalCurrency);
    if (!existing) {
      buckets.set(row.originalCurrency, {
        originalCurrency: row.originalCurrency,
        count: 1,
        sentOriginal: row.originalAmount,
        fees,
        credited: row.amount,
        averageEffectiveRate: toDecimal(0),
        minRate: row.exchangeRate,
        maxRate: row.exchangeRate,
      });
    } else {
      existing.count += 1;
      existing.sentOriginal = existing.sentOriginal.add(row.originalAmount);
      existing.fees = existing.fees.add(fees);
      existing.credited = existing.credited.add(row.amount);
      if (row.exchangeRate.lessThan(existing.minRate)) existing.minRate = row.exchangeRate;
      if (row.exchangeRate.greaterThan(existing.maxRate)) existing.maxRate = row.exchangeRate;
    }
  }
  return [...buckets.values()].map((bucket) => {
    const totalPaid = bucket.sentOriginal.add(bucket.fees);
    return { ...bucket, averageEffectiveRate: totalPaid.isZero() ? toDecimal(0) : bucket.credited.div(totalPaid).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP) };
  });
}
