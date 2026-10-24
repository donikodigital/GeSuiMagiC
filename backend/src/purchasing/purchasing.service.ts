//backend/src/purchasing/purchasing.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { roundMoney } from '../common/utils/money.util';
import { assessLocation } from '../common/utils/geo.util';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertEditableDay, assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, FIELD_WRITERS, getSiteRole, OWNERS, SiteRole } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { acceptedQuantity, normalizeStockName, orderStatusFrom } from './stock.calc';
import { CancelOrderDto, CreateDeliveryDto, CreateOrderDto, OrderQueryDto } from './dto/purchasing.dto';

const ORDER_WRITERS: readonly SiteRole[] = [...FIELD_WRITERS, 'CLIENT'];

const orderInclude = {
  phase: { select: { name: true } },
  supplier: { select: { id: true, name: true } },
  lines: { orderBy: { position: 'asc' as const }, include: { deliveryLines: { select: { quantityReceived: true, quantityRefused: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

type OrderFull = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

/** Commandes aux fournisseurs et bons de livraison (chaque livraison alimente le stock). */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private presentOrder(order: OrderFull) {
    const { phase, supplier, lines, ...rest } = order;
    return {
      ...rest,
      orderDate: toIsoDate(order.orderDate),
      expectedDate: order.expectedDate ? toIsoDate(order.expectedDate) : null,
      phaseName: phase?.name ?? null,
      supplierName: supplier?.name ?? order.supplierName ?? null,
      total: lines.some((l) => l.unitPrice) ? roundMoney(lines.reduce((s, l) => s.add((l.unitPrice ?? new Prisma.Decimal(0)).mul(l.quantityOrdered)), new Prisma.Decimal(0))) : null,
      lines: lines.map(({ deliveryLines, ...line }) => {
        const delivered = deliveryLines.reduce((s, d) => s.add(acceptedQuantity(d.quantityReceived, d.quantityRefused)), new Prisma.Decimal(0));
        return { ...line, quantityDelivered: delivered, quantityRemaining: Prisma.Decimal.max(line.quantityOrdered.sub(delivered), 0) };
      }),
    };
  }

  async listOrders(projectId: string, query: OrderQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const orders = await this.prisma.purchaseOrder.findMany({ where: { projectId, status: query.status }, orderBy: { number: 'desc' }, include: orderInclude });
    return orders.map((o) => this.presentOrder(o));
  }

  async findOrder(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, projectId }, include: orderInclude });
    if (!order) throw AppException.notFound('Commande');
    return this.presentOrder(order);
  }

  async createOrder(projectId: string, dto: CreateOrderDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), ORDER_WRITERS, 'Votre fonction ne permet pas de passer commande.');
    const orderDate = dto.orderDate ? parseIsoDate(dto.orderDate) : startOfUtcDay();
    const expectedDate = dto.expectedDate ? parseIsoDate(dto.expectedDate) : null;
    if (!orderDate || (dto.expectedDate && !expectedDate)) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    if (expectedDate && expectedDate.getTime() < orderDate.getTime()) {
      throw AppException.badRequest('INVALID_DATE_RANGE', 'La livraison prévue ne peut pas précéder la commande.');
    }

    const id = await this.prisma.runInTransaction(async (tx) => {
      let supplierName = dto.supplierName?.trim() || null;
      if (dto.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, ownerClientId: project.clientId }, select: { name: true } });
        if (!supplier) throw AppException.badRequest('INVALID_SUPPLIER', "Ce fournisseur n'existe pas.");
        supplierName = supplier.name;
      }
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      const number = await nextProjectNumber(tx, 'purchaseOrder', projectId);
      const order = await tx.purchaseOrder.create({
        data: {
          projectId,
          number,
          supplierId: dto.supplierId,
          supplierName,
          phaseId: dto.phaseId,
          reference: dto.reference?.trim() || null,
          orderDate,
          expectedDate,
          notes: dto.notes?.trim() || null,
          createdById: actor.userId,
          lines: {
            create: dto.lines.map((l, position) => ({
              position,
              label: normalizeStockName(l.label),
              unit: l.unit.trim(),
              quantityOrdered: new Prisma.Decimal(l.quantityOrdered),
              unitPrice: l.unitPrice !== undefined ? roundMoney(l.unitPrice) : null,
            })),
          },
        },
      });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'PurchaseOrder', entityId: order.id, newValue: { projectId, number, lines: dto.lines.length } }, tx);
      return order.id;
    });
    return this.findOrder(projectId, id);
  }

  async cancelOrder(projectId: string, id: string, dto: CancelOrderDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), [...OWNERS, 'SITE_MANAGER'], 'Votre fonction ne permet pas d\'annuler une commande.');

    await this.prisma.runInTransaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({ where: { id, projectId }, include: { _count: { select: { deliveries: true } } } });
      if (!order) throw AppException.notFound('Commande');
      if (order.status === 'CANCELLED') throw AppException.conflict('ORDER_CANCELLED', 'Cette commande est déjà annulée.');
      if (order._count.deliveries > 0) throw AppException.conflict('ORDER_HAS_DELIVERIES', 'Des livraisons ont déjà été reçues : la commande ne peut plus être annulée.');
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CANCEL', entityType: 'PurchaseOrder', entityId: id, oldValue: { status: order.status }, newValue: { status: 'CANCELLED' }, reason: dto.reason }, tx);
    });
    return this.findOrder(projectId, id);
  }

  // -------------------------------------------------------------------------
  // Livraisons
  // -------------------------------------------------------------------------
  private async findOrCreateStockItem(tx: TxClient, projectId: string, name: string, unit: string) {
    const existing = await tx.stockItem.findFirst({ where: { projectId, unit, name: { equals: name, mode: 'insensitive' } } });
    if (existing) return existing;
    return tx.stockItem.create({ data: { projectId, name, unit } });
  }

  private async presentDeliveries(rows: Array<Prisma.DeliveryGetPayload<{ include: { lines: true; order: { select: { number: true } } } }>>) {
    const [names, files] = await Promise.all([
      loadUserNames(this.prisma, rows.map((r) => r.receivedById)),
      this.attachments.listForEntities('Delivery', rows.map((r) => r.id)),
    ]);
    return rows.map(({ order, ...row }) => ({
      ...row,
      date: toIsoDate(row.date),
      orderNumber: order?.number ?? null,
      receivedByName: names.get(row.receivedById) ?? null,
      hasRefusals: row.lines.some((l) => l.quantityRefused.greaterThan(0)),
      attachments: files.get(row.id) ?? [],
    }));
  }

  async listDeliveries(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.delivery.findMany({ where: { projectId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200, include: { lines: true, order: { select: { number: true } } } });
    return this.presentDeliveries(rows);
  }

  async findDelivery(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.delivery.findFirst({ where: { id, projectId }, include: { lines: true, order: { select: { number: true } } } });
    if (!row) throw AppException.notFound('Livraison');
    return (await this.presentDeliveries([row]))[0];
  }

  /**
   * Enregistre un bon de livraison : une entree de stock par ligne (quantite recue moins quantite refusee),
   * le statut de la commande est recalcule. Rejouable sans doublon grace a clientRef (saisie hors ligne).
   */
  async createDelivery(projectId: string, dto: CreateDeliveryDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, 'Seuls les intervenants de terrain enregistrent une livraison.');

    if (dto.clientRef) {
      const already = await this.prisma.delivery.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.findDelivery(projectId, already.id);
    }
    const today = startOfUtcDay();
    const date = dto.date ? parseIsoDate(dto.date) : today;
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    assertEditableDay(actor.role, date, today);

    const site = await this.prisma.project.findUnique({ where: { id: projectId }, select: { siteLatitude: true, siteLongitude: true, geoFenceMeters: true } });
    const location = assessLocation(site ?? { siteLatitude: null, siteLongitude: null, geoFenceMeters: 500 }, dto.latitude, dto.longitude);

    const { id, refusals, orderNumber } = await this.prisma.runInTransaction(async (tx) => {
      let order: Prisma.PurchaseOrderGetPayload<{ include: { lines: true } }> | null = null;
      if (dto.orderId) {
        order = await tx.purchaseOrder.findFirst({ where: { id: dto.orderId, projectId }, include: { lines: true } });
        if (!order) throw AppException.notFound('Commande');
        if (order.status === 'CANCELLED') throw AppException.conflict('ORDER_CANCELLED', 'Cette commande est annulée.');
      }
      let supplierName = dto.supplierName?.trim() || order?.supplierName || null;
      const supplierId = dto.supplierId ?? order?.supplierId ?? undefined;
      if (dto.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, ownerClientId: project.clientId }, select: { name: true } });
        if (!supplier) throw AppException.badRequest('INVALID_SUPPLIER', "Ce fournisseur n'existe pas.");
        supplierName = supplier.name;
      }

      const delivery = await tx.delivery.create({
        data: {
          projectId,
          orderId: order?.id,
          supplierId,
          supplierName,
          noteReference: dto.noteReference?.trim() || null,
          date,
          notes: dto.notes?.trim() || null,
          latitude: location.latitude,
          longitude: location.longitude,
          isOffSite: location.isOffSite,
          clientRef: dto.clientRef,
          receivedById: actor.userId,
        },
      });

      let refusalCount = 0;
      for (const line of dto.lines) {
        const orderLine = line.orderLineId ? order?.lines.find((l) => l.id === line.orderLineId) : undefined;
        if (line.orderLineId && !orderLine) throw AppException.badRequest('INVALID_ORDER_LINE', "Cette ligne n'appartient pas à la commande indiquée.");
        const label = normalizeStockName(orderLine?.label ?? line.label ?? '');
        const unit = (orderLine?.unit ?? line.unit ?? '').trim();
        if (!label || !unit) throw AppException.badRequest('INCOMPLETE_LINE', 'Chaque ligne doit avoir un libellé et une unité.');

        const received = new Prisma.Decimal(line.quantityReceived);
        const refused = new Prisma.Decimal(line.quantityRefused ?? 0);
        const accepted = acceptedQuantity(received, refused);
        if (accepted.lessThan(0)) throw AppException.badRequest('REFUSED_EXCEEDS_RECEIVED', `La quantité refusée dépasse la quantité reçue pour « ${label} ».`);
        if (refused.greaterThan(0)) refusalCount += 1;

        const item = await this.findOrCreateStockItem(tx, projectId, label, unit);
        const deliveryLine = await tx.deliveryLine.create({
          data: { deliveryId: delivery.id, orderLineId: orderLine?.id, stockItemId: item.id, label, unit, quantityReceived: received, quantityRefused: refused, note: line.note?.trim() || null },
        });
        if (accepted.greaterThan(0)) {
          await tx.stockMovement.create({
            data: { projectId, stockItemId: item.id, type: 'IN', quantity: accepted, deliveryLineId: deliveryLine.id, date, note: `Livraison${dto.noteReference ? ` ${dto.noteReference.trim()}` : ''}`, createdById: actor.userId },
          });
        }
      }

      if (order) {
        const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: order.id }, include: { deliveryLines: { select: { quantityReceived: true, quantityRefused: true } } } });
        const status = orderStatusFrom(
          lines.map((l) => ({ ordered: l.quantityOrdered, accepted: l.deliveryLines.reduce((s, d) => s.add(acceptedQuantity(d.quantityReceived, d.quantityRefused)), new Prisma.Decimal(0)) })),
        );
        if (status !== order.status) await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
      }

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Delivery', entityId: delivery.id, newValue: { projectId, orderId: order?.id, lines: dto.lines.length, refusals: refusalCount, offSite: location.isOffSite } },
        tx,
      );
      return { id: delivery.id, refusals: refusalCount, orderNumber: order?.number ?? null };
    });

    const where = supplierLabel(dto.supplierName);
    await this.notifier.toClient(project, {
      type: 'DELIVERY_RECEIVED',
      title: 'Livraison reçue sur le chantier',
      message: `Livraison${where}${orderNumber ? ` (commande n°${orderNumber})` : ''} : ${dto.lines.length} article(s)${refusals ? `, dont ${refusals} avec refus` : ''}.`,
      path: '/purchasing',
      meta: { deliveryId: id },
    });
    if (location.isOffSite) {
      await this.notifier.toClient(project, {
        type: 'LOCATION_ALERT',
        title: 'Livraison saisie loin du chantier',
        message: `Une livraison a été enregistrée à ${location.distanceMeters} m du chantier.`,
        path: '/purchasing',
        meta: { deliveryId: id },
      });
    }
    return this.findDelivery(projectId, id);
  }
}

function supplierLabel(name?: string): string {
  return name?.trim() ? ` de ${name.trim()}` : '';
}
