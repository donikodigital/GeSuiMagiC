//backend/src/wallets/wallets.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { add, subtract, toDecimal } from '../common/utils/money.util';
import type { Prisma, PrismaClient } from '@prisma/client';

// IMPORTANT : derive depuis PrismaClient (le client Prisma standard), PAS depuis
// PrismaService. $transaction() fournit un objet typé sur PrismaClient — PrismaService
// ajoute des méthodes custom (onModuleInit, runInTransaction...) que cet objet n'a jamais.
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Coeur financier de l'application (section 12/51).
 *
 * SOLDE = DEPOTS VALIDES - DEPENSES VALIDEES
 *
 * Le champ Wallet.balance est un CACHE : il est toujours recalcule a partir
 * des tables Deposit/Expense au sein de la MEME transaction que l'operation
 * qui le modifie (validation d'un depot, validation/annulation d'une
 * depense, correction administrative). Il n'est JAMAIS ecrit "a la main"
 * ailleurs, ce qui garantit qu'il reste toujours reconciliable.
 */
@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cree le portefeuille (a solde 0) a la creation du projet. */
  async createForProject(projectId: string, currency: string, tx?: TxClient): Promise<void> {
    const client = (tx ?? this.prisma) as any;
    await client.wallet.create({
      data: { projectId, currency, totalDeposited: 0, totalSpent: 0, balance: 0 },
    });
  }

  /**
   * Recalcule integralement le solde a partir des operations validees.
   * A appeler dans la meme transaction que tout changement de statut de
   * depot/depense. Retourne le wallet a jour (utile pour verifier le solde
   * disponible avant d'autoriser une nouvelle depense).
   */
  async recompute(projectId: string, tx?: TxClient) {
    const client = (tx ?? this.prisma) as any;

    const [depositAgg, expenseAgg] = await Promise.all([
      client.deposit.aggregate({ where: { projectId, status: 'APPROVED' }, _sum: { amount: true } }),
      client.expense.aggregate({ where: { projectId, status: 'APPROVED' }, _sum: { total: true } }),
    ]);

    const totalDeposited = toDecimal(depositAgg._sum.amount ?? 0);
    const totalSpent = toDecimal(expenseAgg._sum.total ?? 0);
    const balance = subtract(totalDeposited, totalSpent);

    return client.wallet.update({
      where: { projectId },
      data: { totalDeposited, totalSpent, balance },
    });
  }

  async getWallet(projectId: string) {
    return this.prisma.wallet.findUniqueOrThrow({ where: { projectId } });
  }

  /** Vision consolidee pour le tableau de bord client (section 34). */
  async getFinancialSummary(projectId: string) {
    const [project, wallet, pendingDeposits, pendingExpenses] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { budget: true, currency: true, name: true } }),
      this.prisma.wallet.findUniqueOrThrow({ where: { projectId } }),
      this.prisma.deposit.aggregate({ where: { projectId, status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      this.prisma.expense.aggregate({ where: { projectId, status: 'PENDING' }, _sum: { total: true }, _count: true }),
    ]);

    const budget = toDecimal(project.budget);
    const spentRatio = budget.greaterThan(0) ? wallet.totalSpent.div(budget).mul(100) : toDecimal(0);

    return {
      projectName: project.name,
      currency: project.currency,
      budget: project.budget,
      totalDeposited: wallet.totalDeposited,
      totalSpent: wallet.totalSpent,
      balance: wallet.balance,
      budgetUsedPercent: Number(spentRatio.toFixed(2)),
      pendingDepositsAmount: pendingDeposits._sum.amount ?? 0,
      pendingDepositsCount: pendingDeposits._count,
      pendingExpensesAmount: pendingExpenses._sum.total ?? 0,
      pendingExpensesCount: pendingExpenses._count,
    };
  }
}