//backend/src/suppliers/suppliers.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { roundMoney, subtract, toDecimal } from '../common/utils/money.util';
import { findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, getSiteRole, OWNERS } from '../site-common/site-access';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './dto/supplier.dto';

/**
 * Annuaire des fournisseurs et sous-traitants du CLIENT (partage entre ses projets).
 * Chaque fiche affiche, pour le projet consulte, ce qui a ete depense et ce qui reste du.
 */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async clientIdOf(projectId: string): Promise<string> {
    return (await findProjectOrThrow(this.prisma, projectId)).clientId;
  }

  async list(projectId: string, query: SupplierQueryDto) {
    const clientId = await this.clientIdOf(projectId);
    const where: Prisma.SupplierWhereInput = {
      ownerClientId: clientId,
      kind: query.kind,
      isActive: query.includeInactive ? undefined : true,
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { trade: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [suppliers, spent, contracts] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.expense.groupBy({
        by: ['supplierId'],
        where: { projectId, supplierId: { not: null }, status: 'APPROVED' },
        _sum: { total: true, amountPaidToSupplier: true },
        _count: { _all: true },
      }),
      this.prisma.contract.groupBy({ by: ['supplierId'], where: { projectId, status: { not: 'CANCELLED' } }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const spentBy = new Map(spent.map((row) => [row.supplierId, row]));
    const contractBy = new Map(contracts.map((row) => [row.supplierId, row]));

    return suppliers.map((supplier) => {
      const s = spentBy.get(supplier.id);
      const c = contractBy.get(supplier.id);
      const total = toDecimal(s?._sum.total ?? 0);
      return {
        ...supplier,
        expenseCount: s?._count._all ?? 0,
        totalSpent: roundMoney(total),
        /** Reste du au fournisseur sur ce projet (depenses a credit ou payees partiellement). */
        balanceDue: roundMoney(subtract(total, s?._sum.amountPaidToSupplier ?? 0)),
        contractCount: c?._count._all ?? 0,
        contractedAmount: roundMoney(c?._sum.amount ?? 0),
      };
    });
  }

  async findOne(projectId: string, id: string) {
    const clientId = await this.clientIdOf(projectId);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, ownerClientId: clientId } });
    if (!supplier) throw AppException.notFound('Fournisseur');
    const [expenses, contracts] = await Promise.all([
      this.prisma.expense.findMany({
        where: { projectId, supplierId: id, status: { in: ['APPROVED', 'PENDING'] } },
        orderBy: { date: 'desc' },
        take: 50,
        select: { id: true, date: true, label: true, total: true, amountPaidToSupplier: true, status: true, paymentStatus: true, invoiceReference: true },
      }),
      this.prisma.contract.findMany({ where: { projectId, supplierId: id }, orderBy: { number: 'desc' }, select: { id: true, number: true, title: true, amount: true, status: true } }),
    ]);
    return { ...supplier, expenses, contracts };
  }

  async create(projectId: string, dto: CreateSupplierDto, actor: AuthenticatedUser) {
    const clientId = await this.clientIdOf(projectId);
    const role = await getSiteRole(this.prisma, projectId, actor);
    // Les superviseurs ajoutent les fournisseurs qu'ils rencontrent ; l'architecte consulte seulement.
    assertSiteRole(role, ['SUPERADMIN', 'CLIENT', 'SUPERVISOR', 'SITE_MANAGER']);
    const name = dto.name.trim();

    return this.prisma.runInTransaction(async (tx) => {
      const clash = await tx.supplier.findFirst({ where: { ownerClientId: clientId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
      if (clash) throw AppException.conflict('SUPPLIER_NAME_TAKEN', 'Un fournisseur porte déjà ce nom.');
      const created = await tx.supplier.create({
        data: { ownerClientId: clientId, name, kind: dto.kind ?? 'SUPPLIER', trade: dto.trade?.trim(), phone: dto.phone?.trim(), email: dto.email?.trim(), address: dto.address?.trim(), taxId: dto.taxId?.trim(), notes: dto.notes?.trim() },
      });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Supplier', entityId: created.id, newValue: { name, kind: created.kind, clientId } }, tx);
      return created;
    });
  }

  async update(projectId: string, id: string, dto: UpdateSupplierDto, actor: AuthenticatedUser) {
    const clientId = await this.clientIdOf(projectId);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), [...OWNERS, 'SITE_MANAGER'], 'Seuls le client et le conducteur de travaux modifient une fiche.');

    return this.prisma.runInTransaction(async (tx) => {
      const current = await tx.supplier.findFirst({ where: { id, ownerClientId: clientId } });
      if (!current) throw AppException.notFound('Fournisseur');
      const name = dto.name?.trim();
      if (name && name.toLowerCase() !== current.name.toLowerCase()) {
        const clash = await tx.supplier.findFirst({ where: { ownerClientId: clientId, id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
        if (clash) throw AppException.conflict('SUPPLIER_NAME_TAKEN', 'Un fournisseur porte déjà ce nom.');
      }
      const updated = await tx.supplier.update({
        where: { id },
        data: { name, kind: dto.kind, trade: dto.trade?.trim(), phone: dto.phone?.trim(), email: dto.email?.trim(), address: dto.address?.trim(), taxId: dto.taxId?.trim(), notes: dto.notes?.trim(), isActive: dto.isActive },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Supplier', entityId: id, oldValue: { name: current.name, isActive: current.isActive }, newValue: dto },
        tx,
      );
      return updated;
    });
  }
}
