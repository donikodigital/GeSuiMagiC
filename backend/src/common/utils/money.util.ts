//backend/src/common/utils/money.util.ts
// v1.2 : ajout de roundMoney() (arrondi commercial a 2 decimales, aligne sur
// Decimal(18,2) en base) et isWithinMoneyRange() (evite un depassement de
// colonne qui remontait en erreur 500).
// v1.1 : Intl.NumberFormat('fr-FR') insere une espace fine insecable
// (U+202F) comme separateur de milliers. La police Helvetica par defaut de
// pdfkit ne connait pas ce caractere et l'affichait comme "/" dans le
// rapport PDF. On garde Intl pour le calcul (arrondi, decimales, signe),
// on remplace juste les variantes d'espace insecable par une espace ASCII
// normale (U+0020), universellement supportee.

import { Prisma } from '@prisma/client';

/**
 * Helpers centralises pour tous les calculs financiers.
 * REGLE ABSOLUE : jamais de calcul monetaire en `number` JS (flottants).
 * On passe systematiquement par Prisma.Decimal (base sur decimal.js).
 */

export type Money = Prisma.Decimal;

type MoneyInput = Prisma.Decimal | number | string;

/** Plus grand montant stockable dans une colonne Decimal(18,2). */
export const MAX_MONEY = new Prisma.Decimal('9999999999999999.99');

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(value as any);
}

export function multiply(quantity: MoneyInput, unitPrice: MoneyInput): Prisma.Decimal {
  return toDecimal(quantity).mul(toDecimal(unitPrice));
}

export function add(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).add(toDecimal(b));
}

export function subtract(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).sub(toDecimal(b));
}

export function isPositive(value: MoneyInput): boolean {
  return toDecimal(value).greaterThan(0);
}

export function isGreaterThan(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

export function isGreaterThanOrEqual(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

/**
 * Arrondit un montant a 2 decimales (arrondi commercial : 0,005 -> 0,01).
 * A appeler AVANT toute comparaison (seuils, budget) et avant stockage, pour
 * que la valeur comparee soit exactement celle qui sera ecrite en base
 * (Postgres arrondit de la meme facon sur Decimal(18,2)).
 */
export function roundMoney(value: MoneyInput): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Vrai si le montant (en valeur absolue) tient dans une colonne Decimal(18,2). */
export function isWithinMoneyRange(value: MoneyInput): boolean {
  return toDecimal(value).abs().lessThanOrEqualTo(MAX_MONEY);
}

/** Formatte un montant pour affichage humain, ex: 12 500 000 */
export function formatMoney(value: MoneyInput, currency = 'GNF'): string {
  const num = toDecimal(value).toNumber();
  //   = espace insecable,   = espace fine insecable,   = espace fine
  const formatted = new Intl.NumberFormat('fr-FR').format(num).replace(/[   ]/g, ' ');
  return `${formatted} ${currency}`;
}
