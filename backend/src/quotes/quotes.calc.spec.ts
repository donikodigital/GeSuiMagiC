//backend/src/quotes/quotes.calc.spec.ts
import { Prisma } from '@prisma/client';
import { buildComparison, lineTotal, quoteTotal } from './quotes.calc';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('lineTotal / quoteTotal', () => {
  it('arrondit chaque ligne a 2 decimales puis additionne', () => {
    expect(lineTotal({ quantity: '3', unitPrice: '0.335' }).toString()).toBe('1.01');
    expect(quoteTotal([{ quantity: 2, unitPrice: 1500 }, { quantity: '1.5', unitPrice: 1000 }]).toString()).toBe('4500');
    expect(quoteTotal([]).toString()).toBe('0');
  });
});

describe('buildComparison', () => {
  const items = [
    { id: 'i1', label: 'Ciment', unit: 'sac', quantity: D(100), estimatedUnitPrice: D(80_000) },
    { id: 'i2', label: 'Sable', unit: 'm3', quantity: D(10), estimatedUnitPrice: null },
  ];
  const quote = (id: string, name: string, lines: Array<[string, number]>) => ({
    id,
    supplierId: `s-${id}`,
    supplierName: name,
    totalAmount: D(lines.reduce((sum, [itemId, price]) => sum + price * (itemId === 'i1' ? 100 : 10), 0)),
    lines: lines.map(([itemId, price]) => ({ itemId, unitPrice: D(price), total: D(price * (itemId === 'i1' ? 100 : 10)) })),
  });

  it('marque le prix unitaire le plus bas par poste et designe le meilleur devis complet', () => {
    const result = buildComparison(
      items,
      [quote('a', 'Alpha', [['i1', 82_000], ['i2', 50_000]]), quote('b', 'Beta', [['i1', 78_000], ['i2', 55_000]])],
      D(9_000_000),
    );

    expect(result.rows[0].cells.map((c) => c.isLowest)).toEqual([false, true]);
    expect(result.rows[1].cells.map((c) => c.isLowest)).toEqual([true, false]);
    // Alpha : 8 700 000 ; Beta : 8 350 000
    expect(result.bestQuoteId).toBe('b');
    expect(result.quotes.find((q) => q.quoteId === 'b')?.gapToBestPercent).toBe(0);
    expect(result.quotes.find((q) => q.quoteId === 'a')?.gapToBestPercent).toBe(4.19);
    expect(result.quotes.find((q) => q.quoteId === 'b')?.gapToEstimatePercent).toBe(-7.22);
    expect(result.rows[0].estimatedTotal?.toString()).toBe('8000000');
  });

  it('ne retient pas un devis partiel comme meilleur devis, meme moins cher', () => {
    const result = buildComparison(items, [quote('a', 'Alpha', [['i1', 70_000]]), quote('b', 'Beta', [['i1', 78_000], ['i2', 55_000]])], null);

    expect(result.bestQuoteId).toBe('b');
    const partial = result.quotes.find((q) => q.quoteId === 'a')!;
    expect(partial.complete).toBe(false);
    expect(partial.pricedItems).toBe(1);
    expect(partial.gapToBestPercent).toBeNull();
    expect(partial.gapToEstimatePercent).toBeNull();
  });

  it('ne designe rien sans devis complet, et ne surligne pas un prix seul', () => {
    const result = buildComparison(items, [quote('a', 'Alpha', [['i1', 70_000]])], null);

    expect(result.bestQuoteId).toBeNull();
    expect(result.rows[0].cells[0].isLowest).toBe(false);
  });
});
