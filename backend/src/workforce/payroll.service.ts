//backend/src/workforce/payroll.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { formatMoney, roundMoney } from '../common/utils/money.util';
import { diffInDays, parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, FIELD_WRITERS, getSiteRole } from '../site-common/site-access';
import { computePayLine, sumPayLines } from './payroll.calc';
import { WorkforceService } from './workforce.service';
import { CreatePayRunDto, EditPayRunLinesDto, SubmitPayRunDto } from './dto/workforce.dto';

const MAX_PERIOD_DAYS = 62;

const payRunInclude = {
  lines: { include: { worker: { select: { fullName: true, trade: true } } }, orderBy: { worker: { fullName: 'asc' as const } } },
  expense: { select: { status: true } },
} satisfies Prisma.PayRunInclude;

type PayRunFull = Prisma.PayRunGetPayload<{ include: typeof payRunInclude }>;

/**
 * Paie d'une periode : le brouillon est genere depuis les presences, ajustable (marche a la tache, retenue d'avance),
 * puis valide : UNE depense du montant brut est alors creee (et suit les regles habituelles de validation).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workforce: WorkforceService,
    private readonly expenses: ExpensesService,
  ) {}

  private present(run: PayRunFull) {
    const { lines, expense, ...rest } = run;
    return {
      ...rest,
      periodStart: toIsoDate(run.periodStart),
      periodEnd: toIsoDate(run.periodEnd),
      expenseStatus: expense?.status ?? null,
      lines: lines.map(({ worker, ...line }) => ({ ...line, workerName: worker.fullName, trade: worker.trade })),
    };
  }

  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const runs = await this.prisma.payRun.findMany({ where: { projectId }, orderBy: { number: 'desc' }, include: payRunInclude });
    return runs.map((r) => this.present(r));
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const run = await this.prisma.payRun.findFirst({ where: { id, projectId }, include: payRunInclude });
    if (!run) throw AppException.notFound('Paie');
    return this.present(run);
  }

  /** Cree un brouillon : une ligne par ouvrier present sur la periode. */
  async create(projectId: string, dto: CreatePayRunDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, 'Seuls les intervenants de terrain préparent une paie.');
    const start = parseIsoDate(dto.periodStart);
    const end = parseIsoDate(dto.periodEnd);
    if (!start || !end) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    if (end.getTime() < start.getTime()) throw AppException.badRequest('INVALID_DATE_RANGE', 'La fin de période précède le début.');
    if (end.getTime() > startOfUtcDay().getTime()) throw AppException.badRequest('FUTURE_DATE', 'La période ne peut pas se terminer dans le futur.');
    if (diffInDays(start, end) + 1 > MAX_PERIOD_DAYS) throw AppException.badRequest('RANGE_TOO_LARGE', `Une paie couvre au plus ${MAX_PERIOD_DAYS} jours.`);

    const id = await this.prisma.runInTransaction(async (tx) => {
      const overlap = await this.workforce.hasLivePayOverlap(tx, projectId, start, end);
      if (overlap) throw AppException.conflict('PERIOD_OVERLAP', `Cette période chevauche la paie n°${overlap.number} déjà validée.`);

      const presences = await tx.workerPresence.groupBy({ by: ['workerId'], where: { projectId, date: { gte: start, lte: end } }, _sum: { fraction: true } });
      if (presences.length === 0) throw AppException.badRequest('NO_PRESENCE', 'Aucune présence enregistrée sur cette période.');
      const workers = await tx.worker.findMany({ where: { projectId, id: { in: presences.map((p) => p.workerId) } } });
      const outstanding = await this.workforce.outstandingByWorker(tx, projectId);

      const number = await nextProjectNumber(tx, 'payRun', projectId);
      const lines = workers.map((worker) => {
        const days = presences.find((p) => p.workerId === worker.id)?._sum.fraction ?? new Prisma.Decimal(0);
        const rate = worker.dailyRate ?? new Prisma.Decimal(0);
        const calc = computePayLine({ daysWorked: days, dailyRate: rate, advanceOutstanding: outstanding.get(worker.id) ?? 0 });
        return { workerId: worker.id, daysWorked: days, dailyRate: rate, grossAmount: calc.gross, advanceDeducted: calc.advance, netAmount: calc.net, note: worker.dailyRate ? null : 'Taux journalier à renseigner' };
      });
      const run = await tx.payRun.create({
        data: { projectId, number, label: dto.label.trim(), periodStart: start, periodEnd: end, ...sumPayLines(lines), createdById: actor.userId, lines: { create: lines } },
      });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'PayRun', entityId: run.id, newValue: { projectId, number, workers: lines.length, gross: run.totalGross.toString() } }, tx);
      return run.id;
    });
    return this.findOne(projectId, id);
  }

  /** Remplace les lignes du brouillon (jours, taux, marche a la tache, retenue d'avance). */
  async editLines(projectId: string, id: string, dto: EditPayRunLinesDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, 'Seuls les intervenants de terrain préparent une paie.');
    if (new Set(dto.lines.map((l) => l.workerId)).size !== dto.lines.length) throw AppException.badRequest('DUPLICATE_WORKER', 'Un ouvrier apparaît deux fois.');

    await this.prisma.runInTransaction(async (tx) => {
      const run = await tx.payRun.findFirst({ where: { id, projectId } });
      if (!run) throw AppException.notFound('Paie');
      if (run.status !== 'DRAFT') throw AppException.conflict('PAYRUN_LOCKED', 'Cette paie est validée : elle ne peut plus être modifiée.');

      const workers = await tx.worker.findMany({ where: { projectId, id: { in: dto.lines.map((l) => l.workerId) } } });
      if (workers.length !== dto.lines.length) throw AppException.badRequest('INVALID_WORKER', "Un ouvrier n'appartient pas à ce chantier.");
      const presences = await tx.workerPresence.groupBy({ by: ['workerId'], where: { projectId, date: { gte: run.periodStart, lte: run.periodEnd } }, _sum: { fraction: true } });
      const outstanding = await this.workforce.outstandingByWorker(tx, projectId);

      const lines = dto.lines.map((edit) => {
        const worker = workers.find((w) => w.id === edit.workerId) as (typeof workers)[number];
        const days = edit.daysWorked !== undefined ? new Prisma.Decimal(edit.daysWorked) : (presences.find((p) => p.workerId === worker.id)?._sum.fraction ?? new Prisma.Decimal(0));
        const rate = edit.dailyRate !== undefined ? roundMoney(edit.dailyRate) : (worker.dailyRate ?? new Prisma.Decimal(0));
        const calc = computePayLine({ daysWorked: days, dailyRate: rate, taskAmount: edit.taskAmount, advanceOutstanding: outstanding.get(worker.id) ?? 0, advanceRequested: edit.advanceDeducted });
        if (calc.error) throw AppException.badRequest('ADVANCE_TOO_HIGH', `La retenue d'avance de ${worker.fullName} dépasse ce qui est dû (ou le brut).`);
        return { payRunId: id, workerId: worker.id, daysWorked: days, dailyRate: rate, grossAmount: calc.gross, advanceDeducted: calc.advance, netAmount: calc.net, note: edit.note?.trim() || (edit.taskAmount ? 'Marché à la tâche' : null) };
      });
      await tx.payRunLine.deleteMany({ where: { payRunId: id } });
      await tx.payRunLine.createMany({ data: lines });
      await tx.payRun.update({ where: { id }, data: sumPayLines(lines) });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'PayRun', entityId: id, newValue: { lines: lines.length } }, tx);
    });
    return this.findOne(projectId, id);
  }

  async remove(projectId: string, id: string, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, 'Seuls les intervenants de terrain gèrent les paies.');
    await this.prisma.runInTransaction(async (tx) => {
      const run = await tx.payRun.findFirst({ where: { id, projectId } });
      if (!run) throw AppException.notFound('Paie');
      if (run.status !== 'DRAFT') throw AppException.conflict('PAYRUN_LOCKED', 'Une paie validée ne peut pas être supprimée.');
      await tx.payRun.delete({ where: { id } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'PayRun', entityId: id, oldValue: { number: run.number, gross: run.totalGross.toString() } }, tx);
    });
    return { deleted: true };
  }

  /** Valide la paie : cree la depense (montant brut) ; les avances deduites sont regularisees. */
  async submit(projectId: string, id: string, dto: SubmitPayRunDto, actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERVISOR' || !actor.supervisorProfileId) {
      throw AppException.forbidden('ROLE_NOT_ALLOWED', 'Seul un superviseur valide une paie (elle est comptabilisée comme dépense).');
    }
    const supervisorId = actor.supervisorProfileId;
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppException.notFound('Projet');
    assertProjectOpenFor(actor, project.status);

    if (dto.clientRef) {
      const already = await this.prisma.expense.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { payRun: { select: { id: true } } } });
      if (already?.payRun) return this.findOne(projectId, already.payRun.id);
    }

    const created = await this.prisma.runInTransaction(async (tx) => {
      const run = await tx.payRun.findFirst({ where: { id, projectId }, include: { lines: { include: { worker: { select: { fullName: true } } } } } });
      if (!run) throw AppException.notFound('Paie');
      if (run.status !== 'DRAFT') throw AppException.conflict('PAYRUN_LOCKED', 'Cette paie est déjà validée.');
      if (run.lines.length === 0) throw AppException.badRequest('EMPTY_PAYRUN', 'Cette paie ne contient aucune ligne.');
      const missing = run.lines.find((l) => l.grossAmount.lessThanOrEqualTo(0));
      if (missing) throw AppException.badRequest('MISSING_AMOUNT', `Renseignez le taux ou le montant de ${missing.worker.fullName} avant de valider.`);

      const overlap = await this.workforce.hasLivePayOverlap(tx, projectId, run.periodStart, run.periodEnd, id);
      if (overlap) throw AppException.conflict('PERIOD_OVERLAP', `Cette période chevauche la paie n°${overlap.number} déjà validée.`);

      // Les avances ont pu changer depuis la preparation du brouillon.
      const outstanding = await this.workforce.outstandingByWorker(tx, projectId);
      for (const line of run.lines) {
        const ceiling = Prisma.Decimal.min(outstanding.get(line.workerId) ?? 0, line.grossAmount);
        if (line.advanceDeducted.greaterThan(ceiling)) {
          throw AppException.conflict('ADVANCE_CHANGED', `La retenue d'avance de ${line.worker.fullName} n'est plus valable : rouvrez le brouillon.`);
        }
      }

      const totals = sumPayLines(run.lines);
      const result = await this.expenses.createInTx(tx, project, actor, supervisorId, {
        date: run.periodEnd,
        categoryId: dto.categoryId,
        label: `Paie n°${run.number} — ${run.label}`,
        quantity: 1,
        unit: 'forfait',
        unitPrice: totals.totalGross,
        observation: dto.note ?? `${run.lines.length} ouvrier(s), net versé ${formatMoney(totals.totalNet, project.currency)} après ${formatMoney(totals.totalAdvance, project.currency)} d'avances.`,
        clientRef: dto.clientRef,
      });
      const done = await tx.payRun.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'SUBMITTED', categoryId: dto.categoryId, expenseId: result.expense.id, submittedAt: new Date(), ...totals },
      });
      if (done.count !== 1) throw AppException.conflict('PAYRUN_LOCKED', 'Cette paie est déjà validée.');
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'PayRun', entityId: id, newValue: { expenseId: result.expense.id, gross: totals.totalGross.toString(), net: totals.totalNet.toString() } },
        tx,
      );
      return result;
    });

    await this.expenses.afterCreate(project, created, actor);
    return this.findOne(projectId, id);
  }
}
