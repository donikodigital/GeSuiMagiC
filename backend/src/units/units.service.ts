//backend/src/units/units.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import {
  assertCanManageCatalogueEntry,
  catalogueReadFilter,
  resolveCatalogueOwner,
} from '../common/utils/catalogue-access.util';
import { UpsertUnitDto } from './dto/upsert-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const OWNER_INCLUDE = { ownerClient: { select: { id: true, firstName: true, lastName: true } } } as const;

/** Unites de mesure. Catalogue par client : voir catalogue-access.util.ts. */
@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertNameAvailable(tx: TxClient, owner: string | null, name: string, excludeId?: string) {
    const scope: Prisma.UnitWhereInput =
      owner === null ? { ownerClientId: null } : { OR: [{ ownerClientId: null }, { ownerClientId: owner }] };
    const duplicate = await tx.unit.findFirst({
      where: { AND: [scope, { name: { equals: name, mode: 'insensitive' } }, excludeId ? { id: { not: excludeId } } : {}] },
      select: { id: true },
    });
    if (duplicate) throw AppException.conflict('UNIT_NAME_TAKEN', 'Une unite portant ce nom existe deja.');
  }

  async create(dto: UpsertUnitDto, actor: AuthenticatedUser) {
    const owner = resolveCatalogueOwner(actor, dto.ownerClientId);

    return this.prisma.runInTransaction(async (tx) => {
      await this.assertNameAvailable(tx, owner, dto.name);
      const unit = await tx.unit.create({
        data: { name: dto.name, symbol: dto.symbol, isActive: dto.isActive ?? true, ownerClientId: owner },
        include: OWNER_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Unit',
          entityId: unit.id,
          newValue: { name: unit.name, symbol: unit.symbol, ownerClientId: owner },
        },
        tx,
      );
      return unit;
    });
  }

  async findAll(actor: AuthenticatedUser, includeInactive: boolean) {
    return this.prisma.unit.findMany({
      where: { AND: [catalogueReadFilter(actor), includeInactive ? {} : { isActive: true }] },
      include: OWNER_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateUnitDto, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Unite');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Unite');

      if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
        await this.assertNameAvailable(tx, existing.ownerClientId, dto.name, id);
      }

      const updated = await tx.unit.update({
        where: { id },
        data: { name: dto.name, symbol: dto.symbol, isActive: dto.isActive },
        include: OWNER_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Unit',
          entityId: id,
          oldValue: { name: existing.name, symbol: existing.symbol, isActive: existing.isActive },
          newValue: { name: updated.name, symbol: updated.symbol, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Unite');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Unite');

      const updated = await tx.unit.update({ where: { id }, data: { isActive }, include: OWNER_INCLUDE });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Unit',
          entityId: id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive },
        },
        tx,
      );
      return updated;
    });
  }

  /** Suppression definitive : uniquement si aucun materiau ne l'utilise comme unite par defaut. */
  async remove(id: string, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Unite');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Unite');

      const materialsCount = await tx.material.count({ where: { defaultUnitId: id } });
      if (materialsCount > 0) {
        throw AppException.conflict(
          'UNIT_IN_USE',
          `Cette unite est utilisee comme unite par defaut de ${materialsCount} materiau(x) et ne peut pas etre supprimee. Desactivez-la plutot pour la retirer des nouvelles saisies.`,
        );
      }

      await tx.unit.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Unit',
          entityId: id,
          oldValue: { name: existing.name, symbol: existing.symbol, ownerClientId: existing.ownerClientId },
        },
        tx,
      );
      return { removed: true };
    });
  }
}
