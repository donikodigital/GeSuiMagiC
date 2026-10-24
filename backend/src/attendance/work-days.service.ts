//backend/src/attendance/work-days.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { monthBounds, parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { computeStats, monthAttendance, summarizeByMonth, summarizeByPhase } from './attendance.calc';
import { assertEditableDay, assertProjectOpenFor, findProjectOrThrow } from './attendance.helpers';
import { UpsertWorkDayDto } from './dto/upsert-work-day.dto';
import { assessLocation } from '../common/utils/geo.util';

type WorkDayWithPhase = Prisma.WorkDayGetPayload<{ include: { phase: { select: { name: true } } } }>;

function toDto(row: WorkDayWithPhase) {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    isWorked: row.isWorked,
    workersCount: row.workersCount,
    phaseId: row.phaseId,
    phaseName: row.phase?.name ?? null,
    stopReason: row.stopReason,
    isOffSite: row.isOffSite,
    note: row.note,
    recordedById: row.recordedById,
    updatedAt: row.updatedAt,
  };
}

/**
 * Calendrier des jours travailles. Une ligne par projet et par jour : le superviseur declare chaque
 * jour (travaille ou non, effectif, etape en cours). Le client et le superadmin consultent.
 * Chaque saisie ou correction est ecrite dans le journal d'audit avec l'ancienne valeur.
 */
@Injectable()
export class WorkDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private today(): Date {
    return startOfUtcDay();
  }

  private parseDateOrThrow(value: string): Date {
    const date = parseIsoDate(value);
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    return date;
  }

  /** Jours renseignes d'un mois + statistiques du mois (jours travailles, jours-ouvriers, jours non renseignes). */
  async listMonth(projectId: string, month: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const { start, end } = monthBounds(month);

    const rows = await this.prisma.workDay.findMany({
      where: { projectId, date: { gte: start, lt: end } },
      include: { phase: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    return { month, days: rows.map(toDto), summary: monthAttendance(rows, month, this.today()) };
  }

  async upsert(projectId: string, dateParam: string, dto: UpsertWorkDayDto, actor: AuthenticatedUser) {
    const date = this.parseDateOrThrow(dateParam);
    assertEditableDay(actor.role, date, this.today());

    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const site = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { siteLatitude: true, siteLongitude: true, geoFenceMeters: true },
    });
    const location = site ? assessLocation(site, dto.latitude, dto.longitude) : assessLocation({ siteLatitude: null, siteLongitude: null, geoFenceMeters: 500 });

    let workersCount = 0;
    let phaseId: string | null = null;
    if (dto.isWorked) {
      workersCount = dto.workersCount ?? 0;
      if (workersCount < 1) throw AppException.badRequest('WORKERS_REQUIRED', "Indiquez le nombre d'ouvriers présents (au moins 1).");
      if (!dto.phaseId) throw AppException.badRequest('PHASE_REQUIRED', "Indiquez l'étape du chantier sur laquelle l'équipe a travaillé.");
      phaseId = dto.phaseId;
    }

    return this.prisma.runInTransaction(async (tx) => {
      if (phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId }, select: { isActive: true } });
        if (!phase || !phase.isActive) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas ou n'est plus active.");
      }

      const existing = await tx.workDay.findUnique({ where: { projectId_date: { projectId, date } } });
      const data = {
        isWorked: dto.isWorked,
        workersCount,
        phaseId,
        // La raison d'arret n'a de sens que pour un jour non travaille.
        stopReason: dto.isWorked ? null : (dto.stopReason ?? null),
        latitude: location.latitude,
        longitude: location.longitude,
        isOffSite: location.isOffSite,
        note: dto.note?.trim() || null,
      };

      const saved = await tx.workDay.upsert({
        where: { projectId_date: { projectId, date } },
        create: { projectId, date, recordedById: actor.userId, ...data },
        update: { recordedById: actor.userId, ...data },
        include: { phase: { select: { name: true } } },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'WorkDay',
          entityId: saved.id,
          oldValue: existing ? { date: toIsoDate(existing.date), isWorked: existing.isWorked, workersCount: existing.workersCount, phaseId: existing.phaseId, note: existing.note } : undefined,
          newValue: { projectId, date: toIsoDate(date), ...data },
        },
        tx,
      );
      return toDto(saved);
    });
  }

  /** Efface la saisie d'un jour (le jour redevient « non renseigne »). */
  async remove(projectId: string, dateParam: string, actor: AuthenticatedUser) {
    const date = this.parseDateOrThrow(dateParam);
    assertEditableDay(actor.role, date, this.today());

    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);

    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.workDay.findUnique({ where: { projectId_date: { projectId, date } } });
      if (!existing) throw AppException.notFound('Jour');

      await tx.workDay.delete({ where: { id: existing.id } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'WorkDay',
          entityId: existing.id,
          oldValue: { projectId, date: toIsoDate(existing.date), isWorked: existing.isWorked, workersCount: existing.workersCount, phaseId: existing.phaseId, note: existing.note },
        },
        tx,
      );
    });
    return { removed: true };
  }

  /** Totaux depuis le debut du chantier : jours travailles, jours-ouvriers, par etape et par mois. */
  async summary(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);

    const [rows, phases] = await Promise.all([
      this.prisma.workDay.findMany({ where: { projectId }, select: { date: true, isWorked: true, workersCount: true, phaseId: true }, orderBy: { date: 'asc' } }),
      this.prisma.projectPhase.findMany({ where: { projectId }, select: { id: true, name: true, isActive: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    ]);

    const worked = rows.filter((row) => row.isWorked);
    return {
      totals: {
        ...computeStats(rows),
        firstWorkedDate: worked.length ? toIsoDate(worked[0].date) : null,
        lastWorkedDate: worked.length ? toIsoDate(worked[worked.length - 1].date) : null,
      },
      byPhase: summarizeByPhase(rows, phases),
      byMonth: summarizeByMonth(rows),
    };
  }
}
