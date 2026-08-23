import { add, formatMoney, isGreaterThan, isGreaterThanOrEqual, multiply, subtract, toDecimal } from './money.util';

describe('money.util', () => {
  it('multiplie quantite x prix unitaire sans erreur de flottant', () => {
    // Cas classique de piege flottant JS : 0.1 * 3 !== 0.3 en number natif.
    const total = multiply('0.1', '3');
    expect(total.toString()).toBe('0.3');
  });

  it('calcule correctement un total de depense realiste (section 18)', () => {
    // 100 sacs de ciment a 150 000 GNF
    const total = multiply(100, 150000);
    expect(total.toNumber()).toBe(15000000);
  });

  it('addition et soustraction restent precises sur de gros montants GNF', () => {
    const totalDeposited = add(300000000, 50000000);
    expect(totalDeposited.toNumber()).toBe(350000000);

    const balance = subtract(totalDeposited, 20000000);
    expect(balance.toNumber()).toBe(330000000);
  });

  it('permet un solde negatif (regle explicite : les depenses ne sont jamais bloquees)', () => {
    const balance = subtract(50000000, 80000000);
    expect(balance.toNumber()).toBe(-30000000);
    expect(isGreaterThan(balance, 0)).toBe(false);
  });

  it('formate un montant avec la devise', () => {
    expect(formatMoney(1500000, 'GNF')).toContain('GNF');
    expect(formatMoney(1500000, 'GNF')).toContain('500');
  });

  it('isGreaterThanOrEqual gere les egalites exactes (seuil de validation)', () => {
    expect(isGreaterThanOrEqual(toDecimal(5000000), 5000000)).toBe(true);
    expect(isGreaterThan(toDecimal(5000000), 5000000)).toBe(false);
  });
});
