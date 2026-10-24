//backend/src/workforce/workforce.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { roundMoney } from '../common/utils/money.util';
import { diffInDays, parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { assertEditableDay, assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, FIELD_WRITERS, getSiteRole } from '../site-common/site-access';
import { advanceBalance, periodsOverlap } from './payroll.calc';
import { CreateAdvanceDto, CreateWorkerDto, PresenceQueryDto, SetPresencesDto, UpdateWorkerDto } from './dto/workforce.dto';

const MAX_RANGE_DAYS = 62;

type Db = PrismaService | Prisma.TransactionClient;

/** Ouvriers nominatifs du chantier : fiche, presences journalieres, avances en especes. */
@Injectable()
export class WorkforceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Avances restant a regulariser, par ouvrier (une paie rejetee ou annulee ne compte plus). */
  async outstandingByWorker(db: Db, projectId: string): Promise<Map<string, Prisma.Decimal>> {
    const [given, deducted] = await Promise.all([
      db.workerAdvance.groupBy({ by: ['workerId'], where: { projectId }, _sum: { amount: true } }),
      db.payRunLine.groupBy({
        by: ['workerId'],
        where: { payRun: { projectId, status: 'SUBMITTED', expense: { status: { in: ['PENDING', 'APPROVED'] } } } },
        _sum: { advanceDeducted: true },
      }),
    ]);
    const out = new Map<string, Prisma.Decimal>();
    for (const row of given) {
      const taken = deducted.find((d) => d.workerId === row.workerId)?._sum.advanceDeducted ?? 0;
      out.set(row.workerId, advanceBalance(row._sum.amount ?? 0, taken));
    }
    return out;
  }

  /** Une periode deja payee (paie valide) verrouille les presences qu'elle couvre. */
  async assertDateNotPaid(db: Db, projectId: string, date: Date) {
    const paid = await db.payRun.findFirst({
      where: { projectId, status: 'SUBMITTED', periodStart: { lte: date }, periodEnd: { gte: date }, expense: { status: { in: ['PENDING', 'APPROVED'] } } },
      select: { number: true },
    });
    if (paid) throw AppException.conflict('PERIOD_ALREADY_PAID', `Cette date est couverte par la paie n°${paid.number} déjà validée.`);
  }

  async hasLivePayOverlap(db: Db, projectId: string, start: Date, end: Date, excludeId?: string) {
    const others = await db.payRun.findMany({
      where: { projectId, status: 'SUBMITTED', id: excludeId ? { not: excludeId } : undefined, expense: { status: { in: ['PENDING', 'APPROVED'] } } },
      select: { number: true, periodStart: true, periodEnd: true },
    });
    return others.find((o) => periodsOverlap(start, end, o.periodStart, o.periodEnd)) ?? null;
  }

  // ---- Ouvriers ----------------------------------------------------------
  async listWorkers(projectId: string, includeInactive: boolean) {
    await findProjectOrThrow(this.prisma, projectId);
    const [workers, outstanding, days] = await Promise.all([
      this.prisma.worker.findMany({ where: { projectId, isActive: includeInactive ? undefined : true }, orderBy: { fullName: 'asc' } }),
      this.outstandingByWorker(this.prisma, projectId),
      this.prisma.workerPresence.groupBy({ by: ['workerId'], where: { projectId }, _sum: { fraction: true } }),
    ]);
    return workers.map((w) => ({
      ...w,
      startedAt: w.startedAt ? toIsoDate(w.startedAt) : null,
      leftAt: w.leftAt ? toIsoDate(w.leftAt) : null,
      advanceBalance: outstanding.get(w.id) ?? new Prisma.Decimal(0),
      totalDays: days.find((d) => d.workerId === w.id)?._sum.fraction ?? new Prisma.Decimal(0),
    }));
  }

  async createWorker(projectId: string, dto: CreateWorkerDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain gèrent les ouvriers.");
    const startedAt = dto.startedAt ? parseIsoDate(dto.startedAt) : null;
    if (dto.startedAt && !startedAt) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    const exists = await this.prisma.worker.findFirst({ where: { projectId, fullName: { equals: fullName, mode: 'insensitive' } }, select: { id: true } });
    if (exists) throw AppException.conflict('WORKER_EXISTS', 'Un ouvrier porte déjà ce nom sur ce chantier.');
    const worker = await this.prisma.worker.create({
      data: { projectId, fullName, trade: dto.trade?.trim() || null, dailyRate: dto.dailyRate !== undefined ? roundMoney(dto.dailyRate) : null, phone: dto.phone?.trim() || null, startedAt, notes: dto.notes?.trim() || null },
    });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Worker', entityId: worker.id, newValue: { projectId, fullName } });
    return worker;
  }

  async updateWorker(projectId: string, id: string, dto: UpdateWorkerDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain gèrent les ouvriers.");
    const worker = await this.prisma.worker.findFirst({ where: { id, projectId } });
    if (!worker) throw AppException.notFound('Ouvrier');
    const leftAt = dto.leftAt ? parseIsoDate(dto.leftAt) : undefined;
    if (dto.leftAt && !leftAt) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    const fullName = dto.fullName?.trim().replace(/\s+/g, ' ');
    if (fullName && fullName.toLowerCase() !== worker.fullName.toLowerCase()) {
      const exists = await this.prisma.worker.findFirst({ where: { projectId, id: { not: id }, fullName: { equals: fullName, mode: 'insensitive' } }, select: { id: true } });
      if (exists) throw AppException.conflict('WORKER_EXISTS', 'Un ouvrier porte déjà ce nom sur ce chantier.');
    }
    const updated = await this.prisma.worker.update({
      where: { id },
      data: { fullName, trade: dto.trade?.trim(), dailyRate: dto.dailyRate !== undefined ? roundMoney(dto.dailyRate) : undefined, phone: dto.phone?.trim(), isActive: dto.isActive, leftAt, notes: dto.notes?.trim() },
    });
    await this.audit.log({
      userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Worker', entityId: id,
      oldValue: { fullName: worker.fullName, dailyRate: worker.dailyRate?.toString() ?? null, isActive: worker.isActive },
      newValue: { fullName: updated.fullName, dailyRate: updated.dailyRate?.toString() ?? null, isActive: updated.isActive },
    });
    return updated;
  }

  // ---- Presences ---------------------------------------------------------
  async listPresences(projectId: string, query: PresenceQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (!from || !to || to.getTime() < from.getTime()) throw AppException.badRequest('INVALID_DATE_RANGE', 'Période invalide.');
    if (diffInDays(from, to) > MAX_RANGE_DAYS) throw AppException.badRequest('RANGE_TOO_LARGE', `La période ne peut pas dépasser ${MAX_RANGE_DAYS} jours.`);
    const rows = await this.prisma.workerPresence.findMany({ where: { projectId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
    const byDate = new Map<string, Array<{ workerId: string; fraction: Prisma.Decimal; phaseId: string | null }>>();
    for (const row of rows) {
      const key = toIsoDate(row.date);
      byDate.set(key, [...(byDate.get(key) ?? []), { workerId: row.workerId, fraction: row.fraction, phaseId: row.phaseId }]);
    }
    return [...byDate.entries()].map(([date, entries]) => ({ date, entries, totalDays: entries.reduce((s, e) => s.add(e.fraction), new Prisma.Decimal(0)) }));
  }

  /** Fixe les presences d'un jour (fraction 0 = absent). Fenetre de saisie identique au calendrier des jours travailles. */
  async setPresences(projectId: string, dto: SetPresencesDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls les intervenants de terrain saisissent les présences.");
    const today = startOfUtcDay();
    const date = parseIsoDate(dto.date);
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    assertEditableDay(actor.role, date, today);
    if (new Set(dto.entries.map((e) => e.workerId)).size !== dto.entries.length) throw AppException.badRequest('DUPLICATE_WORKER', 'Un ouvrier apparaît deux fois.');

    await this.prisma.runInTransaction(async (tx) => {
      await this.assertDateNotPaid(tx, projectId, date);
      const workers = await tx.worker.findMany({ where: { projectId, id: { in: dto.entries.map((e) => e.workerId) } }, select: { id: true, isActive: true, fullName: true } });
      const byId = new Map(workers.map((w) => [w.id, w]));
      const phaseIds = [...new Set(dto.entries.map((e) => e.phaseId).filter((p): p is string => !!p))];
      if (phaseIds.length) {
        const found = await tx.projectPhase.count({ where: { projectId, id: { in: phaseIds } } });
        if (found !== phaseIds.length) throw AppException.badRequest('INVALID_PHASE', "Une étape n'existe pas sur ce projet.");
      }
      for (const entry of dto.entries) {
        const worker = byId.get(entry.workerId);
        if (!worker) throw AppException.badRequest('INVALID_WORKER', "Un ouvrier n'appartient pas à ce chantier.");
        if (entry.fraction === 0) {
          await tx.workerPresence.deleteMany({ where: { workerId: entry.workerId, date } });
          continue;
        }
        if (!worker.isActive) throw AppException.badRequest('WORKER_INACTIVE', `${worker.fullName} n'est plus actif sur ce chantier.`);
        await tx.workerPresence.upsert({
          where: { workerId_date: { workerId: entry.workerId, date } },
          create: { projectId, workerId: entry.workerId, date, fraction: entry.fraction, phaseId: entry.phaseId, recordedById: actor.userId },
          update: { fraction: entry.fraction, phaseId: entry.phaseId ?? null, recordedById: actor.userId },
        });
      }
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'WorkerPresence', entityId: projectId, newValue: { date: dto.date, present: dto.entries.filter((e) => e.fraction > 0).length, absent: dto.entries.filter((e) => e.fraction === 0).length } },
        tx,
      );
    });
    const day = await this.listPresences(projectId, { from: dto.date, to: dto.date });
    return day[0] ?? { date: dto.date, entries: [], totalDays: new Prisma.Decimal(0) };
  }

  // ---- Avances -----------------------------------------------------------
  async listAdvances(projectId: string, workerId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, projectId }, select: { id: true } });
    if (!worker) throw AppException.notFound('Ouvrier');
    const rows = await this.prisma.workerAdvance.findMany({ where: { projectId, workerId }, orderBy: { date: 'desc' } });
    return rows.map((r) => ({ ...r, date: toIsoDate(r.date) }));
  }

  async createAdvance(projectId: string, workerId: string, dto: CreateAdvanceDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, ['SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER'], "Seuls les intervenants de terrain enregistrent une avance.");
    const today = startOfUtcDay();
    const date = dto.date ? parseIsoDate(dto.date) : today;
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    assertEditableDay(actor.role, date, today);

    const advance = await this.prisma.runInTransaction(async (tx) => {
      const worker = await tx.worker.findFirst({ where: { id: workerId, projectId } });
      if (!worker) throw AppException.notFound('Ouvrier');
      if (!worker.isActive) throw AppException.badRequest('WORKER_INACTIVE', "Cet ouvrier n'est plus actif.");
      const row = await tx.workerAdvance.create({ data: { projectId, workerId, amount: roundMoney(dto.amount), date, note: dto.note?.trim() || null, recordedById: actor.userId } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'WorkerAdvance', entityId: row.id, newValue: { projectId, workerId, amount: row.amount.toString() } }, tx);
      return row;
    });
    const balance = (await this.outstandingByWorker(this.prisma, projectId)).get(workerId) ?? new Prisma.Decimal(0);
    return { ...advance, date: toIsoDate(advance.date), advanceBalance: balance };
  }
}

