//backend/src/budgets/budgets.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { add, isGreaterThan, toDecimal } from '../common/utils/money.util';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsert(projectId: string, dto: UpsertBudgetDto, actor: AuthenticatedUser) {
    const budget = await this.prisma.budget.upsert({
      where: { projectId_categoryId: { projectId, categoryId: dto.categoryId } },
      update: { amount: dto.amount },
      create: { projectId, categoryId: dto.categoryId, amount: dto.amount },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: budget.id,
      newValue: { projectId, categoryId: dto.categoryId, amount: dto.amount },
    });

    return budget;
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
    const budget = await this.prisma.budget.findUnique({ where: { projectId_categoryId: { projectId, categoryId } } });
    if (!budget) return;

    await this.prisma.budget.delete({ where: { id: budget.id } });
    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'DELETE_SOFT',
      entityType: 'Budget',
      entityId: budget.id,
      oldValue: { amount: budget.amount },
    });
  }
}
