//backend/src/progress/planning.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findProjectOrThrow } from '../attendance/attendance.helpers';
import { diffInDays, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { evaluateSchedule, projectedEnd, summarizeStopReasons } from './progress.calc';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Planning (Gantt), retards par etape et raisons d'arret du chantier. */
@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: SiteNotifierService,
  ) {}

  async get(projectId: string, today: Date = startOfUtcDay()) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    const [projectRow, phases, workedDates, completions, days] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, endDate: true, estimatedDurationDays: true, progressPercent: true } }),
      this.prisma.projectPhase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.workDay.groupBy({ by: ['phaseId'], where: { projectId, isWorked: true, phaseId: { not: null } }, _min: { date: true }, _max: { date: true } }),
      // Date a laquelle chaque etape a atteint 100 % (premiere validation a 100 %).
      this.prisma.phaseProgressUpdate.groupBy({ by: ['phaseId'], where: { projectId, status: 'VALIDATED', percent: 100 }, _min: { decidedAt: true } }),
      this.prisma.workDay.findMany({ where: { projectId }, select: { isWorked: true, stopReason: true } }),
    ]);

    const worked = new Map(workedDates.map((w) => [w.phaseId, w]));
    const completed = new Map(completions.map((c) => [c.phaseId, c._min.decidedAt]));

    const items = phases.map((phase) => {
      const actualEnd = completed.get(phase.id) ? startOfUtcDay(completed.get(phase.id)!) : null;
      const schedule = evaluateSchedule({ plannedStart: phase.plannedStart, plannedEnd: phase.plannedEnd, progressPercent: phase.progressPercent, actualEnd }, today);
      const w = worked.get(phase.id);
      return {
        id: phase.id,
        name: phase.name,
        position: phase.position,
        isActive: phase.isActive,
        plannedStart: phase.plannedStart ? toIsoDate(phase.plannedStart) : null,
        plannedEnd: phase.plannedEnd ? toIsoDate(phase.plannedEnd) : null,
        actualStart: w?._min.date ? toIsoDate(w._min.date) : null,
        actualEnd: actualEnd ? toIsoDate(actualEnd) : null,
        progressPercent: phase.progressPercent,
        ...schedule,
      };
    });

    const active = items.filter((i) => i.isActive);
    const end = projectedEnd(active.map((i) => ({ plannedEnd: i.plannedEnd ? new Date(`${i.plannedEnd}T00:00:00.000Z`) : null, delayDays: i.delayDays })));
    const plannedProjectEnd = projectRow?.endDate ?? null;

    return {
      projectId: project.id,
      today: toIsoDate(today),
      startDate: projectRow?.startDate ? toIsoDate(projectRow.startDate) : null,
      plannedEndDate: plannedProjectEnd ? toIsoDate(plannedProjectEnd) : null,
      projectedEndDate: end ? toIsoDate(end) : null,
      // Retard du projet = ecart entre la fin projetee et la fin prevue du projet (0 si absente ou dans les temps).
      projectDelayDays: end && plannedProjectEnd ? Math.max(0, diffInDays(plannedProjectEnd, end)) : Math.max(0, ...active.map((i) => i.delayDays), 0),
      progressPercent: projectRow?.progressPercent ?? 0,
      lateCount: active.filter((i) => i.status === 'LATE').length,
      atRiskCount: active.filter((i) => i.status === 'AT_RISK').length,
      phases: items,
      stopReasons: summarizeStopReasons(days),
      stoppedDays: days.filter((d) => !d.isWorked).length,
    };
  }

  /**
   * Alerte le client (et le conducteur de travaux) des etapes en retard — une alerte par etape et par semaine.
   * Appele chaque jour par la tache planifiee.
   */
  async sendScheduleAlerts(today: Date = startOfUtcDay()): Promise<number> {
    const projects = await this.prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, clientId: true } });
    let sent = 0;
    for (const project of projects) {
      try {
        const planning = await this.get(project.id, today);
        for (const phase of planning.phases.filter((p) => p.isActive && p.status === 'LATE')) {
          const owner = await this.prisma.clientProfile.findUnique({ where: { id: project.clientId }, select: { userId: true } });
          if (!owner) continue;
          if (await this.notifier.recentlySent(owner.userId, 'SCHEDULE_ALERT', 'phaseId', phase.id, WEEK_MS)) continue;
          const message = `L'étape « ${phase.name} » (${project.name}) a ${phase.delayDays} jour(s) de retard (avancement ${phase.progressPercent} %).`;
          const input = { type: 'SCHEDULE_ALERT' as const, title: 'Étape en retard', message, path: '/planning', meta: { phaseId: phase.id } };
          await this.notifier.toClient(project, input);
          await this.notifier.toReviewers(project.id, input);
          sent += 1;
        }
      } catch (err) {
        this.logger.error(`Alertes de planning impossibles pour le projet ${project.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
    return sent;
  }
}
