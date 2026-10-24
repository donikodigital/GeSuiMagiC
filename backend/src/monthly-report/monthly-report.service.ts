//backend/src/monthly-report/monthly-report.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { formatMoney, roundMoney, toDecimal } from '../common/utils/money.util';
import { addMonths, isValidMonth, monthBounds, monthOf, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { toSafeFileName } from '../common/utils/file-name.util';
import { frDate, frMonthLabel, pdfBullets, pdfHeader, pdfKeyValues, pdfParagraph, pdfProgressRow, pdfSection, pdfStatCards, renderPdf } from '../common/pdf/pdf.util';
import { monthAttendance } from '../attendance/attendance.calc';
import { findProjectOrThrow } from '../attendance/attendance.helpers';
import { PlanningService } from '../progress/planning.service';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { daysUntil, documentStatus } from '../documents/documents.calc';
import { getClientUserId } from '../common/utils/technical-review.util';

const REPORT_WINDOW_MS = 40 * 24 * 60 * 60 * 1000;
/** Le rapport du mois precedent part entre le 1er et le 5 du mois (rattrapage si la tache a manque un jour). */
const SEND_UNTIL_DAY = 5;

const STOP_REASON_LABEL: Record<string, string> = {
  RAIN: 'Pluie',
  HOLIDAY: 'Jour férié',
  MATERIAL_SHORTAGE: 'Manque de matériaux',
  EQUIPMENT_BREAKDOWN: 'Panne de matériel',
  PAYMENT_DELAY: 'Retard de paiement',
  SAFETY: 'Sécurité',
  OTHER: 'Autre',
  UNSPECIFIED: 'Non précisé',
};

export type MonthlyReport = Awaited<ReturnType<MonthlyReportService['collect']>>;

/** Rapport mensuel d'un chantier : donnees, PDF et envoi automatique au client. */
@Injectable()
export class MonthlyReportService {
  private readonly logger = new Logger(MonthlyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly notifications: NotificationsService,
    private readonly notifier: SiteNotifierService,
    private readonly config: ConfigService,
  ) {}

  /** Mois precedent (AAAA-MM) par rapport a aujourd'hui. */
  previousMonth(today: Date = startOfUtcDay()): string {
    return addMonths(monthOf(today), -1);
  }

  resolveMonth(month?: string): string {
    const value = month ?? this.previousMonth();
    if (!isValidMonth(value)) throw AppException.badRequest('INVALID_MONTH', 'Le mois doit être au format AAAA-MM.');
    return value;
  }

  async collect(projectId: string, month: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { client: { select: { firstName: true, lastName: true, companyName: true } }, wallet: true },
    });
    if (!project) throw AppException.notFound('Projet');
    const { start, end } = monthBounds(month);
    const today = startOfUtcDay();
    const inMonth = { gte: start, lt: end };

    const [deposits, expenses, byCategory, pendingExpenses, workDays, presences, envelope, snagsOpen, snagsRaised, changeOrders, documents, stockItems, contracts, planning] = await Promise.all([
      this.prisma.deposit.aggregate({ where: { projectId, status: 'APPROVED', date: inMonth }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.expense.aggregate({ where: { projectId, status: 'APPROVED', date: inMonth }, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.expense.groupBy({ by: ['categoryId'], where: { projectId, status: 'APPROVED', date: inMonth }, _sum: { total: true } }),
      this.prisma.expense.count({ where: { projectId, status: 'PENDING' } }),
      this.prisma.workDay.findMany({ where: { projectId, date: inMonth }, select: { date: true, isWorked: true, workersCount: true, phaseId: true, stopReason: true } }),
      this.prisma.workerPresence.aggregate({ where: { projectId, date: inMonth }, _sum: { fraction: true } }),
      this.prisma.mealEnvelope.findUnique({ where: { projectId_month: { projectId, month } } }),
      this.prisma.snag.count({ where: { projectId, status: { in: ['OPEN', 'FIXED'] } } }),
      this.prisma.snag.count({ where: { projectId, raisedAt: inMonth } }),
      this.prisma.changeOrder.findMany({ where: { projectId, status: 'APPROVED', decidedAt: inMonth }, select: { number: true, title: true, extraCost: true, extraDays: true } }),
      this.prisma.projectDocument.findMany({ where: { projectId, expiresAt: { not: null } }, select: { title: true, expiresAt: true } }),
      this.prisma.stockItem.findMany({ where: { projectId, minQuantity: { not: null } }, select: { id: true, name: true, unit: true, minQuantity: true } }),
      this.prisma.contract.aggregate({ where: { projectId, status: { not: 'CANCELLED' } }, _sum: { amount: true }, _count: { _all: true } }),
      this.planning.get(projectId, today),
    ]);

    const categories = byCategory.length
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } }, select: { id: true, name: true } })
      : [];
    const topCategories = byCategory
      .map((c) => ({ name: categories.find((x) => x.id === c.categoryId)?.name ?? 'Autre', amount: roundMoney(c._sum.total ?? 0) }))
      .sort((a, b) => b.amount.comparedTo(a.amount))
      .slice(0, 6);

    const mealsSpent = envelope?.categoryId
      ? roundMoney((await this.prisma.expense.aggregate({ where: { projectId, status: 'APPROVED', categoryId: envelope.categoryId, date: inMonth }, _sum: { total: true } }))._sum.total ?? 0)
      : null;

    const movements = stockItems.length
      ? await this.prisma.stockMovement.groupBy({ by: ['stockItemId', 'type'], where: { stockItemId: { in: stockItems.map((i) => i.id) } }, _sum: { quantity: true } })
      : [];
    const lowStock = stockItems
      .filter((item) => {
        const level = movements
          .filter((m) => m.stockItemId === item.id)
          .reduce((sum, m) => sum.add(m.type === 'IN' ? (m._sum.quantity ?? 0) : m.type === 'ADJUSTMENT' ? (m._sum.quantity ?? 0) : toDecimal(m._sum.quantity ?? 0).abs().neg()), new Prisma.Decimal(0));
        return level.lessThanOrEqualTo(item.minQuantity as Prisma.Decimal);
      })
      .map((i) => i.name);

    const expiringDocuments = documents
      .map((d) => ({ title: d.title, expiresAt: toIsoDate(d.expiresAt as Date), daysLeft: daysUntil(d.expiresAt, today) as number, status: documentStatus(d.expiresAt, today) }))
      .filter((d) => d.status === 'EXPIRED' || d.status === 'EXPIRING')
      .filter((d) => d.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const stopCounts = new Map<string, number>();
    for (const row of workDays) if (!row.isWorked) stopCounts.set(row.stopReason ?? 'UNSPECIFIED', (stopCounts.get(row.stopReason ?? 'UNSPECIFIED') ?? 0) + 1);

    const budget = toDecimal(project.budget);
    const totalSpent = toDecimal(project.wallet?.totalSpent ?? 0);
    const clientName = project.client.companyName?.trim() || `${project.client.firstName} ${project.client.lastName}`.trim();

    return {
      projectId,
      projectName: project.name,
      clientName,
      currency: project.currency,
      month,
      monthLabel: frMonthLabel(month),
      generatedAt: new Date().toISOString(),
      finance: {
        depositsAmount: roundMoney(deposits._sum.amount ?? 0),
        depositsCount: deposits._count._all,
        expensesAmount: roundMoney(expenses._sum.total ?? 0),
        expensesCount: expenses._count._all,
        pendingExpenses,
        balance: roundMoney(project.wallet?.balance ?? 0),
        totalDeposited: roundMoney(project.wallet?.totalDeposited ?? 0),
        totalSpent: roundMoney(totalSpent),
        budget: roundMoney(budget),
        budgetConsumedPercent: budget.isZero() ? 0 : Math.round(totalSpent.div(budget).mul(1000).toNumber()) / 10,
        topCategories,
      },
      attendance: {
        ...monthAttendance(workDays, month, today),
        namedWorkerDays: toDecimal(presences._sum.fraction ?? 0).toNumber(),
        stopReasons: [...stopCounts.entries()].map(([reason, days]) => ({ reason, label: STOP_REASON_LABEL[reason] ?? reason, days })).sort((a, b) => b.days - a.days),
      },
      meals: envelope ? { allocated: roundMoney(envelope.allocatedAmount), spent: mealsSpent } : null,
      progress: {
        percent: planning.progressPercent,
        delayDays: planning.projectDelayDays,
        plannedEndDate: planning.plannedEndDate,
        projectedEndDate: planning.projectedEndDate,
        phases: planning.phases.filter((p) => p.isActive).map((p) => ({ name: p.name, percent: p.progressPercent, status: p.status, delayDays: p.delayDays })),
      },
      quality: { openSnags: snagsOpen, snagsRaised },
      changeOrders: changeOrders.map((c) => ({ ...c, extraCost: roundMoney(c.extraCost) })),
      contracts: { count: contracts._count._all, amount: roundMoney(contracts._sum.amount ?? 0) },
      lowStock,
      expiringDocuments,
    };
  }

  async buildPdf(report: MonthlyReport): Promise<{ buffer: Buffer; filename: string }> {
    const money = (value: Prisma.Decimal | number) => formatMoney(value, report.currency);
    const buffer = await renderPdf((doc) => {
      pdfHeader(doc, `Rapport mensuel — ${report.monthLabel}`, report.projectName, `Établi pour ${report.clientName} le ${frDate(report.generatedAt)}`);

      pdfSection(doc, 'Finances du mois');
      pdfStatCards(doc, [
        { label: 'Dépôts reçus', value: money(report.finance.depositsAmount), tone: 'good' },
        { label: 'Dépenses validées', value: money(report.finance.expensesAmount), tone: 'neutral' },
        { label: 'Solde du chantier', value: money(report.finance.balance), tone: report.finance.balance.lessThanOrEqualTo(0) ? 'bad' : 'good' },
        { label: 'Budget consommé', value: `${report.finance.budgetConsumedPercent} %`, tone: report.finance.budgetConsumedPercent >= 90 ? 'bad' : report.finance.budgetConsumedPercent >= 75 ? 'warn' : 'neutral' },
      ]);
      if (report.finance.pendingExpenses > 0) pdfParagraph(doc, `${report.finance.pendingExpenses} dépense(s) attendent encore une validation.`, { muted: true });
      if (report.finance.topCategories.length) {
        pdfParagraph(doc, 'Principales catégories de dépenses :');
        pdfBullets(doc, report.finance.topCategories.map((c) => `${c.name} : ${money(c.amount)}`));
      }

      pdfSection(doc, 'Avancement');
      pdfProgressRow(doc, 'Avancement global', report.progress.percent);
      for (const phase of report.progress.phases) {
        const note = phase.status === 'LATE' ? `${phase.percent} % (retard ${phase.delayDays} j)` : undefined;
        pdfProgressRow(doc, phase.name, phase.percent, note);
      }
      pdfKeyValues(doc, [
        ['Fin prévue', frDate(report.progress.plannedEndDate)],
        ['Fin projetée', frDate(report.progress.projectedEndDate)],
        ['Retard du projet', `${report.progress.delayDays} jour(s)`],
        ['Avenants validés', report.changeOrders.length ? report.changeOrders.map((c) => `n°${c.number} (+${money(c.extraCost)}, +${c.extraDays} j)`).join(' ; ') : 'Aucun'],
      ]);

      pdfSection(doc, 'Présence sur le chantier');
      pdfStatCards(doc, [
        { label: 'Jours travaillés', value: `${report.attendance.workedDays} / ${report.attendance.elapsedDays}`, tone: 'neutral' },
        { label: 'Jours-ouvriers', value: String(report.attendance.workerDays || report.attendance.namedWorkerDays), tone: 'neutral' },
        { label: 'Jours non renseignés', value: String(report.attendance.unrecordedDays), tone: report.attendance.unrecordedDays > 0 ? 'warn' : 'good' },
        { label: 'Taux de présence', value: `${report.attendance.attendanceRate} %`, tone: 'neutral' },
      ]);
      if (report.attendance.stopReasons.length) {
        pdfParagraph(doc, "Jours d'arrêt :");
        pdfBullets(doc, report.attendance.stopReasons.map((s) => `${s.label} : ${s.days} jour(s)`));
      }
      if (report.meals) {
        pdfParagraph(doc, `Alimentation des ouvriers : ${money(report.meals.spent ?? 0)} dépensés sur ${money(report.meals.allocated)} prévus.`);
      }

      pdfSection(doc, 'Qualité et sous-traitance');
      pdfKeyValues(doc, [
        ['Réserves ouvertes', String(report.quality.openSnags)],
        ['Réserves signalées ce mois', String(report.quality.snagsRaised)],
        ['Marchés de sous-traitance', `${report.contracts.count} (${money(report.contracts.amount)})`],
        ['Stock bas', report.lowStock.length ? report.lowStock.join(', ') : 'Aucun'],
      ]);

      pdfSection(doc, 'Points à surveiller');
      const watch: string[] = [];
      if (report.progress.delayDays > 0) watch.push(`Le projet accuse ${report.progress.delayDays} jour(s) de retard.`);
      if (report.finance.budgetConsumedPercent >= 90) watch.push(`${report.finance.budgetConsumedPercent} % du budget est déjà consommé.`);
      if (report.finance.balance.lessThanOrEqualTo(0)) watch.push('Le solde du chantier est épuisé : un nouveau dépôt est nécessaire.');
      if (report.attendance.unrecordedDays > 0) watch.push(`${report.attendance.unrecordedDays} jour(s) du mois ne sont pas renseignés par le superviseur.`);
      for (const d of report.expiringDocuments) watch.push(d.daysLeft < 0 ? `Document expiré : ${d.title} (${frDate(d.expiresAt)}).` : `Document à renouveler : ${d.title} (${frDate(d.expiresAt)}, dans ${d.daysLeft} j).`);
      if (watch.length === 0) pdfParagraph(doc, 'Rien à signaler ce mois-ci.', { muted: true });
      else pdfBullets(doc, watch);
    });
    return { buffer, filename: toSafeFileName(`rapport-mensuel-${report.projectName}-${report.month}.pdf`) };
  }

  async getPdf(projectId: string, month?: string) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.buildPdf(await this.collect(projectId, this.resolveMonth(month)));
  }

  async getData(projectId: string, month?: string) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.collect(projectId, this.resolveMonth(month));
  }

  /**
   * Envoie au client le rapport du mois ecoule (PDF en piece jointe), une seule fois par projet et par mois.
   * N'agit qu'entre le 1er et le 5 du mois. Renvoie le nombre de rapports envoyes.
   */
  async sendMonthlyReports(today: Date = startOfUtcDay()): Promise<number> {
    if (today.getUTCDate() > SEND_UNTIL_DAY) return 0;
    const month = this.previousMonth(today);
    const projects = await this.prisma.project.findMany({ where: { status: { in: ['ACTIVE', 'SUSPENDED'] } }, select: { id: true, name: true, clientId: true } });
    let sent = 0;
    for (const project of projects) {
      try {
        const userId = await getClientUserId(this.prisma, project.clientId);
        if (!userId) continue;
        const key = `${project.id}:${month}`;
        if (await this.notifier.recentlySent(userId, 'MONTHLY_REPORT', 'reportKey', key, REPORT_WINDOW_MS)) continue;

        const report = await this.collect(project.id, month);
        const { buffer, filename } = await this.buildPdf(report);
        const url = `${this.config.get<string>('frontendUrl')}/projects/${project.id}`;
        await this.notifications.send({
          userId,
          type: 'MONTHLY_REPORT',
          title: `Rapport mensuel — ${report.monthLabel}`,
          message: `Le rapport de ${report.monthLabel} du projet « ${project.name} » est disponible.`,
          emailSubject: `Rapport mensuel ${report.monthLabel} — ${project.name}`,
          emailHtml: emailTemplates.monthlyReport(report.clientName, project.name, report.monthLabel, url),
          emailAttachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
          meta: { projectId: project.id, month, reportKey: key },
        });
        sent += 1;
      } catch (err) {
        this.logger.error(`Rapport mensuel impossible pour le projet ${project.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
    return sent;
  }
}
