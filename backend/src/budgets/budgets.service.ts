//backend/src/budgets/budgets.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { isCatalogueEntryUsableBy } from '../common/utils/catalogue-access.util';
import { isGreaterThan, roundMoney, toDecimal } from '../common/utils/money.util';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsert(projectId: string, dto: UpsertBudgetDto, actor: AuthenticatedUser) {
    const amount = roundMoney(dto.amount);

    return this.prisma.runInTransaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
      if (!project) throw AppException.notFound('Projet');
      const category = await tx.expenseCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true, ownerClientId: true } });
      // La categorie doit faire partie du catalogue du client du projet (globale ou privee de CE client).
      if (!category || !isCatalogueEntryUsableBy(category.ownerClientId, project.clientId)) {
        throw AppException.badRequest('INVALID_CATEGORY', "Cette catégorie n'existe pas.");
      }

      const previous = await tx.budget.findUnique({ where: { projectId_categoryId: { projectId, categoryId: dto.categoryId } } });
      const budget = await tx.budget.upsert({
        where: { projectId_categoryId: { projectId, categoryId: dto.categoryId } },
        update: { amount },
        create: { projectId, categoryId: dto.categoryId, amount },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Budget',
          entityId: budget.id,
          oldValue: previous ? { amount: previous.amount.toString() } : undefined,
          newValue: { projectId, categoryId: dto.categoryId, amount: amount.toString() },
        },
        tx,
      );
      return budget;
    });
  }

  async listForProject(projectId: string) {
    return this.prisma.budget.findMany({ where: { projectId }, include: { category: true } });
  }

  /**
   * Compare budget previsionnel vs depenses reelles (validees) par
   * categorie, pour le tableau de bord et les alertes de depassement.
   */
  async getComparison(projectId: string) {
    const budgets = await this.prisma.budget.findMany({ where: { projectId }, include: { category: true } });

    const results = await Promise.all(
      budgets.map(async (budget: (typeof budgets)[number]) => {
        const spent = await this.prisma.expense.aggregate({
          where: { projectId, categoryId: budget.categoryId, status: 'APPROVED' },
          _sum: { total: true },
        });
        const spentAmount = toDecimal(spent._sum.total ?? 0);
        const isExceeded = isGreaterThan(spentAmount, budget.amount);
        return {
          categoryId: budget.categoryId,
          categoryName: budget.category.name,
          budgetAmount: budget.amount,
          spentAmount,
          remaining: toDecimal(budget.amount).sub(spentAmount),
          isExceeded,
        };
      }),
    );

    return results;
  }

  /** Utilise par ExpensesService pour declencher l'alerte de depassement (section 42). */
  async isCategoryOverBudget(projectId: string, categoryId: string): Promise<boolean> {
    const budget = await this.prisma.budget.findUnique({ where: { projectId_categoryId: { projectId, categoryId } } });
    if (!budget) return false;

    const spent = await this.prisma.expense.aggregate({
      where: { projectId, categoryId, status: 'APPROVED' },
      _sum: { total: true },
    });
    return isGreaterThan(toDecimal(spent._sum.total ?? 0), budget.amount);
  }

  async remove(projectId: string, categoryId: string, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const budget = await tx.budget.findUnique({ where: { projectId_categoryId: { projectId, categoryId } } });
      if (!budget) return;

      await tx.budget.delete({ where: { id: budget.id } });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'Budget', entityId: budget.id, oldValue: { amount: budget.amount.toString() } },
        tx,
      );
    });
  }
}
