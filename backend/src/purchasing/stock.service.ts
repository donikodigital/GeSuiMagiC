//backend/src/purchasing/stock.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertEditableDay, assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, FIELD_WRITERS, getSiteRole } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { isLowStock, movementEffect, normalizeStockName, stockLevel } from './stock.calc';
import { CreateStockItemDto, CreateStockMovementDto, MovementQueryDto, UpdateStockItemDto } from './dto/purchasing.dto';

/** Stock du chantier : niveaux, consommation par etape, pertes, inventaire. */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: SiteNotifierService,
  ) {}

  async listItems(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const [items, grouped] = await Promise.all([
      this.prisma.stockItem.findMany({ where: { projectId }, orderBy: { name: 'asc' } }),
      this.prisma.stockMovement.groupBy({ by: ['stockItemId', 'type'], where: { projectId }, _sum: { quantity: true } }),
    ]);
    return items.map((item) => {
      const rows = grouped.filter((g) => g.stockItemId === item.id);
      const sum = (type: StockMovementType) => rows.find((r) => r.type === type)?._sum.quantity ?? new Prisma.Decimal(0);
      const level = stockLevel(rows.map((r) => ({ type: r.type, quantity: r._sum.quantity ?? 0 })));
      return {
        ...item,
        quantity: level,
        totalIn: sum('IN'),
        totalConsumed: sum('OUT'),
        totalLost: sum('LOSS'),
        isLow: isLowStock(level, item.minQuantity),
      };
    });
  }

  async createItem(projectId: string, dto: CreateStockItemDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain gèrent le stock.");
    const name = normalizeStockName(dto.name);
    const unit = dto.unit.trim();
    const existing = await this.prisma.stockItem.findFirst({ where: { projectId, unit, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw AppException.conflict('STOCK_ITEM_EXISTS', 'Cet article existe déjà.');
    const item = await this.prisma.stockItem.create({ data: { projectId, name, unit, minQuantity: dto.minQuantity !== undefined ? new Prisma.Decimal(dto.minQuantity) : null } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'StockItem', entityId: item.id, newValue: { projectId, name, unit } });
    return item;
  }

  async updateItem(projectId: string, id: string, dto: UpdateStockItemDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain gèrent le stock.");
    const item = await this.prisma.stockItem.findFirst({ where: { id, projectId } });
    if (!item) throw AppException.notFound('Article');
    const updated = await this.prisma.stockItem.update({ where: { id }, data: { minQuantity: dto.minQuantity === undefined ? undefined : dto.minQuantity === null ? null : new Prisma.Decimal(dto.minQuantity) } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'StockItem', entityId: id, oldValue: { minQuantity: item.minQuantity?.toString() ?? null }, newValue: { minQuantity: dto.minQuantity } });
    return updated;
  }

  async listMovements(projectId: string, query: MovementQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.stockMovement.findMany({
      where: { projectId, stockItemId: query.stockItemId, phaseId: query.phaseId, type: query.type },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
      include: { stockItem: { select: { name: true, unit: true } }, phase: { select: { name: true } } },
    });
    const names = await loadUserNames(this.prisma, rows.map((r) => r.createdById));
    return rows.map(({ stockItem, phase, ...row }) => ({
      ...row,
      date: toIsoDate(row.date),
      itemName: stockItem.name,
      unit: stockItem.unit,
      phaseName: phase?.name ?? null,
      createdByName: names.get(row.createdById) ?? null,
    }));
  }

  /** Consommation et pertes par etape : de quoi comparer ce qui est sorti du stock avec l'avancement. */
  async consumption(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const [rows, items, phases] = await Promise.all([
      this.prisma.stockMovement.groupBy({ by: ['phaseId', 'stockItemId', 'type'], where: { projectId, type: { in: ['OUT', 'LOSS'] } }, _sum: { quantity: true } }),
      this.prisma.stockItem.findMany({ where: { projectId }, select: { id: true, name: true, unit: true } }),
      this.prisma.projectPhase.findMany({ where: { projectId }, select: { id: true, name: true, position: true }, orderBy: { position: 'asc' } }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const keys = [...phases.map((p) => ({ id: p.id as string | null, name: p.name })), { id: null, name: 'Sans étape' }];
    return keys
      .map((phase) => {
        const mine = rows.filter((r) => r.phaseId === phase.id);
        const byItem = new Map<string, { stockItemId: string; name: string; unit: string; consumed: Prisma.Decimal; lost: Prisma.Decimal }>();
        for (const row of mine) {
          const item = itemById.get(row.stockItemId);
          if (!item) continue;
          const entry = byItem.get(item.id) ?? { stockItemId: item.id, name: item.name, unit: item.unit, consumed: new Prisma.Decimal(0), lost: new Prisma.Decimal(0) };
          const q = (row._sum.quantity ?? new Prisma.Decimal(0)).abs();
          if (row.type === 'OUT') entry.consumed = entry.consumed.add(q);
          else entry.lost = entry.lost.add(q);
          byItem.set(item.id, entry);
        }
        return { phaseId: phase.id, phaseName: phase.name, items: [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name)) };
      })
      .filter((p) => p.items.length > 0);
  }

  async recordMovement(projectId: string, stockItemId: string, dto: CreateStockMovementDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain gèrent le stock.");

    if (dto.clientRef) {
      const already = await this.prisma.stockMovement.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.itemSnapshot(projectId, stockItemId);
    }
    const quantity = new Prisma.Decimal(dto.quantity);
    if (dto.type === 'ADJUSTMENT') {
      if (quantity.isZero()) throw AppException.badRequest('INVALID_QUANTITY', 'La correction doit être différente de zéro.');
    } else if (quantity.lessThanOrEqualTo(0)) {
      throw AppException.badRequest('INVALID_QUANTITY', 'La quantité doit être positive.');
    }
    if (dto.type === 'ADJUSTMENT' && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif de la correction d\'inventaire.');
    if (dto.type === 'LOSS' && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Précisez la cause de la perte (casse, vol, intempéries...).');

    const today = startOfUtcDay();
    const date = dto.date ? parseIsoDate(dto.date) : today;
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    assertEditableDay(actor.role, date, today);

    const result = await this.prisma.runInTransaction(async (tx) => {
      const item = await tx.stockItem.findFirst({ where: { id: stockItemId, projectId } });
      if (!item) throw AppException.notFound('Article');
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      if (dto.type === 'OUT' && !dto.phaseId) throw AppException.badRequest('PHASE_REQUIRED', "Indiquez l'étape qui consomme ce matériau.");

      const movements = await tx.stockMovement.findMany({ where: { stockItemId }, select: { type: true, quantity: true } });
      const before = stockLevel(movements);
      const candidate = { type: dto.type, quantity: dto.type === 'ADJUSTMENT' ? quantity : quantity.abs() };
      const after = before.add(movementEffect(candidate));
      if (after.lessThan(0)) {
        throw AppException.badRequest('INSUFFICIENT_STOCK', `Stock insuffisant pour « ${item.name} » : ${before.toString()} ${item.unit} disponible.`);
      }
      const movement = await tx.stockMovement.create({
        data: { projectId, stockItemId, type: dto.type, quantity: candidate.quantity, phaseId: dto.phaseId, date, note: dto.note?.trim() || null, clientRef: dto.clientRef, createdById: actor.userId },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'StockMovement', entityId: movement.id, newValue: { projectId, stockItemId, type: dto.type, quantity: candidate.quantity.toString(), level: after.toString() } },
        tx,
      );
      return { item, before, after };
    });

    // Alerte de stock bas : une seule fois, au franchissement du seuil.
    if (isLowStock(result.after, result.item.minQuantity) && !isLowStock(result.before, result.item.minQuantity)) {
      const message = `Il reste ${result.after.toString()} ${result.item.unit} de « ${result.item.name} » (seuil : ${result.item.minQuantity?.toString()}).`;
      await this.notifier.toClient(project, { type: 'LOW_STOCK_ALERT', title: 'Stock bas sur le chantier', message, path: '/purchasing', meta: { stockItemId } });
      await this.notifier.toReviewers(projectId, { type: 'LOW_STOCK_ALERT', title: 'Stock bas sur le chantier', message, path: '/purchasing', meta: { stockItemId } }, actor.userId);
    }
    return this.itemSnapshot(projectId, stockItemId);
  }

  private async itemSnapshot(projectId: string, stockItemId: string) {
    const item = (await this.listItems(projectId)).find((i) => i.id === stockItemId);
    if (!item) throw AppException.notFound('Article');
    return item;
  }
}
