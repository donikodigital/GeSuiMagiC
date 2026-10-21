//backend/src/meals/meals.calc.ts
import { Prisma } from '@prisma/client';
import { add, subtract, toDecimal } from '../common/utils/money.util';

type Decimal = Prisma.Decimal;
const ZERO = toDecimal(0);

export interface MealAmountsInput {
  /** Enveloppe du mois (0 si aucune enveloppe n'a ete definie). */
  allocated: Decimal;
  /** Cout d'un repas par ouvrier et par jour (0 si aucune enveloppe). */
  unitCost: Decimal;
  /** Reliquats recus des mois precedents (reports valides par le client). */
  carriedIn: Decimal;
  /** Reliquats de ce mois reportes vers des mois suivants. */
  carriedOut: Decimal;
  /** Depenses d'alimentation VALIDEES du mois. */
  spent: Decimal;
  /** Depenses d'alimentation du mois en attente de validation. */
  pending: Decimal;
  /** Somme des effectifs des jours travailles du mois. */
  workerDays: number;
}

export interface MealAmounts {
  allocatedAmount: Decimal;
  mealUnitCost: Decimal;
  carriedInAmount: Decimal;
  carriedOutAmount: Decimal;
  /** Enveloppe + reports recus - reports envoyes : l'argent dont le mois dispose. */
  availableAmount: Decimal;
  /** Ce que les presences justifient : jours-ouvriers x cout d'un repas. */
  justifiedAmount: Decimal;
  spentAmount: Decimal;
  pendingAmount: Decimal;
  /** Argent non depense : disponible - depenses validees (negatif si depassement). */
  remainingAmount: Decimal;
  /** Depense au-dela (positif) ou en-deca (negatif) de ce que les presences justifient. */
  gapAmount: Decimal;
  /** Part du reliquat que le client peut reporter : reliquat - depenses en attente, jamais negatif. */
  carryableAmount: Decimal;
}

export function computeMealAmounts(input: MealAmountsInput): MealAmounts {
  const availableAmount = subtract(add(input.allocated, input.carriedIn), input.carriedOut);
  const justifiedAmount = input.unitCost.mul(input.workerDays);
  const remainingAmount = subtract(availableAmount, input.spent);
  const afterPending = subtract(remainingAmount, input.pending);

  return {
    allocatedAmount: input.allocated,
    mealUnitCost: input.unitCost,
    carriedInAmount: input.carriedIn,
    carriedOutAmount: input.carriedOut,
    availableAmount,
    justifiedAmount,
    spentAmount: input.spent,
    pendingAmount: input.pending,
    remainingAmount,
    gapAmount: subtract(input.spent, justifiedAmount),
    carryableAmount: afterPending.greaterThan(0) ? afterPending : ZERO,
  };
}

/** Montants au format de l'API (chaines a 2 decimales, comme le reste de l'application). */
export function serializeAmounts(amounts: MealAmounts): Record<keyof MealAmounts, string> {
  const entries = Object.entries(amounts).map(([key, value]) => [key, (value as Decimal).toFixed(2)]);
  return Object.fromEntries(entries) as Record<keyof MealAmounts, string>;
}
