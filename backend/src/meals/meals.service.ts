//backend/src/meals/meals.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MealAccountRequest, MealCarryOver, MealEnvelope, Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { isCatalogueEntryUsableBy } from '../common/utils/catalogue-access.util';
import { add, formatMoney, roundMoney, toDecimal } from '../common/utils/money.util';
import { addMonths, monthBounds, monthIndex, monthOf, startOfUtcDay } from '../common/utils/month.util';
import { computeStats, monthAttendance, MonthAttendance } from '../attendance/attendance.calc';
import { assertProjectOpenFor, findProjectOrThrow, ProjectLite } from '../attendance/attendance.helpers';
import { computeMealAmounts, MealAmounts, serializeAmounts } from './meals.calc';
import { UpsertMealEnvelopeDto } from './dto/upsert-meal-envelope.dto';
import { CreateCarryOverDto } from './dto/create-carry-over.dto';
import { DeleteCarryOverDto } from './dto/delete-carry-over.dto';
import { CreateMealRequestDto } from './dto/create-meal-request.dto';
import { AnswerMealRequestDto } from './dto/answer-meal-request.dto';
import { MealRequestQueryDto } from './dto/meal-request-query.dto';

/** Mois proposes autour d'aujourd'hui (garde-fou contre une faute de frappe sur l'annee). */
const MONTH_RANGE = 36;
/** Un report ne peut viser qu'un mois a 24 mois au plus du mois d'origine. */
const MAX_CARRY_OVER_SPAN = 24;
/** Nombre maximal de mois renvoyes par la liste. */
const MAX_LISTED_MONTHS = 36;
/** Anti-spam : demandes de comptes ouvertes en meme temps pour un meme mois. */
const MAX_OPEN_REQUESTS_PER_MONTH = 5;

type Client = PrismaService | TxClient;
type EnvelopeWithCategory = MealEnvelope & { category: { name: string } | null };

interface MonthReport {
  month: string;
  currency: string;
  envelope: EnvelopeWithCategory | null;
  attendance: MonthAttendance;
  amounts: MealAmounts;
  carryOversIn: MealCarryOver[];
  carryOversOut: MealCarryOver[];
  requests: MealAccountRequest[];
}

/**
 * Suivi de l'alimentation des ouvriers.
 *
 * Pour chaque mois : l'enveloppe envoyee par le client, les jours travailles declares par le superviseur,
 * les depenses d'alimentation reelles, ce que les presences justifient (jours-ouvriers x cout d'un repas),
 * le reliquat, l'ecart, et les reports de reliquat valides par le client.
 *
 * Le client peut demander des comptes au superviseur et reporter un reliquat sur un mois suivant :
 * chaque report est transactionnel (Serializable), plafonne au reliquat reel et trace dans l'audit.
 */
@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private today(): Date {
    return startOfUtcDay();
  }

  private assertCanManage(actor: AuthenticatedUser): void {
    if (actor.role !== 'CLIENT' && actor.role !== 'SUPERADMIN') throw AppException.forbiddenProjectAccess();
  }

  private assertMonthInRange(month: string): void {
    if (Math.abs(monthIndex(month) - monthIndex(monthOf(this.today()))) > MONTH_RANGE) {
      throw AppException.badRequest('MONTH_OUT_OF_RANGE', `Le mois doit etre a moins de ${MONTH_RANGE} mois d'aujourd'hui.`);
    }
  }

  // --------------------------------------------------------------------
  // Lecture
  // --------------------------------------------------------------------

  /** Mois connus du projet (enveloppe, report, presence ou demande), le mois courant toujours inclus, du plus recent au plus ancien. */
  async listMonths(projectId: string) {
    const project = await findProjectOrThrow(this.prisma, projectId);

    const [envelopes, carryOvers, workDays, requests] = await Promise.all([
      this.prisma.mealEnvelope.findMany({ where: { projectId }, select: { month: true } }),
      this.prisma.mealCarryOver.findMany({ where: { projectId }, select: { fromMonth: true, toMonth: true } }),
      this.prisma.workDay.findMany({ where: { projectId }, select: { date: true } }),
      this.prisma.mealAccountRequest.findMany({ where: { projectId }, select: { month: true } }),
    ]);

    const months = new Set<string>([monthOf(this.today())]);
    envelopes.forEach((e) => months.add(e.month));
    carryOvers.forEach((c) => {
      months.add(c.fromMonth);
      months.add(c.toMonth);
    });
    workDays.forEach((w) => months.add(monthOf(w.date)));
    requests.forEach((r) => months.add(r.month));

    const ordered = Array.from(months).sort().reverse().slice(0, MAX_LISTED_MONTHS);
    const reports = await this.computeReports(project, ordered, this.prisma);
    return ordered.map((month) => this.toApi(reports.get(month)!));
  }

  async getMonth(projectId: string, month: string) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    const reports = await this.computeReports(project, [month], this.prisma);
    return this.toApi(reports.get(month)!);
  }

  async listRequests(projectId: string, query: MealRequestQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.prisma.mealAccountRequest.findMany({
      where: { projectId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // --------------------------------------------------------------------
  // Enveloppe du mois
  // --------------------------------------------------------------------

  /**
   * Cree ou remplace l'enveloppe d'un mois. Remplacement complet : une categorie omise supprime le lien
   * avec la categorie d'alimentation. Refuse de descendre sous ce qui a deja ete reporte vers d'autres mois.
   */
  async upsertEnvelope(projectId: string, month: string, dto: UpsertMealEnvelopeDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    this.assertMonthInRange(month);
    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId, project.clientId);

    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.mealEnvelope.findUnique({ where: { projectId_month: { projectId, month } } });
      const [carriedIn, carriedOut] = await Promise.all([this.sumCarryOvers(tx, projectId, { toMonth: month }), this.sumCarryOvers(tx, projectId, { fromMonth: month })]);

      const allocated = roundMoney(dto.allocatedAmount);
      if (add(allocated, carriedIn).lessThan(carriedOut)) {
        throw AppException.conflict(
          'ENVELOPE_BELOW_CARRIED_OUT',
          `${formatMoney(carriedOut, project.currency)} ont déjà été reportés vers d'autres mois : l'enveloppe ne peut pas descendre en dessous.`,
        );
      }

      const data = { allocatedAmount: allocated, mealUnitCost: roundMoney(dto.mealUnitCost), categoryId: dto.categoryId ?? null, note: dto.note?.trim() || null };
      const saved = await tx.mealEnvelope.upsert({
        where: { projectId_month: { projectId, month } },
        create: { projectId, month, createdById: actor.userId, ...data },
        update: data,
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'MealEnvelope',
          entityId: saved.id,
          oldValue: existing ? { month, allocatedAmount: existing.allocatedAmount, mealUnitCost: existing.mealUnitCost, categoryId: existing.categoryId } : undefined,
          newValue: { projectId, month, allocatedAmount: saved.allocatedAmount, mealUnitCost: saved.mealUnitCost, categoryId: saved.categoryId },
        },
        tx,
      );
    });

    return this.getMonth(projectId, month);
  }

  // --------------------------------------------------------------------
  // Report de reliquat
  // --------------------------------------------------------------------

  async createCarryOver(projectId: string, fromMonth: string, dto: CreateCarryOverDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    this.assertMonthInRange(fromMonth);

    const gap = monthIndex(dto.toMonth) - monthIndex(fromMonth);
    if (gap < 1 || gap > MAX_CARRY_OVER_SPAN) {
      throw AppException.badRequest('INVALID_TARGET_MONTH', `Le mois de destination doit suivre ${fromMonth} (jusqu'à ${addMonths(fromMonth, MAX_CARRY_OVER_SPAN)}).`);
    }

    await this.prisma.runInTransaction(async (tx) => {
      const report = (await this.computeReports(project, [fromMonth], tx)).get(fromMonth)!;
      if (!report.envelope) {
        throw AppException.badRequest('ENVELOPE_REQUIRED', "Définissez d'abord l'enveloppe de ce mois avant d'en reporter un reliquat.");
      }

      const amount = roundMoney(dto.amount);
      if (amount.greaterThan(report.amounts.carryableAmount)) {
        throw AppException.conflict(
          'CARRY_OVER_EXCEEDS_REMAINING',
          `Montant reportable maximum : ${formatMoney(report.amounts.carryableAmount, project.currency)} (reliquat moins dépenses en attente).`,
        );
      }

      const created = await tx.mealCarryOver.create({
        data: { projectId, fromMonth, toMonth: dto.toMonth, amount, reason: dto.reason?.trim() || null, createdById: actor.userId },
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'MealCarryOver',
          entityId: created.id,
          newValue: { projectId, fromMonth, toMonth: dto.toMonth, amount, reason: created.reason },
        },
        tx,
      );
    });

    return this.getMonth(projectId, fromMonth);
  }

  async deleteCarryOver(projectId: string, carryOverId: string, dto: DeleteCarryOverDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);

    let fromMonth = '';
    await this.prisma.runInTransaction(async (tx) => {
      const carryOver = await tx.mealCarryOver.findFirst({ where: { id: carryOverId, projectId } });
      if (!carryOver) throw AppException.notFound('Report');
      fromMonth = carryOver.fromMonth;

      // Annuler un report retire de l'argent au mois de destination : impossible si ce mois l'a deja re-reporte.
      const target = (await this.computeReports(project, [carryOver.toMonth], tx)).get(carryOver.toMonth)!;
      if (target.amounts.availableAmount.minus(carryOver.amount).isNegative()) {
        throw AppException.conflict('CARRY_OVER_IN_USE', `Ce montant a déjà été reporté plus loin depuis ${carryOver.toMonth} : annulez d'abord ce second report.`);
      }

      await tx.mealCarryOver.delete({ where: { id: carryOverId } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'MealCarryOver',
          entityId: carryOverId,
          oldValue: { projectId, fromMonth: carryOver.fromMonth, toMonth: carryOver.toMonth, amount: carryOver.amount },
          reason: dto.reason.trim(),
        },
        tx,
      );
    });

    return this.getMonth(projectId, fromMonth);
  }

  // --------------------------------------------------------------------
  // Demandes de comptes
  // --------------------------------------------------------------------

  async createRequest(projectId: string, month: string, dto: CreateMealRequestDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const project = await findProjectOrThrow(this.prisma, projectId);
    this.assertMonthInRange(month);

    const created = await this.prisma.runInTransaction(async (tx) => {
      const open = await tx.mealAccountRequest.count({ where: { projectId, month, status: 'OPEN' } });
      if (open >= MAX_OPEN_REQUESTS_PER_MONTH) {
        throw AppException.conflict('TOO_MANY_OPEN_REQUESTS', 'Plusieurs demandes sont déjà en attente de réponse pour ce mois.');
      }

      const request = await tx.mealAccountRequest.create({ data: { projectId, month, message: dto.message.trim(), requestedById: actor.userId } });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'MealAccountRequest', entityId: request.id, newValue: { projectId, month } },
        tx,
      );
      return request;
    });

    await this.notifySupervisors(project, month, created.message, actor);
    return created;
  }

  async answerRequest(projectId: string, requestId: string, dto: AnswerMealRequestDto, actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERVISOR' && actor.role !== 'SUPERADMIN') throw AppException.forbiddenProjectAccess();
    const project = await findProjectOrThrow(this.prisma, projectId);

    const answered = await this.prisma.runInTransaction(async (tx) => {
      const request = await tx.mealAccountRequest.findFirst({ where: { id: requestId, projectId } });
      if (!request) throw AppException.notFound('Demande');

      // Mise a jour conditionnelle : deux reponses simultanees ne peuvent pas toutes deux aboutir.
      const result = await tx.mealAccountRequest.updateMany({
        where: { id: requestId, status: 'OPEN' },
        data: { status: 'ANSWERED', response: dto.response.trim(), answeredById: actor.userId, answeredAt: new Date() },
      });
      if (result.count === 0) throw AppException.conflict('REQUEST_NOT_OPEN', 'Cette demande a déjà reçu une réponse.');

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'MealAccountRequest', entityId: requestId, oldValue: { status: 'OPEN' }, newValue: { status: 'ANSWERED' } },
        tx,
      );
      return tx.mealAccountRequest.findUniqueOrThrow({ where: { id: requestId } });
    });

    await this.notifyClient(project, answered.month, answered.response ?? '', actor);
    return answered;
  }

  async closeRequest(projectId: string, requestId: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    await findProjectOrThrow(this.prisma, projectId);

    return this.prisma.runInTransaction(async (tx) => {
      const request = await tx.mealAccountRequest.findFirst({ where: { id: requestId, projectId } });
      if (!request) throw AppException.notFound('Demande');

      const result = await tx.mealAccountRequest.updateMany({
        where: { id: requestId, status: { in: ['OPEN', 'ANSWERED'] } },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      if (result.count === 0) throw AppException.conflict('REQUEST_ALREADY_CLOSED', 'Cette demande est déjà clôturée.');

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'MealAccountRequest', entityId: requestId, oldValue: { status: request.status }, newValue: { status: 'CLOSED' } },
        tx,
      );
      return tx.mealAccountRequest.findUniqueOrThrow({ where: { id: requestId } });
    });
  }

  // --------------------------------------------------------------------
  // Calculs
  // --------------------------------------------------------------------

  private async assertCategoryUsable(categoryId: string, projectClientId: string): Promise<void> {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId }, select: { ownerClientId: true, isActive: true } });
    if (!category || !category.isActive || !isCatalogueEntryUsableBy(category.ownerClientId, projectClientId)) {
      throw AppException.badRequest('INVALID_CATEGORY', "Cette catégorie n'existe pas ou n'est pas utilisable pour ce projet.");
    }
  }

  private async sumCarryOvers(client: Client, projectId: string, where: { fromMonth?: string; toMonth?: string }): Promise<Prisma.Decimal> {
    const result = await client.mealCarryOver.aggregate({ where: { projectId, ...where }, _sum: { amount: true } });
    return toDecimal(result._sum.amount ?? 0);
  }

  /**
   * Calcule les rapports de plusieurs mois en une seule serie de requetes (une lecture par table).
   * `client` peut etre une transaction : le calcul voit alors le meme etat que l'ecriture qui suit.
   */
  private async computeReports(project: ProjectLite, months: string[], client: Client): Promise<Map<string, MonthReport>> {
    const sorted = [...months].sort();
    const rangeStart = monthBounds(sorted[0]).start;
    const rangeEnd = monthBounds(sorted[sorted.length - 1]).end;
    const projectId = project.id;

    const [envelopes, carryOvers, workRows, requests] = await Promise.all([
      client.mealEnvelope.findMany({ where: { projectId, month: { in: months } }, include: { category: { select: { name: true } } } }),
      client.mealCarryOver.findMany({ where: { projectId, OR: [{ fromMonth: { in: months } }, { toMonth: { in: months } }] }, orderBy: { createdAt: 'asc' } }),
      client.workDay.findMany({
        where: { projectId, date: { gte: rangeStart, lt: rangeEnd } },
        select: { date: true, isWorked: true, workersCount: true, phaseId: true },
      }),
      client.mealAccountRequest.findMany({ where: { projectId, month: { in: months } }, orderBy: { createdAt: 'desc' } }),
    ]);

    const categoryIds = Array.from(new Set(envelopes.map((e) => e.categoryId).filter((id): id is string => !!id)));
    const expenses = categoryIds.length
      ? await client.expense.findMany({
          where: { projectId, categoryId: { in: categoryIds }, status: { in: ['APPROVED', 'PENDING'] }, date: { gte: rangeStart, lt: rangeEnd } },
          select: { date: true, total: true, status: true, categoryId: true },
        })
      : [];

    const today = this.today();
    const reports = new Map<string, MonthReport>();

    for (const month of months) {
      const { start, end } = monthBounds(month);
      const envelope = envelopes.find((e) => e.month === month) ?? null;
      const rows = workRows.filter((row) => row.date >= start && row.date < end);
      const carryOversIn = carryOvers.filter((c) => c.toMonth === month);
      const carryOversOut = carryOvers.filter((c) => c.fromMonth === month);

      const foodExpenses = envelope?.categoryId
        ? expenses.filter((e) => e.categoryId === envelope.categoryId && e.date >= start && e.date < end)
        : [];
      const sumBy = (status: 'APPROVED' | 'PENDING') =>
        foodExpenses.filter((e) => e.status === status).reduce((total, e) => add(total, e.total), toDecimal(0));

      const amounts = computeMealAmounts({
        allocated: toDecimal(envelope?.allocatedAmount ?? 0),
        unitCost: toDecimal(envelope?.mealUnitCost ?? 0),
        carriedIn: carryOversIn.reduce((total, c) => add(total, c.amount), toDecimal(0)),
        carriedOut: carryOversOut.reduce((total, c) => add(total, c.amount), toDecimal(0)),
        spent: sumBy('APPROVED'),
        pending: sumBy('PENDING'),
        workerDays: computeStats(rows).workerDays,
      });

      reports.set(month, {
        month,
        currency: project.currency,
        envelope,
        attendance: monthAttendance(rows, month, today),
        amounts,
        carryOversIn,
        carryOversOut,
        requests: requests.filter((r) => r.month === month),
      });
    }
    return reports;
  }

  private toApi(report: MonthReport) {
    const { envelope } = report;
    return {
      month: report.month,
      currency: report.currency,
      envelope: envelope
        ? {
            id: envelope.id,
            allocatedAmount: envelope.allocatedAmount.toFixed(2),
            mealUnitCost: envelope.mealUnitCost.toFixed(2),
            categoryId: envelope.categoryId,
            categoryName: envelope.category?.name ?? null,
            note: envelope.note,
            updatedAt: envelope.updatedAt,
          }
        : null,
      attendance: report.attendance,
      amounts: serializeAmounts(report.amounts),
      carryOversIn: report.carryOversIn.map((c) => ({ id: c.id, fromMonth: c.fromMonth, amount: c.amount.toFixed(2), reason: c.reason, createdAt: c.createdAt })),
      carryOversOut: report.carryOversOut.map((c) => ({ id: c.id, toMonth: c.toMonth, amount: c.amount.toFixed(2), reason: c.reason, createdAt: c.createdAt })),
      requests: report.requests,
      openRequestsCount: report.requests.filter((r) => r.status === 'OPEN').length,
    };
  }

  // --------------------------------------------------------------------
  // Notifications (apres validation de la transaction ; ne font jamais echouer l'operation)
  // --------------------------------------------------------------------

  private async senderLabel(actor: AuthenticatedUser): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { clientProfile: { select: { firstName: true, lastName: true } }, supervisorProfile: { select: { firstName: true, lastName: true } } },
    });
    const profile = user?.clientProfile ?? user?.supervisorProfile;
    return profile ? `${profile.firstName} ${profile.lastName}` : 'Superadmin';
  }

  private pageUrl(projectId: string, month: string): string {
    return `${this.config.get<string>('frontendUrl')}/projects/${projectId}/meals?month=${month}`;
  }

  private async notifySupervisors(project: ProjectLite, month: string, message: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const assignments = await this.prisma.projectSupervisor.findMany({
        where: { projectId: project.id, status: 'ACTIVE', supervisor: { user: { status: 'ACTIVE' } } },
        select: { supervisor: { select: { userId: true } } },
      });
      const label = await this.senderLabel(actor);
      const subject = `Demande de comptes — alimentation ${month}`;
      const url = this.pageUrl(project.id, month);
      await this.notifications.sendMany(
        assignments.map((a) => ({
          userId: a.supervisor.userId,
          type: 'MEAL_ACCOUNT_REQUESTED' as const,
          title: subject,
          message: `Projet « ${project.name} » : ${message}`,
          emailHtml: emailTemplates.newMessage(label, subject, `Projet « ${project.name} »\n\n${message}`, url),
          emailSubject: subject,
        })),
      );
    } catch {
      // Effet secondaire : la demande est deja enregistree.
    }
  }

  private async notifyClient(project: ProjectLite, month: string, response: string, actor: AuthenticatedUser): Promise<void> {
    try {
      const owner = await this.prisma.clientProfile.findUnique({ where: { id: project.clientId }, select: { userId: true } });
      if (!owner) return;
      const label = await this.senderLabel(actor);
      const subject = `Réponse à votre demande de comptes — alimentation ${month}`;
      await this.notifications.send({
        userId: owner.userId,
        type: 'MEAL_ACCOUNT_ANSWERED',
        title: subject,
        message: `Projet « ${project.name} » : ${response}`,
        emailHtml: emailTemplates.newMessage(label, subject, `Projet « ${project.name} »\n\n${response}`, this.pageUrl(project.id, month)),
        emailSubject: subject,
      });
    } catch {
      // Effet secondaire : la reponse est deja enregistree.
    }
  }
}
