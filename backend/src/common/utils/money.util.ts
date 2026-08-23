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
  return `${new Intl.NumberFormat('fr-FR').format(num)} ${currency}`;
}
