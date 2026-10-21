//backend/src/materials/materials.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import {
  assertCanManageCatalogueEntry,
  catalogueReadFilter,
  isParentCompatible,
  resolveCatalogueOwner,
} from '../common/utils/catalogue-access.util';
import { UpsertMaterialDto } from './dto/upsert-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

const MATERIAL_INCLUDE = {
  category: true,
  defaultUnit: true,
  ownerClient: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Materiaux. Catalogue par client : voir catalogue-access.util.ts. */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Categorie et unite referencees doivent etre visibles par le proprietaire du materiau :
   * globales, ou appartenant au meme client (un materiau global ne peut pas pointer vers un parent prive).
   */
  private async assertParents(tx: TxClient, owner: string | null, categoryId: string, defaultUnitId?: string | null) {
    const category = await tx.expenseCategory.findUnique({ where: { id: categoryId }, select: { ownerClientId: true } });
    if (!category || !isParentCompatible(owner, category.ownerClientId)) {
      throw AppException.badRequest('INVALID_CATEGORY', "Cette categorie n'existe pas ou n'est pas disponible dans ce catalogue.");
    }
    if (defaultUnitId) {
      const unit = await tx.unit.findUnique({ where: { id: defaultUnitId }, select: { ownerClientId: true } });
      if (!unit || !isParentCompatible(owner, unit.ownerClientId)) {
        throw AppException.badRequest('INVALID_UNIT', "Cette unite n'existe pas ou n'est pas disponible dans ce catalogue.");
      }
    }
  }

  private async assertNameAvailable(tx: TxClient, owner: string | null, categoryId: string, name: string, excludeId?: string) {
    const scope: Prisma.MaterialWhereInput =
      owner === null ? { ownerClientId: null } : { OR: [{ ownerClientId: null }, { ownerClientId: owner }] };
    const duplicate = await tx.material.findFirst({
      where: { AND: [scope, { categoryId }, { name: { equals: name, mode: 'insensitive' } }, excludeId ? { id: { not: excludeId } } : {}] },
      select: { id: true },
    });
    if (duplicate) throw AppException.conflict('MATERIAL_NAME_TAKEN', 'Un materiau portant ce nom existe deja dans cette categorie.');
  }

  async create(dto: UpsertMaterialDto, actor: AuthenticatedUser) {
    const owner = resolveCatalogueOwner(actor, dto.ownerClientId);

    return this.prisma.runInTransaction(async (tx) => {
      await this.assertParents(tx, owner, dto.categoryId, dto.defaultUnitId);
      await this.assertNameAvailable(tx, owner, dto.categoryId, dto.name);

      const material = await tx.material.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          defaultUnitId: dto.defaultUnitId,
          isActive: dto.isActive ?? true,
          ownerClientId: owner,
        },
        include: MATERIAL_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Material',
          entityId: material.id,
          newValue: { name: material.name, categoryId: material.categoryId, defaultUnitId: material.defaultUnitId, ownerClientId: owner },
        },
        tx,
      );
      return material;
    });
  }

  async findAll(actor: AuthenticatedUser, categoryId: string | undefined, includeInactive: boolean) {
    return this.prisma.material.findMany({
      where: { AND: [catalogueReadFilter(actor), categoryId ? { categoryId } : {}, includeInactive ? {} : { isActive: true }] },
      include: MATERIAL_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateMaterialDto, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.material.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Materiau');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Materiau');

      const categoryId = dto.categoryId ?? existing.categoryId;
      const name = dto.name ?? existing.name;

      if (dto.categoryId !== undefined || dto.defaultUnitId !== undefined) {
        await this.assertParents(tx, existing.ownerClientId, categoryId, dto.defaultUnitId);
      }
      if (dto.name !== undefined || dto.categoryId !== undefined) {
        await this.assertNameAvailable(tx, existing.ownerClientId, categoryId, name, id);
      }

      const updated = await tx.material.update({
        where: { id },
        data: { name: dto.name, categoryId: dto.categoryId, defaultUnitId: dto.defaultUnitId, isActive: dto.isActive },
        include: MATERIAL_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Material',
          entityId: id,
          oldValue: { name: existing.name, categoryId: existing.categoryId, defaultUnitId: existing.defaultUnitId, isActive: existing.isActive },
          newValue: { name: updated.name, categoryId: updated.categoryId, defaultUnitId: updated.defaultUnitId, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.material.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Materiau');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Materiau');

      const updated = await tx.material.update({ where: { id }, data: { isActive }, include: MATERIAL_INCLUDE });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Material',
          entityId: id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive },
        },
        tx,
      );
      return updated;
    });
  }

  /** Suppression definitive : uniquement si aucune depense ne reference ce materiau. */
  async remove(id: string, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.material.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Materiau');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Materiau');

      const expensesCount = await tx.expense.count({ where: { materialId: id } });
      if (expensesCount > 0) {
        throw AppException.conflict(
          'MATERIAL_IN_USE',
          `Ce materiau est utilise dans ${expensesCount} depense(s) et ne peut pas etre supprime. Desactivez-le plutot pour le retirer des nouvelles saisies.`,
        );
      }

      await tx.material.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Material',
          entityId: id,
          oldValue: { name: existing.name, categoryId: existing.categoryId, ownerClientId: existing.ownerClientId },
        },
        tx,
      );
      return { removed: true };
    });
  }
}
