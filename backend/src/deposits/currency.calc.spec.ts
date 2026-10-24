//backend/src/deposits/currency.calc.spec.ts
import { Prisma } from '@prisma/client';
import { analyzeForeignDeposit, summarizeByCurrency } from './currency.calc';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('analyzeForeignDeposit', () => {
  it('calcule le montant attendu, le taux effectif frais compris et le pourcentage de frais', () => {
    // 1 000 EUR envoyes + 20 EUR de frais, taux 9 500 GNF/EUR, 9 500 000 GNF credites
    const result = analyzeForeignDeposit({ amount: '9500000', originalAmount: '1000', exchangeRate: '9500', transferFees: '20' });
    expect(result.expectedAmount.toString()).toBe('9500000');
    expect(result.gapPercent).toBe(0);
    expect(result.totalPaidOriginal.toString()).toBe('1020');
    expect(result.effectiveRate.toFixed(2)).toBe('9313.73');
    expect(result.feesPercent).toBe(2);
  });

  it('signale un ecart negatif quand le chantier recoit moins que prevu', () => {
    const result = analyzeForeignDeposit({ amount: '9025000', originalAmount: '1000', exchangeRate: '9500' });
    expect(result.gapPercent).toBe(-5);
  });

  it('gere l\'absence de frais', () => {
    const result = analyzeForeignDeposit({ amount: '9500000', originalAmount: '1000', exchangeRate: '9500', transferFees: null });
    expect(result.effectiveRate.toFixed(0)).toBe('9500');
    expect(result.feesPercent).toBe(0);
  });
});

describe('summarizeByCurrency', () => {
  it('regroupe par devise d\'origine avec taux moyen pondere, minimum et maximum', () => {
    const buckets = summarizeByCurrency([
      { originalCurrency: 'EUR', originalAmount: D(1000), exchangeRate: D(9500), transferFees: D(20), amount: D(9_500_000) },
      { originalCurrency: 'EUR', originalAmount: D(500), exchangeRate: D(9300), transferFees: null, amount: D(4_650_000) },
      { originalCurrency: 'USD', originalAmount: D(200), exchangeRate: D(8600), transferFees: D(5), amount: D(1_720_000) },
      { originalCurrency: null, originalAmount: null, exchangeRate: null, transferFees: null, amount: D(100) },
    ]);
    const eur = buckets.find((b) => b.originalCurrency === 'EUR')!;
    expect(eur.count).toBe(2);
    expect(eur.sentOriginal.toString()).toBe('1500');
    expect(eur.fees.toString()).toBe('20');
    expect(eur.credited.toString()).toBe('14150000');
    expect(eur.minRate.toString()).toBe('9300');
    expect(eur.maxRate.toString()).toBe('9500');
    expect(eur.averageEffectiveRate.toFixed(2)).toBe('9309.21');
    expect(buckets).toHaveLength(2);
  });
});
