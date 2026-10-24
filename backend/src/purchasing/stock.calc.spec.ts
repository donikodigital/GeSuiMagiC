//backend/src/purchasing/stock.calc.spec.ts
import { acceptedQuantity, isLowStock, movementEffect, normalizeStockName, orderStatusFrom, stockLevel } from './stock.calc';

describe('stock.calc', () => {
  it('somme les mouvements avec le bon sens', () => {
    const level = stockLevel([
      { type: 'IN', quantity: 100 },
      { type: 'OUT', quantity: 30 },
      { type: 'LOSS', quantity: 5 },
      { type: 'ADJUSTMENT', quantity: -2 },
      { type: 'ADJUSTMENT', quantity: 1 },
    ]);
    expect(level.toNumber()).toBe(64);
  });

  it('ignore le signe porte par une sortie', () => {
    expect(movementEffect({ type: 'OUT', quantity: -10 }).toNumber()).toBe(-10);
  });

  it('detecte le stock bas (seuil inclus)', () => {
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
  });

  it('calcule la quantite acceptee', () => {
    expect(acceptedQuantity(50, 8).toNumber()).toBe(42);
  });

  it('deduit le statut de la commande', () => {
    expect(orderStatusFrom([{ ordered: 10, accepted: 0 }])).toBe('ORDERED');
    expect(orderStatusFrom([{ ordered: 10, accepted: 4 }, { ordered: 5, accepted: 0 }])).toBe('PARTIAL');
    expect(orderStatusFrom([{ ordered: 10, accepted: 10 }, { ordered: 5, accepted: 6 }])).toBe('DELIVERED');
    expect(orderStatusFrom([])).toBe('ORDERED');
  });

  it('normalise les espaces du nom', () => {
    expect(normalizeStockName('  Ciment   CPJ 45 ')).toBe('Ciment CPJ 45');
  });
});
