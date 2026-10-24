//backend/src/cron/cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, startOfUtcDay } from '../common/utils/month.util';
import { DocumentsService } from '../documents/documents.service';
import { MonthlyReportService } from '../monthly-report/monthly-report.service';
import { PlanningService } from '../progress/planning.service';
import { SiteNotifierService } from '../site-common/site-notifier.service';

const REMINDER_WINDOW_MS = 20 * 60 * 60 * 1000;

export interface DailyJobsResult {
  documentAlerts: number;
  scheduleAlerts: number;
  attendanceReminders: number;
  monthlyReports: number;
  errors: string[];
}

/** Taches quotidiennes declenchees par le planificateur externe (Vercel Cron) : chaque tache est isolee des autres. */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly planning: PlanningService,
    private readonly monthly: MonthlyReportService,
    private readonly notifier: SiteNotifierService,
  ) {}

  /**
   * Rappelle aux superviseurs de renseigner la veille : projet actif demarre, aucun jour saisi pour hier.
   * Un rappel au plus par superviseur et par projet toutes les 20 h.
   */
  async sendAttendanceReminders(today: Date = startOfUtcDay()): Promise<number> {
    const yesterday = addDays(today, -1);
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE', startDate: { lte: yesterday } },
      select: { id: true, name: true, workDays: { where: { date: yesterday }, select: { id: true } } },
    });
    let sent = 0;
    for (const project of projects) {
      if (project.workDays.length > 0) continue;
      const rows = await this.prisma.projectSupervisor.findMany({
        where: { projectId: project.id, status: 'ACTIVE', position: { in: ['SUPERVISOR', 'SITE_MANAGER'] }, supervisor: { user: { status: 'ACTIVE' } } },
        select: { supervisor: { select: { userId: true } } },
      });
      for (const row of rows) {
        const userId = row.supervisor.userId;
        if (await this.notifier.recentlySent(userId, 'ATTENDANCE_REMINDER', 'projectId', project.id, REMINDER_WINDOW_MS)) continue;
        await this.notifier.toUser(userId, project.id, {
          type: 'ATTENDANCE_REMINDER',
          title: 'Journée à renseigner',
          message: `La journée d'hier n'est pas renseignée sur « ${project.name} » : indiquez si le chantier a travaillé.`,
          path: '/attendance',
        });
        sent += 1;
      }
    }
    return sent;
  }

  async runDaily(today: Date = startOfUtcDay()): Promise<DailyJobsResult> {
    const result: DailyJobsResult = { documentAlerts: 0, scheduleAlerts: 0, attendanceReminders: 0, monthlyReports: 0, errors: [] };
    const jobs: Array<[keyof Omit<DailyJobsResult, 'errors'>, () => Promise<number>]> = [
      ['documentAlerts', () => this.documents.sendExpiryAlerts(today)],
      ['scheduleAlerts', () => this.planning.sendScheduleAlerts(today)],
      ['attendanceReminders', () => this.sendAttendanceReminders(today)],
      ['monthlyReports', () => this.monthly.sendMonthlyReports(today)],
    ];
    for (const [name, job] of jobs) {
      try {
        result[name] = await job();
      } catch (err) {
        this.logger.error(`Tache quotidienne « ${name} » en echec`, err instanceof Error ? err.stack : String(err));
        result.errors.push(name);
      }
    }
    this.logger.log(`Taches quotidiennes terminees : ${JSON.stringify(result)}`);
    return result;
  }
}

