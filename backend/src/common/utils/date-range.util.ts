//backend/src/common/utils/date-range.util.ts
import { Prisma } from '@prisma/client';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtre de dates pour Prisma. Une borne "to" sans heure (YYYY-MM-DD) INCLUT la
 * journee entiere : avant, `lte: new Date('2026-03-31')` coupait a minuit et
 * excluait toutes les operations du 31 mars.
 */
export function buildDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(from);
  if (to) {
    if (DATE_ONLY.test(to)) {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.lt = end;
    } else {
      filter.lte = new Date(to);
    }
  }
  return filter;
}
