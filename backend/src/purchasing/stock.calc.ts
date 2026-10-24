//backend/src/purchasing/stock.calc.ts
import { Prisma, PurchaseOrderStatus, StockMovementType } from '@prisma/client';
import { toDecimal } from '../common/utils/money.util';

type Num = Prisma.Decimal | number | string;

export interface MovementLike {
  type: StockMovementType;
  quantity: Num;
}

/** Effet d'un mouvement sur le stock : IN (+), OUT et LOSS (-), ADJUSTMENT (quantite signee). */
export function movementEffect(movement: MovementLike): Prisma.Decimal {
  const q = toDecimal(movement.quantity);
  switch (movement.type) {
    case 'IN':
      return q.abs();
    case 'OUT':
    case 'LOSS':
      return q.abs().neg();
    default:
      return q;
  }
}

export function stockLevel(movements: MovementLike[]): Prisma.Decimal {
  return movements.reduce((sum, m) => sum.add(movementEffect(m)), new Prisma.Decimal(0));
}

export function isLowStock(level: Num, minQuantity: Num | null | undefined): boolean {
  if (minQuantity === null || minQuantity === undefined) return false;
  return toDecimal(level).lessThanOrEqualTo(toDecimal(minQuantity));
}

/** Quantite acceptee d'une ligne de livraison : recue moins refusee (jamais negative). */
export function acceptedQuantity(received: Num, refused: Num): Prisma.Decimal {
  return toDecimal(received).sub(toDecimal(refused));
}

/** Statut d'une commande d'apres les quantites commandees et cumulees acceptees par ligne. */
export function orderStatusFrom(lines: Array<{ ordered: Num; accepted: Num }>): PurchaseOrderStatus {
  if (lines.length === 0) return 'ORDERED';
  const anyDelivered = lines.some((l) => toDecimal(l.accepted).greaterThan(0));
  const allDone = lines.every((l) => toDecimal(l.accepted).greaterThanOrEqualTo(toDecimal(l.ordered)));
  if (allDone) return 'DELIVERED';
  return anyDelivered ? 'PARTIAL' : 'ORDERED';
}

/** Normalise le nom d'un article pour retrouver un article existant (casse et espaces ignores). */
export function normalizeStockName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
