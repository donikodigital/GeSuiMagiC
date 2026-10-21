//backend/src/meals/meals.calc.spec.ts
import { toDecimal } from '../common/utils/money.util';
import { computeMealAmounts, MealAmountsInput, serializeAmounts } from './meals.calc';

const input = (overrides: Partial<Record<keyof MealAmountsInput, number>> = {}): MealAmountsInput => {
  const values = { allocated: 1_000_000, unitCost: 5_000, carriedIn: 0, carriedOut: 0, spent: 0, pending: 0, workerDays: 0, ...overrides };
  return {
    allocated: toDecimal(values.allocated),
    unitCost: toDecimal(values.unitCost),
    carriedIn: toDecimal(values.carriedIn),
    carriedOut: toDecimal(values.carriedOut),
    spent: toDecimal(values.spent),
    pending: toDecimal(values.pending),
    workerDays: values.workerDays,
  };
};

describe('meals.calc', () => {
  it("cas du client : 1 000 000 GNF envoyes, presences faibles, peu depense -> gros reliquat reportable", () => {
    // 5 jours x 4 ouvriers x 5 000 GNF = 100 000 justifies ; 120 000 reellement depenses.
    const a = computeMealAmounts(input({ workerDays: 20, spent: 120_000 }));

    expect(a.availableAmount.toNumber()).toBe(1_000_000);
    expect(a.justifiedAmount.toNumber()).toBe(100_000);
    expect(a.remainingAmount.toNumber()).toBe(880_000);
    expect(a.gapAmount.toNumber()).toBe(20_000);
    expect(a.carryableAmount.toNumber()).toBe(880_000);
  });

  it("depenses bien superieures a ce que les presences justifient : ecart positif (demander des comptes)", () => {
    const a = computeMealAmounts(input({ workerDays: 20, spent: 900_000 }));

    expect(a.gapAmount.toNumber()).toBe(800_000);
    expect(a.remainingAmount.toNumber()).toBe(100_000);
  });

  it("depenses inferieures aux presences : ecart negatif", () => {
    const a = computeMealAmounts(input({ workerDays: 100, spent: 300_000 }));
    expect(a.justifiedAmount.toNumber()).toBe(500_000);
    expect(a.gapAmount.toNumber()).toBe(-200_000);
  });

  it("les reports recus s'ajoutent, les reports envoyes se deduisent", () => {
    const a = computeMealAmounts(input({ carriedIn: 200_000, carriedOut: 300_000, spent: 400_000 }));

    expect(a.availableAmount.toNumber()).toBe(900_000);
    expect(a.remainingAmount.toNumber()).toBe(500_000);
  });

  it("les depenses en attente reduisent le montant reportable mais pas le reliquat affiche", () => {
    const a = computeMealAmounts(input({ spent: 600_000, pending: 150_000 }));

    expect(a.remainingAmount.toNumber()).toBe(400_000);
    expect(a.carryableAmount.toNumber()).toBe(250_000);
  });

  it("un depassement donne un reliquat negatif et un montant reportable nul", () => {
    const a = computeMealAmounts(input({ spent: 1_300_000 }));

    expect(a.remainingAmount.toNumber()).toBe(-300_000);
    expect(a.carryableAmount.toNumber()).toBe(0);
  });

  it("sans enveloppe : tout est a zero, les depenses apparaissent comme ecart", () => {
    const a = computeMealAmounts(input({ allocated: 0, unitCost: 0, workerDays: 30, spent: 50_000 }));

    expect(a.availableAmount.toNumber()).toBe(0);
    expect(a.justifiedAmount.toNumber()).toBe(0);
    expect(a.gapAmount.toNumber()).toBe(50_000);
  });

  it("calcule sans erreur d'arrondi flottant", () => {
    const a = computeMealAmounts({ ...input({ workerDays: 3 }), unitCost: toDecimal('0.10'), spent: toDecimal('0.20'), allocated: toDecimal('0.30') });

    expect(a.justifiedAmount.toFixed(2)).toBe('0.30');
    expect(a.remainingAmount.toFixed(2)).toBe('0.10');
  });

  it('serialise en chaines a 2 decimales', () => {
    const s = serializeAmounts(computeMealAmounts(input({ workerDays: 20, spent: 120_000 })));
    expect(s.remainingAmount).toBe('880000.00');
    expect(s.mealUnitCost).toBe('5000.00');
  });
});
