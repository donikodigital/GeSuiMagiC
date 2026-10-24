//backend/src/quotes/quotes.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { roundMoney, toDecimal } from '../common/utils/money.util';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { parseIsoDate, toIsoDate } from '../common/utils/month.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, DECISION_MAKERS, getSiteRole, OWNERS } from '../site-common/site-access';
import { ContractsService } from '../contracts/contracts.service';
import { buildComparison, lineTotal, quoteTotal } from './quotes.calc';
import { AwardLotDto, CreateLotDto, LotItemDto, UpdateLotDto, UpsertQuoteDto } from './dto/quote.dto';

const lotInclude = {
  phase: { select: { name: true } },
  items: { orderBy: { position: 'asc' as const } },
  quotes: { orderBy: { totalAmount: 'asc' as const }, include: { supplier: { select: { id: true, name: true, trade: true } }, lines: true } },
} satisfies Prisma.QuoteLotInclude;

type LotFull = Prisma.QuoteLotGetPayload<{ include: typeof lotInclude }>;

/** Lots a chiffrer (metre), devis des fournisseurs, comparaison ligne a ligne et attribution. */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
  ) {}

  private estimateOf(items: Array<{ quantity: Prisma.Decimal; estimatedUnitPrice: Prisma.Decimal | null }>): Prisma.Decimal | null {
    if (items.length === 0 || items.some((i) => !i.estimatedUnitPrice)) return null;
    return roundMoney(items.reduce((sum, i) => sum.add((i.estimatedUnitPrice as Prisma.Decimal).mul(i.quantity)), new Prisma.Decimal(0)));
  }

  private present(lot: LotFull) {
    const { phase, items, quotes, ...rest } = lot;
    const comparison = buildComparison(
      items,
      quotes.map((q) => ({ id: q.id, supplierId: q.supplierId, supplierName: q.supplier.name, totalAmount: q.totalAmount, lines: q.lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice, total: l.total })) })),
      lot.estimatedAmount,
    );
    return {
      ...rest,
      phaseName: phase?.name ?? null,
      items,
      quotes: quotes.map((q) => ({ ...q, validUntil: q.validUntil ? toIsoDate(q.validUntil) : null })),
      comparison,
    };
  }

  private async load(projectId: string, id: string): Promise<LotFull> {
    const lot = await this.prisma.quoteLot.findFirst({ where: { id, projectId }, include: lotInclude });
    if (!lot) throw AppException.notFound('Lot');
    return lot;
  }

  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const lots = await this.prisma.quoteLot.findMany({
      where: { projectId },
      orderBy: { number: 'desc' },
      include: { phase: { select: { name: true } }, _count: { select: { items: true, quotes: true } }, quotes: { select: { totalAmount: true } } },
    });
    return lots.map(({ phase, _count, quotes, ...lot }) => ({
      ...lot,
      phaseName: phase?.name ?? null,
      itemCount: _count.items,
      quoteCount: _count.quotes,
      lowestQuote: quotes.length ? quotes.reduce((min, q) => (q.totalAmount.lessThan(min) ? q.totalAmount : min), quotes[0].totalAmount) : null,
    }));
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.present(await this.load(projectId, id));
  }

  private async assertPhase(tx: TxClient, projectId: string, phaseId?: string | null) {
    if (!phaseId) return;
    const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId }, select: { id: true } });
    if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
  }

  private itemData(item: LotItemDto, position: number) {
    return {
      position,
      label: item.label.trim(),
      unit: item.unit.trim(),
      quantity: new Prisma.Decimal(item.quantity),
      estimatedUnitPrice: item.estimatedUnitPrice !== undefined ? roundMoney(item.estimatedUnitPrice) : null,
    };
  }

  async create(projectId: string, dto: CreateLotDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Votre fonction ne permet pas de créer un lot.');

    const id = await this.prisma.runInTransaction(async (tx) => {
      await this.assertPhase(tx, projectId, dto.phaseId);
      const number = await nextProjectNumber(tx, 'quoteLot', projectId);
      const data = dto.items.map((item, index) => this.itemData(item, index));
      const lot = await tx.quoteLot.create({
        data: {
          projectId,
          number,
          phaseId: dto.phaseId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          estimatedAmount: this.estimateOf(data as Array<{ quantity: Prisma.Decimal; estimatedUnitPrice: Prisma.Decimal | null }>),
          createdById: actor.userId,
          items: { create: data },
        },
      });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'QuoteLot', entityId: lot.id, newValue: { projectId, number, items: data.length } }, tx);
      return lot.id;
    });
    return this.findOne(projectId, id);
  }

  async update(projectId: string, id: string, dto: UpdateLotDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Votre fonction ne permet pas de modifier un lot.');

    await this.prisma.runInTransaction(async (tx) => {
      const lot = await tx.quoteLot.findFirst({ where: { id, projectId }, include: { items: true, _count: { select: { quotes: true } } } });
      if (!lot) throw AppException.notFound('Lot');
      if (lot.status !== 'OPEN') throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est attribué ou clos : il ne peut plus être modifié.');
      await this.assertPhase(tx, projectId, dto.phaseId);

      let estimatedAmount: Prisma.Decimal | null | undefined;
      if (dto.items) {
        if (lot._count.quotes > 0) throw AppException.conflict('LOT_HAS_QUOTES', 'Des devis ont été reçus : le métré ne peut plus changer.');
        const known = new Map(lot.items.map((i) => [i.id, i]));
        for (const item of dto.items) {
          if (item.id && !known.has(item.id)) throw AppException.badRequest('INVALID_ITEM', "Un poste n'appartient pas à ce lot.");
        }
        const keep = new Set(dto.items.filter((i) => i.id).map((i) => i.id as string));
        await tx.quoteLotItem.deleteMany({ where: { lotId: id, id: { notIn: [...keep] } } });
        const data = dto.items.map((item, index) => ({ id: item.id, data: this.itemData(item, index) }));
        for (const row of data) {
          if (row.id) await tx.quoteLotItem.update({ where: { id: row.id }, data: row.data });
          else await tx.quoteLotItem.create({ data: { ...row.data, lotId: id } });
        }
        estimatedAmount = this.estimateOf(data.map((d) => d.data as { quantity: Prisma.Decimal; estimatedUnitPrice: Prisma.Decimal | null }));
      }
      await tx.quoteLot.update({ where: { id }, data: { title: dto.title?.trim(), description: dto.description?.trim(), phaseId: dto.phaseId, estimatedAmount } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'QuoteLot', entityId: id, newValue: { title: dto.title, items: dto.items?.length } }, tx);
    });
    return this.findOne(projectId, id);
  }

  /** Enregistre (ou remplace) le devis d'un fournisseur sur un lot : un seul devis par fournisseur et par lot. */
  async upsertQuote(projectId: string, lotId: string, dto: UpsertQuoteDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Votre fonction ne permet pas de saisir un devis.');
    const validUntil = dto.validUntil ? parseIsoDate(dto.validUntil) : null;
    if (dto.validUntil && !validUntil) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');

    await this.prisma.runInTransaction(async (tx) => {
      const lot = await tx.quoteLot.findFirst({ where: { id: lotId, projectId }, include: { items: true } });
      if (!lot) throw AppException.notFound('Lot');
      if (lot.status !== 'OPEN') throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est attribué ou clos : plus de devis.');
      const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, ownerClientId: project.clientId, isActive: true }, select: { id: true } });
      if (!supplier) throw AppException.badRequest('INVALID_SUPPLIER', "Ce fournisseur n'existe pas ou n'est plus actif.");

      const items = new Map(lot.items.map((i) => [i.id, i]));
      const seen = new Set<string>();
      const lines = dto.lines.map((line) => {
        const item = line.itemId ? items.get(line.itemId) : undefined;
        if (line.itemId) {
          if (!item) throw AppException.badRequest('INVALID_ITEM', "Un poste n'appartient pas à ce lot.");
          if (seen.has(line.itemId)) throw AppException.badRequest('DUPLICATE_ITEM', 'Un même poste est chiffré deux fois.');
          seen.add(line.itemId);
        } else if (!line.label || !line.unit || line.quantity === undefined) {
          throw AppException.badRequest('INCOMPLETE_LINE', 'Une ligne libre doit avoir un libellé, une unité et une quantité.');
        }
        const quantity = item ? item.quantity : new Prisma.Decimal(line.quantity as number);
        const unitPrice = roundMoney(line.unitPrice);
        return { itemId: item?.id, label: item ? item.label : (line.label as string).trim(), unit: item ? item.unit : (line.unit as string).trim(), quantity, unitPrice, total: lineTotal({ quantity, unitPrice }) };
      });
      const totalAmount = quoteTotal(lines);

      const existing = await tx.supplierQuote.findUnique({ where: { lotId_supplierId: { lotId, supplierId: dto.supplierId } }, select: { id: true } });
      if (existing) await tx.supplierQuoteLine.deleteMany({ where: { quoteId: existing.id } });
      const base = { reference: dto.reference?.trim() || null, validUntil, notes: dto.notes?.trim() || null, totalAmount, status: 'SUBMITTED' as const, lines: { create: lines } };
      const quote = existing
        ? await tx.supplierQuote.update({ where: { id: existing.id }, data: base })
        : await tx.supplierQuote.create({ data: { ...base, lotId, supplierId: dto.supplierId, createdById: actor.userId } });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: existing ? 'UPDATE' : 'CREATE', entityType: 'SupplierQuote', entityId: quote.id, newValue: { lotId, supplierId: dto.supplierId, total: totalAmount.toString() } },
        tx,
      );
    });
    return this.findOne(projectId, lotId);
  }

  async deleteQuote(projectId: string, lotId: string, quoteId: string, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Votre fonction ne permet pas de supprimer un devis.');

    await this.prisma.runInTransaction(async (tx) => {
      const quote = await tx.supplierQuote.findFirst({ where: { id: quoteId, lotId, lot: { projectId } }, include: { lot: { select: { status: true } } } });
      if (!quote) throw AppException.notFound('Devis');
      if (quote.lot.status !== 'OPEN') throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est attribué ou clos.');
      await tx.supplierQuote.delete({ where: { id: quoteId } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'SupplierQuote', entityId: quoteId, oldValue: { lotId, total: quote.totalAmount.toString() } }, tx);
    });
    return this.findOne(projectId, lotId);
  }

  /** Attribue le lot au devis retenu (les autres sont ecartes) et, au choix, cree le marche correspondant. */
  async award(projectId: string, lotId: string, dto: AwardLotDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, "Seuls le client et le superadministrateur attribuent un lot.");

    await this.prisma.runInTransaction(async (tx) => {
      const lot = await tx.quoteLot.findFirst({ where: { id: lotId, projectId }, include: { items: { select: { id: true } } } });
      if (!lot) throw AppException.notFound('Lot');
      if (lot.status !== 'OPEN') throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est déjà attribué ou clos.');
      const quote = await tx.supplierQuote.findFirst({ where: { id: dto.quoteId, lotId } });
      if (!quote) throw AppException.badRequest('INVALID_QUOTE', "Ce devis n'appartient pas à ce lot.");
      if (quote.validUntil && quote.validUntil.getTime() < Date.now() - 24 * 3600 * 1000) {
        throw AppException.badRequest('QUOTE_EXPIRED', 'Ce devis a expiré : demandez au fournisseur de le renouveler.');
      }

      const done = await tx.quoteLot.updateMany({ where: { id: lotId, status: 'OPEN' }, data: { status: 'AWARDED', awardedQuoteId: quote.id } });
      if (done.count !== 1) throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est déjà attribué ou clos.');
      await tx.supplierQuote.update({ where: { id: quote.id }, data: { status: 'SELECTED' } });
      await tx.supplierQuote.updateMany({ where: { lotId, id: { not: quote.id } }, data: { status: 'REJECTED' } });
      if (dto.createContract) {
        await this.contracts.createInTx(
          tx,
          projectId,
          project.clientId,
          { supplierId: quote.supplierId, title: lot.title, description: lot.description ?? undefined, amount: toDecimal(quote.totalAmount), retentionPercent: dto.createContract.retentionPercent, phaseId: lot.phaseId, quoteId: quote.id },
          actor,
        );
      }
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'QuoteLot', entityId: lotId, newValue: { quoteId: quote.id, total: quote.totalAmount.toString(), contractCreated: !!dto.createContract } },
        tx,
      );
    });
    return this.findOne(projectId, lotId);
  }

  /** Cloture sans attribution (appel d'offres abandonne). */
  async close(projectId: string, lotId: string, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seuls le client et le superadministrateur closent un lot.');
    const done = await this.prisma.quoteLot.updateMany({ where: { id: lotId, projectId, status: 'OPEN' }, data: { status: 'CLOSED' } });
    if (done.count !== 1) throw AppException.conflict('LOT_NOT_OPEN', 'Ce lot est introuvable ou déjà traité.');
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'QuoteLot', entityId: lotId, newValue: { status: 'CLOSED' } });
    return this.findOne(projectId, lotId);
  }
}
