//backend/src/progress/phase-costs.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findProjectOrThrow } from '../attendance/attendance.helpers';
import { roundMoney, subtract, toDecimal } from '../common/utils/money.util';
import { forecastAtCompletion } from './progress.calc';

const ZERO = () => toDecimal(0);

/**
 * Cout par etape : budget, depense validee, depense en attente, engagements (marches de sous-traitance), reste,
 * et prevision de cout final d'apres l'avancement valide. Les depenses sans etape sont regroupees a part.
 */
@Injectable()
export class PhaseCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    const [budgetRow, phases, spentRows, contractRows] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { budget: true, progressPercent: true } }),
      this.prisma.projectPhase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.expense.groupBy({
        by: ['phaseId', 'status'],
        where: { projectId, status: { in: ['APPROVED', 'PENDING'] }, isArchived: false },
        _sum: { total: true },
      }),
      this.prisma.contract.groupBy({
        by: ['phaseId'],
        where: { projectId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        _sum: { amount: true },
      }),
    ]);

    const spent = new Map<string | null, { approved: Prisma.Decimal; pending: Prisma.Decimal }>();
    for (const row of spentRows) {
      const entry = spent.get(row.phaseId) ?? { approved: ZERO(), pending: ZERO() };
      const value = toDecimal(row._sum.total ?? 0);
      if (row.status === 'APPROVED') entry.approved = entry.approved.add(value);
      else entry.pending = entry.pending.add(value);
      spent.set(row.phaseId, entry);
    }
    const committed = new Map(contractRows.map((row) => [row.phaseId, toDecimal(row._sum.amount ?? 0)]));

    const items = phases.map((phase) => {
      const s = spent.get(phase.id) ?? { approved: ZERO(), pending: ZERO() };
      const budget = phase.budgetAmount;
      const { forecast, variance } = forecastAtCompletion(s.approved, phase.progressPercent, budget);
      const remaining = budget ? subtract(budget, s.approved) : null;
      const usedPercent = budget && budget.greaterThan(0) ? Math.round(s.approved.div(budget).mul(100).toNumber()) : null;
      return {
        id: phase.id,
        name: phase.name,
        position: phase.position,
        isActive: phase.isActive,
        progressPercent: phase.progressPercent,
        budgetAmount: budget,
        spent: roundMoney(s.approved),
        pending: roundMoney(s.pending),
        committed: roundMoney(committed.get(phase.id) ?? 0),
        remaining: remaining ? roundMoney(remaining) : null,
        usedPercent,
        overBudget: budget ? s.approved.greaterThan(budget) : false,
        forecast,
        forecastVariance: variance,
        /** Vrai si le cout final prevu depasse le budget de l'etape. */
        forecastOverBudget: variance ? variance.lessThan(0) : false,
      };
    });

    const unallocated = spent.get(null) ?? { approved: ZERO(), pending: ZERO() };
    const budgetOfPhases = items.reduce((sum, i) => (i.budgetAmount ? sum.add(i.budgetAmount) : sum), ZERO());
    const totalSpent = items.reduce((sum, i) => sum.add(i.spent), ZERO()).add(unallocated.approved);

    return {
      currency: project.currency,
      projectBudget: budgetRow?.budget ?? ZERO(),
      progressPercent: budgetRow?.progressPercent ?? 0,
      totals: {
        phaseBudgets: roundMoney(budgetOfPhases),
        // Budget du projet non reparti entre les etapes (negatif : les etapes depassent le budget du projet).
        unallocatedBudget: roundMoney(subtract(budgetRow?.budget ?? 0, budgetOfPhases)),
        spent: roundMoney(totalSpent),
        pending: roundMoney(items.reduce((sum, i) => sum.add(i.pending), ZERO()).add(unallocated.pending)),
        committed: roundMoney(items.reduce((sum, i) => sum.add(i.committed), ZERO()).add(committed.get(null) ?? 0)),
      },
      unallocated: { spent: roundMoney(unallocated.approved), pending: roundMoney(unallocated.pending) },
      phases: items,
    };
  }
}
