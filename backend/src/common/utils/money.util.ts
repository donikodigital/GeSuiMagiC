//backend/src/common/utils/money.util.ts - v1.1
// Fix : Intl.NumberFormat('fr-FR') insere une espace fine insecable
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

export function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(value as any);
}

export function multiply(quantity: Prisma.Decimal | number | string, unitPrice: Prisma.Decimal | number | string): Prisma.Decimal {
  return toDecimal(quantity).mul(toDecimal(unitPrice));
}

export function add(a: Prisma.Decimal | number | string, b: Prisma.Decimal | number | string): Prisma.Decimal {
  return toDecimal(a).add(toDecimal(b));
}

export function subtract(a: Prisma.Decimal | number | string, b: Prisma.Decimal | number | string): Prisma.Decimal {
  return toDecimal(a).sub(toDecimal(b));
}

export function isPositive(value: Prisma.Decimal | number | string): boolean {
  return toDecimal(value).greaterThan(0);
}

export function isGreaterThan(a: Prisma.Decimal | number | string, b: Prisma.Decimal | number | string): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

export function isGreaterThanOrEqual(a: Prisma.Decimal | number | string, b: Prisma.Decimal | number | string): boolean {
  return toDecimal(a).greaterThanOrEqualTo(toDecimal(b));
}

/** Formatte un montant pour affichage humain, ex: 12 500 000 */
export function formatMoney(value: Prisma.Decimal | number | string, currency = 'GNF'): string {
  const num = toDecimal(value).toNumber();
  // \u00A0 = espace insecable, \u202F = espace fine insecable, \u2009 = espace fine
  const formatted = new Intl.NumberFormat('fr-FR').format(num).replace(/[\u00A0\u202F\u2009]/g, ' ');
  return `${formatted} ${currency}`;
}