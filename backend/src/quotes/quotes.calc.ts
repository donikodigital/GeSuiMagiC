//backend/src/quotes/quotes.calc.ts
import { Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from '../common/utils/money.util';

type MoneyLike = Prisma.Decimal | number | string;

export interface QuoteLineInput {
  quantity: MoneyLike;
  unitPrice: MoneyLike;
}

/** Total d'une ligne = quantite x prix unitaire, arrondi a 2 decimales. */
export function lineTotal(line: QuoteLineInput): Prisma.Decimal {
  return roundMoney(toDecimal(line.quantity).mul(toDecimal(line.unitPrice)));
}

export function quoteTotal(lines: QuoteLineInput[]): Prisma.Decimal {
  return lines.reduce((sum, line) => sum.add(lineTotal(line)), toDecimal(0));
}

export interface ComparisonItem {
  id: string;
  label: string;
  unit: string;
  quantity: Prisma.Decimal;
  estimatedUnitPrice: Prisma.Decimal | null;
}

export interface ComparisonQuote {
  id: string;
  supplierId: string;
  supplierName: string;
  totalAmount: Prisma.Decimal;
  lines: Array<{ itemId: string | null; unitPrice: Prisma.Decimal; total: Prisma.Decimal }>;
}

export interface Comparison {
  rows: Array<{
    itemId: string;
    label: string;
    unit: string;
    quantity: Prisma.Decimal;
    estimatedTotal: Prisma.Decimal | null;
    cells: Array<{ quoteId: string; unitPrice: Prisma.Decimal | null; total: Prisma.Decimal | null; isLowest: boolean }>;
  }>;
  quotes: Array<{
    quoteId: string;
    supplierName: string;
    totalAmount: Prisma.Decimal;
    /** Postes du metre chiffres par ce fournisseur. */
    pricedItems: number;
    complete: boolean;
    /** Ecart avec l'estimation du lot en % (negatif = moins cher que prevu), null sans estimation. */
    gapToEstimatePercent: number | null;
    /** Ecart avec le devis complet le moins cher, en % (0 pour le moins cher). */
    gapToBestPercent: number | null;
  }>;
  /** Devis complet le moins cher (les devis partiels ne sont pas comparables au total). */
  bestQuoteId: string | null;
  estimatedAmount: Prisma.Decimal | null;
}

/**
 * Comparaison ligne a ligne des devis d'un lot. Le « moins cher » d'une ligne est le plus bas prix unitaire propose ;
 * le « meilleur devis » est le devis COMPLET (tous les postes chiffres) au total le plus bas.
 */
export function buildComparison(items: ComparisonItem[], quotes: ComparisonQuote[], estimatedAmount: Prisma.Decimal | null): Comparison {
  const rows = items.map((item) => {
    const prices = quotes.map((quote) => {
      const line = quote.lines.find((l) => l.itemId === item.id);
      return { quoteId: quote.id, unitPrice: line?.unitPrice ?? null, total: line?.total ?? null };
    });
    const known = prices.filter((p) => p.unitPrice !== null).map((p) => p.unitPrice as Prisma.Decimal);
    const lowest = known.length > 1 ? Prisma.Decimal.min(...known) : null;
    return {
      itemId: item.id,
      label: item.label,
      unit: item.unit,
      quantity: item.quantity,
      estimatedTotal: item.estimatedUnitPrice ? roundMoney(item.estimatedUnitPrice.mul(item.quantity)) : null,
      cells: prices.map((p) => ({ ...p, isLowest: lowest !== null && p.unitPrice !== null && p.unitPrice.equals(lowest) })),
    };
  });

  const summaries = quotes.map((quote) => {
    const pricedItems = items.filter((item) => quote.lines.some((l) => l.itemId === item.id)).length;
    return { quote, pricedItems, complete: items.length > 0 && pricedItems === items.length };
  });
  const completeTotals = summaries.filter((s) => s.complete).map((s) => s.quote.totalAmount);
  const best = completeTotals.length ? Prisma.Decimal.min(...completeTotals) : null;
  const bestQuote = best ? summaries.find((s) => s.complete && s.quote.totalAmount.equals(best)) : undefined;

  const percent = (value: Prisma.Decimal, reference: Prisma.Decimal): number | null =>
    reference.isZero() ? null : Math.round(value.sub(reference).div(reference).mul(10000).toNumber()) / 100;

  return {
    rows,
    quotes: summaries.map(({ quote, pricedItems, complete }) => ({
      quoteId: quote.id,
      supplierName: quote.supplierName,
      totalAmount: quote.totalAmount,
      pricedItems,
      complete,
      gapToEstimatePercent: estimatedAmount ? percent(quote.totalAmount, estimatedAmount) : null,
      gapToBestPercent: complete && best ? percent(quote.totalAmount, best) : null,
    })),
    bestQuoteId: bestQuote?.quote.id ?? null,
    estimatedAmount,
  };
}
