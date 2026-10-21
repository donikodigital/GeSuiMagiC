//backend/src/categories/categories.service.ts
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
import { UpsertCategoryDto } from './dto/upsert-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const OWNER_INCLUDE = { ownerClient: { select: { id: true, firstName: true, lastName: true } } } as const;

/**
 * Categories de depenses. Catalogue par client : voir catalogue-access.util.ts.
 * Les entrees globales (ownerClientId null) sont gerees par le superadmin ; un
 * client (ou ses superviseurs) cree et gere ses propres entrees privees.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Un nom (insensible a la casse) deja pris dans le perimetre du proprietaire ? Global : parmi les globales ; client : globales + siennes. */
  private async assertNameAvailable(tx: TxClient, owner: string | null, name: string, excludeId?: string) {
    const scope: Prisma.ExpenseCategoryWhereInput =
      owner === null ? { ownerClientId: null } : { OR: [{ ownerClientId: null }, { ownerClientId: owner }] };
    const duplicate = await tx.expenseCategory.findFirst({
      where: { AND: [scope, { name: { equals: name, mode: 'insensitive' } }, excludeId ? { id: { not: excludeId } } : {}] },
      select: { id: true },
    });
    if (duplicate) throw AppException.conflict('CATEGORY_NAME_TAKEN', 'Une categorie portant ce nom existe deja.');
  }

  async create(dto: UpsertCategoryDto, actor: AuthenticatedUser) {
    const owner = resolveCatalogueOwner(actor, dto.ownerClientId);

    return this.prisma.runInTransaction(async (tx) => {
      await this.assertNameAvailable(tx, owner, dto.name);
      const category = await tx.expenseCategory.create({
        data: { name: dto.name, group: dto.group, isActive: dto.isActive ?? true, ownerClientId: owner },
        include: OWNER_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'ExpenseCategory',
          entityId: category.id,
          newValue: { name: category.name, group: category.group, ownerClientId: owner },
        },
        tx,
      );
      return category;
    });
  }

  async findAll(actor: AuthenticatedUser, includeInactive: boolean) {
    return this.prisma.expenseCategory.findMany({
      where: { AND: [catalogueReadFilter(actor), includeInactive ? {} : { isActive: true }] },
      include: OWNER_INCLUDE,
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
  }

  async update(id: string, dto: UpdateCategoryDto, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.expenseCategory.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Categorie');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Categorie');

      if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
        await this.assertNameAvailable(tx, existing.ownerClientId, dto.name, id);
      }

      const updated = await tx.expenseCategory.update({
        where: { id },
        data: { name: dto.name, group: dto.group, isActive: dto.isActive },
        include: OWNER_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'ExpenseCategory',
          entityId: id,
          oldValue: { name: existing.name, group: existing.group, isActive: existing.isActive },
          newValue: { name: updated.name, group: updated.group, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.expenseCategory.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Categorie');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Categorie');

      const updated = await tx.expenseCategory.update({ where: { id }, data: { isActive }, include: OWNER_INCLUDE });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'ExpenseCategory',
          entityId: id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive },
        },
        tx,
      );
      return updated;
    });
  }

  /** Suppression definitive : uniquement si non referencee (materiaux, depenses, budgets). */
  async remove(id: string, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.expenseCategory.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Categorie');
      assertCanManageCatalogueEntry(actor, existing.ownerClientId, 'Categorie');

      const [materialsCount, expensesCount, budgetsCount] = await Promise.all([
        tx.material.count({ where: { categoryId: id } }),
        tx.expense.count({ where: { categoryId: id } }),
        tx.budget.count({ where: { categoryId: id } }),
      ]);

      if (materialsCount + expensesCount + budgetsCount > 0) {
        throw AppException.conflict(
          'CATEGORY_IN_USE',
          `Cette categorie est utilisee (${materialsCount} materiau(x), ${expensesCount} depense(s), ${budgetsCount} budget(s)) et ne peut pas etre supprimee. Desactivez-la plutot pour la retirer des nouvelles saisies.`,
        );
      }

      await tx.expenseCategory.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'ExpenseCategory',
          entityId: id,
          oldValue: { name: existing.name, group: existing.group, ownerClientId: existing.ownerClientId },
        },
        tx,
      );
      return { removed: true };
    });
  }
}
