//backend/src/expenses/expenses.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpensePaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BudgetsService } from '../budgets/budgets.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { formatMoney, isGreaterThan, multiply, subtract, toDecimal } from '../common/utils/money.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpensePaymentDto } from './dto/update-expense-payment.dto';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly budgets: BudgetsService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------
  // CREATION (section 18-19-20)
  //
  // REGLE (demande explicite du client, remplace la section 20 du cahier
  // des charges d'origine) : une depense n'est JAMAIS bloquee par un solde
  // insuffisant. Si son montant depasse le solde disponible, le solde du
  // projet devient simplement negatif. Aucune verification de solde n'est
  // effectuee a la creation ni a la validation d'une depense.
  // ------------------------------------------------------------------
  async create(projectId: string, dto: CreateExpenseDto, actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERVISOR' || !actor.supervisorProfileId) {
      throw AppException.forbiddenProjectAccess();
    }

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const category = await this.prisma.expenseCategory.findUniqueOrThrow({ where: { id: dto.categoryId } });

    // TOTAL = QUANTITE x PRIX UNITAIRE - toujours recalcule et verifie cote backend (section 18).
    // Le DTO n'accepte volontairement pas de champ `total` envoye par le frontend.
    const total = multiply(dto.quantity, dto.unitPrice);

    const { paymentStatus, amountPaidToSupplier } = this.resolvePaymentFields(
      dto.paymentStatus ?? 'PAID_FULL',
      total,
      dto.amountPaidToSupplier,
    );

    // Section 19 : seuil de validation configurable par projet.
    // - autoApproveExpenses = false -> confirmation du client systematiquement requise.
    // - total > seuil -> confirmation du client requise (depense "importante").
    // - sinon -> validation automatique immediate.
    const requiresClientConfirmation = !project.autoApproveExpenses || isGreaterThan(total, project.expenseApprovalThreshold);
    const initialStatus = requiresClientConfirmation ? 'PENDING' : 'APPROVED';

    const expense = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          projectId,
          supervisorId: actor.supervisorProfileId!,
          date: dto.date ? new Date(dto.date) : new Date(),
          categoryId: dto.categoryId,
          materialId: dto.materialId,
          label: dto.label,
          quantity: dto.quantity,
          unit: dto.unit,
          unitPrice: dto.unitPrice,
          total,
          observation: dto.observation,
          supplier: dto.supplier,
          invoiceReference: dto.invoiceReference,
          status: initialStatus,
          paymentStatus,
          amountPaidToSupplier,
          createdById: actor.userId,
          isLocked: initialStatus === 'APPROVED',
          approvedById: initialStatus === 'APPROVED' ? actor.userId : null,
          approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
        },
      });

      if (initialStatus === 'APPROVED') {
        // Seules les depenses VALIDEES diminuent le solde (regle 7). Aucune verification bloquante.
        await this.wallets.recompute(projectId, tx);
      }

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Expense',
          entityId: created.id,
          newValue: { total: total.toString(), category: category.name, status: initialStatus, projectId },
        },
        tx,
      );

      return created;
    });

    if (initialStatus === 'PENDING') {
      const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: project.clientId } });
      await this.notifications.send({
        userId: client.userId,
        type: 'EXPENSE_PENDING_APPROVAL',
        title: 'Depense en attente de votre validation',
        message: `Une depense importante "${dto.label}" de ${formatMoney(total, project.currency)} necessite votre confirmation.`,
        emailHtml: emailTemplates.expensePendingApproval(
          client.firstName,
          project.name,
          formatMoney(total, project.currency),
          dto.label,
          `${this.config.get<string>('frontendUrl')}/projects/${projectId}/expenses/${expense.id}`,
        ),
        emailSubject: 'Depense en attente de validation',
      });
    } else {
      await this.runPostApprovalAlerts(projectId, dto.categoryId, total, project.currency);
    }

    return this.getRaw(expense.id);
  }

  async findAllForProject(projectId: string, query: ExpenseQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ExpenseWhereInput = {
      projectId,
      status: query.status,
      categoryId: query.categoryId,
      materialId: query.materialId,
      supervisorId: query.supervisorId,
      supplier: query.supplier ? { contains: query.supplier, mode: 'insensitive' } : undefined,
      date: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      total:
        query.minAmount !== undefined || query.maxAmount !== undefined
          ? { gte: query.minAmount, lte: query.maxAmount }
          : undefined,
      ...(query.search
        ? { OR: [{ label: { contains: query.search, mode: 'insensitive' } }, { supplier: { contains: query.search, mode: 'insensitive' } }, { invoiceReference: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: true,
          material: true,
          supervisor: { select: { firstName: true, lastName: true } },
          attachments: true,
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { items: items.map((e) => this.withComputedBalanceDue(e)), meta: buildPaginationMeta(page, limit, total) };
  }

  private async getRaw(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: true,
        material: true,
        supervisor: true,
        project: { select: { id: true, name: true, currency: true, clientId: true } },
        attachments: true,
      },
    });
    if (!expense) throw AppException.notFound('Depense');
    return this.withComputedBalanceDue(expense);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const expense = await this.getRaw(id);
    if (actor.role === 'SUPERADMIN') return expense;
    if (actor.role === 'CLIENT' && (expense as any).project.clientId === actor.clientProfileId) return expense;
    if (actor.role === 'SUPERVISOR' && expense.supervisorId === actor.supervisorProfileId) return expense;
    throw AppException.forbiddenProjectAccess();
  }

  /** Confirmation du client pour une depense importante (section 19). */
  async approve(id: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUniqueOrThrow({ where: { id }, include: { project: true } });

    if (actor.role !== 'CLIENT' || actor.clientProfileId !== expense.project.clientId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (expense.status !== 'PENDING') {
      throw AppException.conflict('EXPENSE_NOT_PENDING', 'Cette depense a deja ete traitee.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', isLocked: true, approvedById: actor.userId, approvedAt: new Date() },
      });
      // Aucune verification de solde : le solde peut devenir negatif (regle explicite du client).
      await this.wallets.recompute(expense.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'APPROVE',
          entityType: 'Expense',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: 'APPROVED' },
        },
        tx,
      );
    });

    await this.runPostApprovalAlerts(expense.projectId, expense.categoryId, expense.total, expense.project.currency);
    return this.getRaw(id);
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUniqueOrThrow({ where: { id }, include: { project: true, supervisor: true } });

    if (actor.role !== 'CLIENT' || actor.clientProfileId !== expense.project.clientId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (expense.status !== 'PENDING') {
      throw AppException.conflict('EXPENSE_NOT_PENDING', 'Cette depense a deja ete traitee.');
    }

    await this.prisma.expense.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, approvedById: actor.userId, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'REJECT',
      entityType: 'Expense',
      entityId: id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'REJECTED', reason },
      reason,
    });

    await this.notifications.send({
      userId: expense.supervisor.userId,
      type: 'EXPENSE_REJECTED',
      title: 'Depense refusee',
      message: `Votre depense "${expense.label}" de ${formatMoney(expense.total, expense.project.currency)} a ete refusee : ${reason}`,
    });

    return this.getRaw(id);
  }

  /**
   * Annulation d'une depense validee (section 52) : jamais de suppression
   * physique. On bascule en CANCELLED (le montant original reste visible
   * dans l'historique) et on recalcule le solde, qui augmente d'autant.
   */
  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUniqueOrThrow({ where: { id } });
    if (expense.status !== 'APPROVED') {
      throw AppException.conflict('EXPENSE_NOT_APPROVED', 'Seule une depense validee peut etre annulee.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { status: 'CANCELLED', rejectionReason: reason } });
      await this.wallets.recompute(expense.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CANCEL',
          entityType: 'Expense',
          entityId: id,
          oldValue: { status: 'APPROVED', total: expense.total.toString() },
          newValue: { status: 'CANCELLED' },
          reason,
        },
        tx,
      );
    });

    return this.getRaw(id);
  }

  /** Correction administrative (section 16/53), reservee au superadmin. */
  async correctAmount(id: string, newTotal: number, reason: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUniqueOrThrow({ where: { id }, include: { project: true } });
    const oldTotal = expense.total;

    await this.prisma.runInTransaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { total: newTotal } });

      await tx.financialCorrection.create({
        data: { entityType: 'Expense', entityId: id, oldValue: oldTotal, newValue: newTotal, reason, correctedById: actor.userId },
      });

      if (expense.status === 'APPROVED') {
        await this.wallets.recompute(expense.projectId, tx);
      }

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'ADMIN_CORRECTION',
          entityType: 'Expense',
          entityId: id,
          oldValue: { total: oldTotal.toString() },
          newValue: { total: newTotal },
          reason,
        },
        tx,
      );
    });

    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: expense.project.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Correction administrative sur une depense',
      message: `Le montant d'une depense a ete corrige de ${formatMoney(oldTotal, expense.project.currency)} a ${formatMoney(newTotal, expense.project.currency)}.`,
      emailHtml: emailTemplates.adminCorrection(
        client.firstName,
        'Expense',
        formatMoney(oldTotal, expense.project.currency),
        formatMoney(newTotal, expense.project.currency),
        reason,
        `${this.config.get<string>('frontendUrl')}/projects/${expense.projectId}`,
      ),
      emailSubject: 'Correction administrative',
    });

    return this.getRaw(id);
  }

  /** Mise a jour du statut de paiement fournisseur - n'affecte jamais le solde du chantier. */
  async updatePaymentStatus(id: string, dto: UpdateExpensePaymentDto, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUniqueOrThrow({ where: { id } });
    if (actor.role === 'SUPERVISOR' && expense.supervisorId !== actor.supervisorProfileId) {
      throw AppException.forbiddenProjectAccess();
    }

    const { paymentStatus, amountPaidToSupplier } = this.resolvePaymentFields(dto.paymentStatus, expense.total, dto.amountPaidToSupplier);

    const updated = await this.prisma.expense.update({ where: { id }, data: { paymentStatus, amountPaidToSupplier } });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Expense',
      entityId: id,
      oldValue: { paymentStatus: expense.paymentStatus, amountPaidToSupplier: expense.amountPaidToSupplier.toString() },
      newValue: { paymentStatus, amountPaidToSupplier: amountPaidToSupplier.toString() },
    });

    return this.getRaw(id);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  private resolvePaymentFields(status: ExpensePaymentStatus, total: Prisma.Decimal, providedAmountPaid?: number) {
    if (status === 'PAID_FULL') return { paymentStatus: status, amountPaidToSupplier: total };
    if (status === 'CREDIT') return { paymentStatus: status, amountPaidToSupplier: toDecimal(0) };

    // PARTIAL : un acompte doit etre fourni et rester strictement entre 0 et le total.
    const amount = toDecimal(providedAmountPaid ?? 0);
    if (!isGreaterThan(amount, 0) || !isGreaterThan(total, amount)) {
      throw AppException.badRequest(
        'INVALID_PARTIAL_PAYMENT',
        "Pour un paiement partiel, le montant verse doit etre superieur a 0 et inferieur au total de la depense.",
      );
    }
    return { paymentStatus: status, amountPaidToSupplier: amount };
  }

  private withComputedBalanceDue<T extends { total: Prisma.Decimal; amountPaidToSupplier: Prisma.Decimal }>(expense: T) {
    return { ...expense, balanceDueToSupplier: subtract(expense.total, expense.amountPaidToSupplier) };
  }

  /**
   * Alertes financieres (section 42), best-effort et non bloquantes :
   * - solde faible (< 10% du budget)
   * - depense importante (> 5% du budget)
   * - depassement de budget par categorie
   */
  private async runPostApprovalAlerts(projectId: string, categoryId: string, expenseTotal: Prisma.Decimal, currency: string) {
    try {
      const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: project.clientId } });
      const wallet = await this.wallets.getWallet(projectId);
      const budget = toDecimal(project.budget);

      if (budget.greaterThan(0)) {
        // Solde faible
        if (wallet.balance.div(budget).lessThan(0.1)) {
          await this.notifications.send({
            userId: client.userId,
            type: 'LOW_BALANCE_ALERT',
            title: 'Alerte : solde faible',
            message: `Le solde disponible du projet "${project.name}" est descendu a ${formatMoney(wallet.balance, currency)}.`,
            emailHtml: emailTemplates.lowBalanceAlert(
              client.firstName,
              project.name,
              formatMoney(wallet.balance, currency),
              `${this.config.get<string>('frontendUrl')}/projects/${projectId}`,
            ),
            emailSubject: 'Alerte : solde faible',
          });
        }

        // Depense importante (> 5% du budget)
        if (expenseTotal.div(budget).greaterThan(0.05)) {
          await this.notifications.send({
            userId: client.userId,
            type: 'LARGE_EXPENSE_ALERT',
            title: 'Alerte : depense importante',
            message: `Une depense de ${formatMoney(expenseTotal, currency)} depasse 5% du budget du projet "${project.name}".`,
          });
        }
      }

      // Depassement de budget par categorie
      const isOverBudget = await this.budgets.isCategoryOverBudget(projectId, categoryId);
      if (isOverBudget) {
        const category = await this.prisma.expenseCategory.findUniqueOrThrow({ where: { id: categoryId } });
        await this.notifications.send({
          userId: client.userId,
          type: 'BUDGET_EXCEEDED_ALERT',
          title: 'Alerte : depassement de budget',
          message: `La categorie "${category.name}" du projet "${project.name}" depasse le budget previsionnel.`,
          emailHtml: emailTemplates.budgetExceededAlert(
            client.firstName,
            project.name,
            category.name,
            `${this.config.get<string>('frontendUrl')}/projects/${projectId}/budgets`,
          ),
          emailSubject: 'Alerte : depassement de budget',
        });
      }
    } catch (err) {
      // Les alertes ne doivent jamais faire echouer l'operation financiere qui les declenche.
      this.logger.error(`Echec du calcul des alertes pour le projet ${projectId}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
