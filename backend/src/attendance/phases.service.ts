//backend/src/attendance/phases.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { summarizeByPhase } from './attendance.calc';
import { createDefaultPhases } from './attendance.constants';
import { findProjectOrThrow } from './attendance.helpers';
import { parseIsoDate, toIsoDate } from '../common/utils/month.util';
import { roundMoney } from '../common/utils/money.util';
import { assertSiteRole, getSiteRole, OWNERS } from '../site-common/site-access';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { ReorderPhasesDto } from './dto/reorder-phases.dto';

/**
 * Etapes du chantier (Fondation, Murs, Toiture...), configurables par projet.
 * Le client, ses superviseurs affectes et le superadmin peuvent les gerer ; une etape deja
 * utilisee par un jour travaille ne peut plus etre supprimee (seulement desactivee), pour ne
 * jamais perdre l'historique des jours.
 */
@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Etapes du projet, dans l'ordre, avec jours travailles et jours-ouvriers cumules. */
  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.listWithStats(projectId);
  }

  private async listWithStats(projectId: string) {
    const [phases, rows] = await Promise.all([
      this.prisma.projectPhase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.workDay.findMany({
        where: { projectId, isWorked: true },
        select: { date: true, isWorked: true, workersCount: true, phaseId: true },
      }),
    ]);
    const stats = new Map(summarizeByPhase(rows, phases).map((s) => [s.phaseId, s]));
    return phases.map((phase) => {
      const s = stats.get(phase.id)!;
      return { ...phase, workedDays: s.workedDays, workerDays: s.workerDays, firstDate: s.firstDate, lastDate: s.lastDate };
    });
  }

  async create(projectId: string, dto: CreatePhaseDto, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);
    const name = dto.name.trim();
    if (dto.budgetAmount !== undefined) await this.assertBudgetRight(projectId, actor);
    if (dto.plannedStart !== undefined || dto.plannedEnd !== undefined) await this.assertPlanningRight(projectId, actor);
    const planned = this.parsePlanning(dto, { plannedStart: null, plannedEnd: null });

    return this.prisma.runInTransaction(async (tx) => {
      const clash = await tx.projectPhase.findFirst({
        where: { projectId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (clash) throw AppException.conflict('PHASE_NAME_TAKEN', 'Une étape porte déjà ce nom.');

      const last = await tx.projectPhase.aggregate({ where: { projectId }, _max: { position: true } });
      const created = await tx.projectPhase.create({
        data: {
          projectId,
          name,
          position: (last._max.position ?? -1) + 1,
          budgetAmount: dto.budgetAmount !== undefined ? roundMoney(dto.budgetAmount) : undefined,
          plannedStart: planned.plannedStart ?? undefined,
          plannedEnd: planned.plannedEnd ?? undefined,
        },
      });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectPhase', entityId: created.id, newValue: { projectId, name } },
        tx,
      );
      return created;
    });
  }

  /** Etapes par defaut, pour un projet cree avant l'existence du suivi (aucune etape). */
  async createDefaults(projectId: string, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);

    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.projectPhase.count({ where: { projectId } });
      if (existing > 0) throw AppException.conflict('PHASES_ALREADY_EXIST', 'Ce projet a déjà des étapes.');
      await createDefaultPhases(tx, projectId);
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectPhase', entityId: projectId, newValue: { defaults: true } },
        tx,
      );
    });
    return this.listWithStats(projectId);
  }

  /** Le planning previsionnel est reserve au client, au superadmin et au conducteur de travaux. */
  private async assertPlanningRight(projectId: string, actor: AuthenticatedUser): Promise<void> {
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, [...OWNERS, 'SITE_MANAGER'], 'Seuls le client et le conducteur de travaux modifient le planning.');
  }

  private async assertBudgetRight(projectId: string, actor: AuthenticatedUser): Promise<void> {
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, "Seuls le client et le superadministrateur fixent le budget d'une étape.");
  }

  /** Dates a ecrire (undefined = inchange, null = effacee) ; debut <= fin. */
  private parsePlanning(
    dto: { plannedStart?: string | null; plannedEnd?: string | null },
    current: { plannedStart: Date | null; plannedEnd: Date | null },
  ): { plannedStart: Date | null | undefined; plannedEnd: Date | null | undefined } {
    const parse = (value: string | null | undefined): Date | null | undefined => {
      if (value === undefined || value === null) return value;
      const date = parseIsoDate(value);
      if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
      return date;
    };
    const plannedStart = parse(dto.plannedStart);
    const plannedEnd = parse(dto.plannedEnd);
    const start = plannedStart === undefined ? current.plannedStart : plannedStart;
    const end = plannedEnd === undefined ? current.plannedEnd : plannedEnd;
    if (start && end && start.getTime() > end.getTime()) {
      throw AppException.badRequest('INVALID_PLANNING', 'La date de début doit précéder la date de fin.');
    }
    return { plannedStart, plannedEnd };
  }

  async update(projectId: string, phaseId: string, dto: UpdatePhaseDto, actor: AuthenticatedUser) {
    if (dto.budgetAmount !== undefined) await this.assertBudgetRight(projectId, actor);
    if (dto.plannedStart !== undefined || dto.plannedEnd !== undefined) await this.assertPlanningRight(projectId, actor);

    return this.prisma.runInTransaction(async (tx) => {
      const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId } });
      if (!phase) throw AppException.notFound('Étape');
      const planned = this.parsePlanning(dto, phase);

      const name = dto.name?.trim();
      if (name && name.toLowerCase() !== phase.name.toLowerCase()) {
        const clash = await tx.projectPhase.findFirst({
          where: { projectId, id: { not: phaseId }, name: { equals: name, mode: 'insensitive' } },
          select: { id: true },
        });
        if (clash) throw AppException.conflict('PHASE_NAME_TAKEN', 'Une étape porte déjà ce nom.');
      }

      const updated = await tx.projectPhase.update({
        where: { id: phaseId },
        data: {
          name: name ?? undefined,
          isActive: dto.isActive,
          budgetAmount: dto.budgetAmount === undefined ? undefined : dto.budgetAmount === null ? null : roundMoney(dto.budgetAmount),
          plannedStart: planned.plannedStart,
          plannedEnd: planned.plannedEnd,
        },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'ProjectPhase',
          entityId: phaseId,
          oldValue: {
            name: phase.name,
            isActive: phase.isActive,
            budgetAmount: phase.budgetAmount?.toString() ?? null,
            plannedStart: phase.plannedStart ? toIsoDate(phase.plannedStart) : null,
            plannedEnd: phase.plannedEnd ? toIsoDate(phase.plannedEnd) : null,
          },
          newValue: {
            name: updated.name,
            isActive: updated.isActive,
            budgetAmount: updated.budgetAmount?.toString() ?? null,
            plannedStart: updated.plannedStart ? toIsoDate(updated.plannedStart) : null,
            plannedEnd: updated.plannedEnd ? toIsoDate(updated.plannedEnd) : null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async reorder(projectId: string, dto: ReorderPhasesDto, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);

    await this.prisma.runInTransaction(async (tx) => {
      const phases = await tx.projectPhase.findMany({ where: { projectId }, select: { id: true } });
      const known = new Set(phases.map((p) => p.id));
      if (phases.length !== dto.orderedIds.length || dto.orderedIds.some((id) => !known.has(id))) {
        throw AppException.badRequest('PHASES_MISMATCH', "La liste doit contenir toutes les étapes du projet, une seule fois chacune.");
      }

      for (const [position, id] of dto.orderedIds.entries()) {
        await tx.projectPhase.update({ where: { id }, data: { position } });
      }
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'ProjectPhase', entityId: projectId, newValue: { orderedIds: dto.orderedIds } },
        tx,
      );
    });
    return this.listWithStats(projectId);
  }

  async remove(projectId: string, phaseId: string, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId } });
      if (!phase) throw AppException.notFound('Étape');

      // Toute donnee rattachee a l'etape (jours, depenses, journal, stock...) empeche sa suppression : on la desactive.
      const where = { phaseId };
      const counts = await Promise.all([
        tx.workDay.count({ where }),
        tx.expense.count({ where }),
        tx.siteLog.count({ where }),
        tx.snag.count({ where }),
        tx.reception.count({ where }),
        tx.changeOrder.count({ where }),
        tx.quoteLot.count({ where }),
        tx.contract.count({ where }),
        tx.purchaseOrder.count({ where }),
        tx.stockMovement.count({ where }),
        tx.workerPresence.count({ where }),
        tx.phaseProgressUpdate.count({ where }),
      ]);
      const used = counts.reduce((sum, n) => sum + n, 0);
      if (used > 0) {
        throw AppException.conflict('PHASE_IN_USE', `Cette étape est utilisée par ${used} élément(s) (jours, dépenses, journal...) : désactivez-la plutôt que de la supprimer.`);
      }

      await tx.projectPhase.delete({ where: { id: phaseId } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'ProjectPhase',
          entityId: phaseId,
          oldValue: { projectId, name: phase.name },
        },
        tx,
      );
    });
    return { removed: true };
  }
}
