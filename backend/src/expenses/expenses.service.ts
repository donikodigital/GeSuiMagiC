//backend/src/expenses/expenses.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpensePaymentStatus, Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { isCatalogueEntryUsableBy } from '../common/utils/catalogue-access.util';
import { NotificationsService, SendNotificationInput } from '../notifications/notifications.service';
import { BudgetsService } from '../budgets/budgets.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { formatMoney, isGreaterThan, isWithinMoneyRange, multiply, roundMoney, subtract, toDecimal } from '../common/utils/money.util';
import { buildDateRange } from '../common/utils/date-range.util';
import { assessLocation, LocationAssessment } from '../common/utils/geo.util';
import { getPosition, isTechnicalReviewer, listTechnicalReviewerUserIds } from '../common/utils/technical-review.util';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { assertProjectAcceptsFinancialOperations } from '../common/utils/project-status.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpensePaymentDto } from './dto/update-expense-payment.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { AllocateExpenseDto } from './dto/allocate-expense.dto';
import { TechnicalReviewDto } from './dto/technical-review.dto';

/** Types de pieces jointes qui comptent comme justificatif de depense. */
export const RECEIPT_KINDS = ['facture', 'recu', 'bon_livraison'];

/** Donnees d'une depense a creer (saisie du superviseur, paie, paiement de sous-traitant...). */
export interface ExpenseInput {
  date?: string | Date;
  categoryId: string;
  materialId?: string;
  label: string;
  quantity: number | Prisma.Decimal;
  unit: string;
  unitPrice: number | Prisma.Decimal;
  observation?: string;
  supplier?: string;
  invoiceReference?: string;
  paymentStatus?: ExpensePaymentStatus;
  amountPaidToSupplier?: number;
  phaseId?: string;
  supplierId?: string;
  contractId?: string;
  latitude?: number;
  longitude?: number;
  clientRef?: string;
}

export interface CreatedExpense {
  expense: Prisma.ExpenseGetPayload<object>;
  status: 'PENDING' | 'APPROVED';
  cumulativeTriggered: boolean;
  receiptRequired: boolean;
  techReviewPending: boolean;
  location: LocationAssessment;
}

/** Delai pendant lequel une meme alerte (solde faible, budget depasse) n'est pas renvoyee. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Regles principales :
 *  - total = quantite x prix unitaire, calcule et ARRONDI a 2 decimales cote serveur ;
 *  - une depense passe directement APPROVED si le projet l'autorise ET que le total (et le cumul recent du
 *    meme superviseur, regle anti-fractionnement) reste sous le seuil ; sinon elle attend le client ;
 *  - toute ecriture financiere + audit + recalcul du portefeuille partagent UNE transaction ;
 *  - les decisions (valider/refuser/annuler) sont des mises a jour conditionnelles : pas de double decision ;
 *  - alertes et emails partent APRES la transaction et ne la font jamais echouer.
 */
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
    private readonly siteNotifier: SiteNotifierService,
  ) {}

  private projectUrl(projectId: string, suffix = ''): string {
    return `${this.config.get<string>('frontendUrl')}/projects/${projectId}${suffix}`;
  }

  /** Execute un effet de bord post-commit sans jamais faire echouer l'operation deja validee. */
  private async afterCommit(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      this.logger.error("Echec d'une tache post-validation (notification)", err instanceof Error ? err.stack : String(err));
    }
  }

  // ------------------------------------------------------------------
  // CREATION
  // ------------------------------------------------------------------
  async create(projectId: string, dto: CreateExpenseDto, actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERVISOR' || !actor.supervisorProfileId) {
      throw AppException.forbiddenProjectAccess();
    }
    const supervisorId = actor.supervisorProfileId;

    // Rejeu d'une saisie hors ligne : la depense existe deja, on la renvoie sans rien dupliquer.
    if (dto.clientRef) {
      const already = await this.prisma.expense.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.getRaw(already.id);
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppException.notFound('Projet');
    // Un projet suspendu / termine / archive n'accepte plus de nouvelle depense.
    assertProjectAcceptsFinancialOperations(project.status);

    let result: CreatedExpense;
    try {
      // Decision de validation automatique ET insertion dans la MEME transaction (Serializable) :
      // deux depenses simultanees d'un meme superviseur ne peuvent pas contourner le seuil ensemble.
      result = await this.prisma.runInTransaction((tx) => this.createInTx(tx, project, actor, supervisorId, dto));
    } catch (err) {
      if (dto.clientRef && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.expense.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
        if (raced) return this.getRaw(raced.id);
      }
      throw err;
    }

    await this.afterCreate(project, result, actor);
    return this.getRaw(result.expense.id);
  }

  /**
   * Coeur de la creation d'une depense, partage avec la paie et les paiements de sous-traitance.
   * Applique TOUTES les regles : seuil de validation, anti-fractionnement, justificatif obligatoire,
   * validation technique, controle de position. A appeler dans une transaction.
   */
  async createInTx(
    tx: TxClient,
    project: Prisma.ProjectGetPayload<object>,
    actor: AuthenticatedUser,
    supervisorId: string,
    input: ExpenseInput,
  ): Promise<CreatedExpense> {
    const position = await getPosition(tx, project.id, supervisorId);
    if (position === 'ARCHITECT') {
      throw AppException.forbidden('ARCHITECT_CANNOT_SPEND', "L'architecte contrôle le chantier mais ne saisit pas de dépenses.");
    }

    const category = await this.assertCategoryAndMaterial(project.clientId, input.categoryId, input.materialId, tx);
    const allocation = await this.resolveAllocation(tx, project, input);

    const total = this.computeTotal(input.quantity, input.unitPrice);
    const { paymentStatus, amountPaidToSupplier } = this.resolvePaymentFields(input.paymentStatus ?? 'PAID_FULL', total, input.amountPaidToSupplier);
    const windowHours = this.config.get<number>('expenses.cumulativeWindowHours') ?? 0;

    let requiresClientConfirmation = !project.autoApproveExpenses || isGreaterThan(total, project.expenseApprovalThreshold);
    let cumulative = false;

    // Anti-fractionnement : une depense isolee sous le seuil mais qui, ajoutee aux depenses recentes du
    // meme superviseur sur ce projet, depasse le seuil, est soumise au client.
    if (!requiresClientConfirmation && windowHours > 0) {
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const recent = await tx.expense.aggregate({
        where: { projectId: project.id, supervisorId, createdAt: { gte: since }, status: { in: ['APPROVED', 'PENDING'] } },
        _sum: { total: true },
      });
      if (isGreaterThan(toDecimal(recent._sum.total ?? 0).add(total), project.expenseApprovalThreshold)) {
        requiresClientConfirmation = true;
        cumulative = true;
      }
    }

    // Justificatif obligatoire au-dessus d'un montant : il ne peut pas encore etre joint a la creation,
    // donc la depense attend le client, qui ne pourra la valider qu'une fois la piece jointe.
    const receiptRequired = project.receiptRequiredAbove != null && isGreaterThan(total, project.receiptRequiredAbove);
    if (receiptRequired) requiresClientConfirmation = true;

    // Validation technique prealable (conducteur de travaux / architecte) : seulement s'il y en a un d'affecte.
    let techReviewPending = false;
    if (project.technicalReviewAbove != null && isGreaterThan(total, project.technicalReviewAbove)) {
      techReviewPending = (await listTechnicalReviewerUserIds(tx, project.id)).length > 0;
    }
    if (techReviewPending) requiresClientConfirmation = true;

    const location = assessLocation(project, input.latitude, input.longitude);
    const status = requiresClientConfirmation ? 'PENDING' : 'APPROVED';

    const created = await tx.expense.create({
      data: {
        projectId: project.id,
        supervisorId,
        date: input.date ? new Date(input.date) : new Date(),
        categoryId: input.categoryId,
        materialId: input.materialId,
        label: input.label,
        quantity: input.quantity,
        unit: input.unit,
        unitPrice: roundMoney(input.unitPrice),
        total,
        observation: input.observation,
        supplier: input.supplier ?? allocation.supplierName ?? undefined,
        invoiceReference: input.invoiceReference,
        phaseId: allocation.phaseId,
        supplierId: allocation.supplierId,
        contractId: allocation.contractId,
        latitude: location.latitude,
        longitude: location.longitude,
        isOffSite: location.isOffSite,
        distanceMeters: location.distanceMeters,
        techReviewStatus: techReviewPending ? 'PENDING' : 'NOT_REQUIRED',
        clientRef: input.clientRef,
        status,
        paymentStatus,
        amountPaidToSupplier,
        createdById: actor.userId,
        isLocked: status === 'APPROVED',
        approvedById: status === 'APPROVED' ? actor.userId : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
    });

    if (status === 'APPROVED') {
      await this.wallets.recompute(project.id, tx);
    }

    await this.audit.log(
      {
        userId: actor.userId,
        userRole: actor.role,
        action: 'CREATE',
        entityType: 'Expense',
        entityId: created.id,
        newValue: {
          total: total.toString(),
          category: category.name,
          status,
          projectId: project.id,
          phaseId: allocation.phaseId,
          ...(cumulative ? { reason: `Cumul des depenses sur ${windowHours} h superieur au seuil de validation` } : {}),
          ...(receiptRequired ? { receiptRequired: true } : {}),
          ...(techReviewPending ? { technicalReview: 'PENDING' } : {}),
          ...(location.isOffSite ? { offSite: true, distanceMeters: location.distanceMeters } : {}),
        },
      },
      tx,
    );

    return { expense: created, status, cumulativeTriggered: cumulative, receiptRequired, techReviewPending, location };
  }

  /** Notifications et alertes qui suivent une creation de depense (jamais bloquantes). */
  async afterCreate(project: Prisma.ProjectGetPayload<object>, created: CreatedExpense, actor: AuthenticatedUser): Promise<void> {
    const { expense, status, cumulativeTriggered, receiptRequired, techReviewPending, location } = created;
    const total = expense.total;

    if (status === 'PENDING') {
      await this.afterCommit(async () => {
        const client = await this.prisma.clientProfile.findUnique({ where: { id: project.clientId }, select: { userId: true, firstName: true } });
        if (!client) return;
        const reason = cumulativeTriggered
          ? `La dépense "${expense.label}" de ${formatMoney(total, project.currency)} porte le cumul récent du superviseur au-dessus du seuil : votre confirmation est requise.`
          : receiptRequired
            ? `La dépense "${expense.label}" de ${formatMoney(total, project.currency)} exige un justificatif : vous pourrez la valider une fois la pièce jointe ajoutée.`
            : `Une dépense importante "${expense.label}" de ${formatMoney(total, project.currency)} nécessite votre confirmation.`;
        await this.notifications.send({
          userId: client.userId,
          type: 'EXPENSE_PENDING_APPROVAL',
          title: 'Dépense en attente de votre validation',
          message: reason,
          emailHtml: emailTemplates.expensePendingApproval(client.firstName, project.name, formatMoney(total, project.currency), expense.label, this.projectUrl(project.id, `/expenses/${expense.id}`)),
          emailSubject: 'Dépense en attente de validation',
          meta: { projectId: project.id, expenseId: expense.id },
        });
      });
    } else {
      await this.runPostApprovalAlerts(project.id, expense.categoryId, total, project.currency);
    }

    if (techReviewPending) {
      await this.siteNotifier.toReviewers(
        project.id,
        {
          type: 'TECH_REVIEW_REQUESTED',
          title: 'Validation technique demandée',
          message: `La dépense "${expense.label}" de ${formatMoney(total, project.currency)} (${project.name}) attend votre validation technique.`,
          path: `/expenses/${expense.id}`,
          meta: { expenseId: expense.id },
        },
        actor.userId,
      );
    }

    if (location.isOffSite) {
      await this.siteNotifier.toClient(project, {
        type: 'LOCATION_ALERT',
        title: 'Dépense saisie loin du chantier',
        message: `La dépense "${expense.label}" (${project.name}) a été saisie à environ ${location.distanceMeters} m du chantier (rayon autorisé : ${project.geoFenceMeters} m).`,
        path: `/expenses/${expense.id}`,
        meta: { expenseId: expense.id },
      });
    }
  }

  /**
   * Controle et resout les rattachements analytiques d'une depense : etape du projet, fournisseur de l'annuaire du client,
   * marche de sous-traitance du projet (qui impose son fournisseur et, a defaut, son etape).
   */
  private async resolveAllocation(
    client: TxClient | PrismaService,
    project: { id: string; clientId: string },
    input: { phaseId?: string | null; supplierId?: string | null; contractId?: string | null },
  ) {
    let phaseId = input.phaseId ?? null;
    let supplierId = input.supplierId ?? null;
    const contractId = input.contractId ?? null;
    let supplierName: string | null = null;

    if (contractId) {
      const contract = await client.contract.findFirst({ where: { id: contractId, projectId: project.id }, select: { supplierId: true, phaseId: true, status: true } });
      if (!contract) throw AppException.badRequest('INVALID_CONTRACT', "Ce marché n'existe pas sur ce projet.");
      if (contract.status === 'CANCELLED') throw AppException.badRequest('INVALID_CONTRACT', 'Ce marché est annulé.');
      if (supplierId && supplierId !== contract.supplierId) {
        throw AppException.badRequest('SUPPLIER_CONTRACT_MISMATCH', "Le fournisseur indiqué n'est pas celui de ce marché.");
      }
      supplierId = contract.supplierId;
      phaseId = phaseId ?? contract.phaseId;
    }
    if (phaseId) {
      const phase = await client.projectPhase.findFirst({ where: { id: phaseId, projectId: project.id }, select: { isActive: true } });
      if (!phase || !phase.isActive) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas ou n'est plus active.");
    }
    if (supplierId) {
      const supplier = await client.supplier.findFirst({ where: { id: supplierId, ownerClientId: project.clientId }, select: { name: true, isActive: true } });
      if (!supplier || !supplier.isActive) throw AppException.badRequest('INVALID_SUPPLIER', "Ce fournisseur n'existe pas ou n'est plus actif.");
      supplierName = supplier.name;
    }
    return { phaseId, supplierId, contractId, supplierName };
  }

  // ------------------------------------------------------------------
  // LECTURE
  // ------------------------------------------------------------------
  async findAllForProject(projectId: string, query: ExpenseQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Un superviseur ne voit QUE ses propres depenses (comme findOne), pas celles des autres superviseurs du projet.
    let supervisorId = query.supervisorId;
    if (actor.role === 'SUPERVISOR') {
      if (!actor.supervisorProfileId) throw AppException.forbiddenProjectAccess();
      supervisorId = actor.supervisorProfileId;
    }

    const where: Prisma.ExpenseWhereInput = {
      projectId,
      status: query.status,
      categoryId: query.categoryId,
      materialId: query.materialId,
      phaseId: query.phaseId,
      supplierId: query.supplierId,
      contractId: query.contractId,
      techReviewStatus: query.techReviewStatus,
      isOffSite: query.offSite ? true : undefined,
      supervisorId,
      isArchived: query.includeArchived ? undefined : false,
      supplier: query.supplier ? { contains: query.supplier, mode: 'insensitive' } : undefined,
      date: buildDateRange(query.from, query.to),
      total:
        query.minAmount !== undefined || query.maxAmount !== undefined
          ? { gte: query.minAmount, lte: query.maxAmount }
          : undefined,
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: 'insensitive' } },
              { supplier: { contains: query.search, mode: 'insensitive' } },
              { invoiceReference: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: true,
          material: true,
          phase: { select: { id: true, name: true } },
          supplierRef: { select: { id: true, name: true } },
          supervisor: { select: { firstName: true, lastName: true } },
          attachments: true,
          project: { select: { receiptRequiredAbove: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { items: items.map((e) => this.decorate(e)), meta: buildPaginationMeta(page, limit, total) };
  }

  /**
   * Seuls prenom/nom du superviseur sont renvoyes : avant, son profil COMPLET (piece d'identite, notes...)
   * etait expose a tout acteur autorise a lire la depense (dont le client).
   */
  private async getRaw(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: true,
        material: true,
        phase: { select: { id: true, name: true } },
        supplierRef: { select: { id: true, name: true } },
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, currency: true, clientId: true, receiptRequiredAbove: true } },
        attachments: true,
      },
    });
    if (!expense) throw AppException.notFound('Dépense');
    return this.decorate(expense);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const expense = await this.getRaw(id);
    if (actor.role === 'SUPERADMIN') return expense;
    if (actor.role === 'CLIENT' && actor.clientProfileId && expense.project.clientId === actor.clientProfileId) return expense;
    if (actor.role === 'SUPERVISOR' && actor.supervisorProfileId && expense.supervisorId === actor.supervisorProfileId) return expense;
    throw AppException.forbiddenProjectAccess();
  }

  // ------------------------------------------------------------------
  // DECISIONS DU CLIENT
  // ------------------------------------------------------------------
  private async loadForClientDecision(id: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { project: true, supervisor: { select: { userId: true } } } });
    if (!expense) throw AppException.notFound('Dépense');

    if (actor.role !== 'CLIENT' || !actor.clientProfileId || actor.clientProfileId !== expense.project.clientId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (expense.status !== 'PENDING') {
      throw AppException.conflict('EXPENSE_NOT_PENDING', 'Cette dépense a déjà été traitée.');
    }
    return expense;
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const expense = await this.loadForClientDecision(id, actor);

    // Double validation : la validation technique doit etre donnee AVANT celle du client.
    if (expense.techReviewStatus === 'PENDING') {
      throw AppException.conflict('TECH_REVIEW_PENDING', 'Cette dépense attend encore la validation technique du conducteur de travaux ou de l\'architecte.');
    }
    // Justificatif obligatoire au-dessus du montant fixe pour le projet.
    if (expense.project.receiptRequiredAbove != null && isGreaterThan(expense.total, expense.project.receiptRequiredAbove)) {
      const receipts = await this.prisma.attachment.count({ where: { expenseId: id, kind: { in: RECEIPT_KINDS } } });
      if (receipts === 0) {
        throw AppException.conflict('RECEIPT_REQUIRED', 'Un justificatif (facture, reçu ou bon de livraison) est obligatoire pour valider cette dépense.');
      }
    }

    await this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.expense.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', isLocked: true, approvedById: actor.userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) throw AppException.conflict('EXPENSE_NOT_PENDING', 'Cette dépense a déjà été traitée.');

      await this.wallets.recompute(expense.projectId, tx);

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'Expense', entityId: id, oldValue: { status: 'PENDING' }, newValue: { status: 'APPROVED' } },
        tx,
      );
    });

    await this.runPostApprovalAlerts(expense.projectId, expense.categoryId, expense.total, expense.project.currency);
    return this.getRaw(id);
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser) {
    const expense = await this.loadForClientDecision(id, actor);

    await this.prisma.runInTransaction(async (tx) => {
      // Avant : mise a jour sans condition de statut ni transaction (course possible avec une validation).
      const updated = await tx.expense.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED', rejectionReason: reason, approvedById: actor.userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) throw AppException.conflict('EXPENSE_NOT_PENDING', 'Cette dépense a déjà été traitée.');

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'REJECT',
          entityType: 'Expense',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: 'REJECTED', reason },
          reason,
        },
        tx,
      );
    });

    await this.notifications.send({
      userId: expense.supervisor.userId,
      type: 'EXPENSE_REJECTED',
      title: 'Dépense refusée',
      message: `Votre dépense "${expense.label}" de ${formatMoney(expense.total, expense.project.currency)} a été refusée : ${reason}`,
    });

    return this.getRaw(id);
  }

  // ------------------------------------------------------------------
  // VALIDATION TECHNIQUE (conducteur de travaux / architecte)
  // ------------------------------------------------------------------
  async technicalReview(id: string, dto: TechnicalReviewDto, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { project: true, supervisor: { select: { userId: true } } },
    });
    if (!expense) throw AppException.notFound('Dépense');

    if (!(await isTechnicalReviewer(this.prisma, expense.projectId, actor))) throw AppException.forbiddenProjectAccess();
    // Une personne ne valide jamais sa propre dépense (double validation réelle).
    if (actor.role !== 'SUPERADMIN' && expense.supervisorId === actor.supervisorProfileId) {
      throw AppException.forbidden('SELF_REVIEW', 'Vous ne pouvez pas valider techniquement votre propre dépense.');
    }
    if (expense.status !== 'PENDING' || expense.techReviewStatus !== 'PENDING') {
      throw AppException.conflict('TECH_REVIEW_NOT_PENDING', "Cette dépense n'attend pas de validation technique.");
    }
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) {
      throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif du refus.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      const approved = dto.decision === 'APPROVED';
      const updated = await tx.expense.updateMany({
        where: { id, status: 'PENDING', techReviewStatus: 'PENDING' },
        data: {
          techReviewStatus: approved ? 'APPROVED' : 'REJECTED',
          techReviewedById: actor.userId,
          techReviewedAt: new Date(),
          techReviewNote: dto.note?.trim() || null,
          ...(approved ? {} : { status: 'REJECTED', rejectionReason: `Refus technique : ${dto.note!.trim()}` }),
        },
      });
      if (updated.count !== 1) throw AppException.conflict('TECH_REVIEW_NOT_PENDING', "Cette dépense n'attend pas de validation technique.");

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: approved ? 'APPROVE' : 'REJECT',
          entityType: 'Expense',
          entityId: id,
          oldValue: { techReviewStatus: 'PENDING' },
          newValue: { techReviewStatus: approved ? 'APPROVED' : 'REJECTED', note: dto.note ?? null },
          reason: dto.note,
        },
        tx,
      );
    });

    await this.afterCommit(async () => {
      if (dto.decision === 'APPROVED') {
        await this.siteNotifier.toClient(expense.project, {
          type: 'EXPENSE_PENDING_APPROVAL',
          title: 'Dépense validée techniquement',
          message: `La dépense "${expense.label}" de ${formatMoney(expense.total, expense.project.currency)} est validée techniquement : elle attend votre décision.`,
          path: `/expenses/${id}`,
          meta: { expenseId: id },
        });
      } else {
        await this.notifications.send({
          userId: expense.supervisor.userId,
          type: 'EXPENSE_REJECTED',
          title: 'Dépense refusée techniquement',
          message: `Votre dépense "${expense.label}" a été refusée par la validation technique : ${dto.note}`,
          meta: { projectId: expense.projectId, expenseId: id },
        });
      }
    });

    return this.getRaw(id);
  }

  // ------------------------------------------------------------------
  // RATTACHEMENT ANALYTIQUE (etape, fournisseur) - sans effet sur les montants
  // ------------------------------------------------------------------
  async setAllocation(id: string, dto: AllocateExpenseDto, actor: AuthenticatedUser) {
    const current = await this.prisma.expense.findUnique({ where: { id }, include: { project: { select: { id: true, clientId: true } } } });
    if (!current) throw AppException.notFound('Dépense');

    const allowed =
      actor.role === 'SUPERADMIN' ||
      (actor.role === 'CLIENT' && actor.clientProfileId === current.project.clientId) ||
      (actor.role === 'SUPERVISOR' && !!actor.supervisorProfileId && actor.supervisorProfileId === current.supervisorId);
    if (!allowed) throw AppException.forbiddenProjectAccess();
    if (current.status === 'CANCELLED') throw AppException.conflict('EXPENSE_CANCELLED', 'Une dépense annulée ne peut plus être rattachée.');

    await this.prisma.runInTransaction(async (tx) => {
      const next = await this.resolveAllocation(tx, current.project, {
        phaseId: dto.phaseId === undefined ? current.phaseId : dto.phaseId,
        supplierId: dto.supplierId === undefined ? current.supplierId : dto.supplierId,
        contractId: current.contractId,
      });
      await tx.expense.update({
        where: { id },
        data: {
          phaseId: next.phaseId,
          supplierId: next.supplierId,
          supplier: dto.supplierId && !current.supplier ? next.supplierName : undefined,
        },
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Expense',
          entityId: id,
          oldValue: { phaseId: current.phaseId, supplierId: current.supplierId },
          newValue: { phaseId: next.phaseId, supplierId: next.supplierId },
        },
        tx,
      );
    });
    return this.getRaw(id);
  }

  // ------------------------------------------------------------------
  // ACTIONS DU SUPERADMIN
  // ------------------------------------------------------------------
  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw AppException.notFound('Dépense');
      if (expense.status !== 'APPROVED') {
        throw AppException.conflict('EXPENSE_NOT_APPROVED', 'Seule une dépense validée peut être annulée.');
      }

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

  async correctAmount(id: string, newTotalInput: number, reason: string, actor: AuthenticatedUser) {
    const newTotal = roundMoney(newTotalInput);

    const { expense, oldTotal, projectInfo } = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.expense.findUnique({ where: { id }, include: { project: { select: { clientId: true, currency: true, name: true } } } });
      if (!current) throw AppException.notFound('Dépense');
      if (current.status === 'CANCELLED' || current.status === 'REJECTED') {
        throw AppException.conflict('EXPENSE_NOT_CORRECTABLE', 'Une dépense annulée ou refusée ne peut pas être corrigée.');
      }
      if (current.total.equals(newTotal)) {
        throw AppException.badRequest('NO_CHANGE', 'Le nouveau montant est identique au montant actuel.');
      }
      if (!isWithinMoneyRange(newTotal)) {
        throw AppException.badRequest('AMOUNT_OUT_OF_RANGE', 'Le montant est trop élevé.');
      }

      // La ligne doit rester coherente (total = quantite x prix unitaire) : on ajuste le prix unitaire.
      const adjustedUnitPrice = current.quantity.greaterThan(0) ? roundMoney(newTotal.div(current.quantity)) : current.unitPrice;
      const payment = this.reconcilePayment(current.paymentStatus, current.amountPaidToSupplier, newTotal);

      await tx.expense.update({
        where: { id },
        data: { total: newTotal, unitPrice: adjustedUnitPrice, paymentStatus: payment.paymentStatus, amountPaidToSupplier: payment.amountPaidToSupplier },
      });

      await tx.financialCorrection.create({
        data: { entityType: 'Expense', entityId: id, oldValue: current.total, newValue: newTotal, reason, correctedById: actor.userId },
      });

      if (current.status === 'APPROVED') {
        await this.wallets.recompute(current.projectId, tx);
      }

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'ADMIN_CORRECTION',
          entityType: 'Expense',
          entityId: id,
          oldValue: { total: current.total.toString(), unitPrice: current.unitPrice.toString() },
          newValue: { total: newTotal.toString(), unitPrice: adjustedUnitPrice.toString() },
          reason,
        },
        tx,
      );
      return { expense: current, oldTotal: current.total, projectInfo: current.project };
    });

    await this.afterCommit(async () => {
      const client = await this.prisma.clientProfile.findUnique({ where: { id: projectInfo.clientId }, select: { userId: true, firstName: true } });
      if (!client) return;
      await this.notifications.send({
        userId: client.userId,
        type: 'ADMIN_CORRECTION',
        title: 'Correction administrative sur une dépense',
        message: `Le montant d'une dépense a été corrigé de ${formatMoney(oldTotal, projectInfo.currency)} à ${formatMoney(newTotal, projectInfo.currency)}.`,
        emailHtml: emailTemplates.adminCorrection(
          client.firstName,
          'Expense',
          formatMoney(oldTotal, projectInfo.currency),
          formatMoney(newTotal, projectInfo.currency),
          reason,
          this.projectUrl(expense.projectId),
        ),
        emailSubject: 'Correction administrative',
      });
    });

    return this.getRaw(id);
  }

  async updatePaymentStatus(id: string, dto: UpdateExpensePaymentDto, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw AppException.notFound('Dépense');
      if (actor.role === 'SUPERVISOR' && (!actor.supervisorProfileId || expense.supervisorId !== actor.supervisorProfileId)) {
        throw AppException.forbiddenProjectAccess();
      }

      const { paymentStatus, amountPaidToSupplier } = this.resolvePaymentFields(dto.paymentStatus, expense.total, dto.amountPaidToSupplier);

      await tx.expense.update({ where: { id }, data: { paymentStatus, amountPaidToSupplier } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Expense',
          entityId: id,
          oldValue: { paymentStatus: expense.paymentStatus, amountPaidToSupplier: expense.amountPaidToSupplier.toString() },
          newValue: { paymentStatus, amountPaidToSupplier: amountPaidToSupplier.toString() },
        },
        tx,
      );
    });

    return this.getRaw(id);
  }

  /**
   * Edition libre multi-champs (superadmin). Si quantity et/ou unitPrice
   * changent, le total est recalcule et passe par le circuit de
   * FinancialCorrection (comme correctAmount), pour garder une trace exacte
   * de l'ancien/nouveau montant meme quand la modification vient de la
   * quantite ou du prix unitaire plutot que du total directement.
   */
  async update(id: string, dto: UpdateExpenseDto, actor: AuthenticatedUser) {
    const { existing, changedFieldLabels } = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.expense.findUnique({ where: { id } });
      if (!current) throw AppException.notFound('Dépense');

      const totalChanges = dto.quantity !== undefined || dto.unitPrice !== undefined;
      if (totalChanges && (current.status === 'CANCELLED' || current.status === 'REJECTED')) {
        throw AppException.conflict('EXPENSE_NOT_CORRECTABLE', 'Le montant d\'une dépense annulée ou refusée ne peut pas être modifié.');
      }

      // Categorie / materiau modifies : ils doivent exister, etre actifs et rester coherents entre eux.
      if (dto.categoryId !== undefined || dto.materialId !== undefined) {
        const owner = await tx.project.findUniqueOrThrow({ where: { id: current.projectId }, select: { clientId: true } });
        await this.assertCategoryAndMaterial(
          owner.clientId,
          dto.categoryId ?? current.categoryId,
          dto.materialId ?? current.materialId ?? undefined,
          tx,
        );
      }

      let allocation: { phaseId: string | null; supplierId: string | null } | undefined;
      if (dto.phaseId !== undefined || dto.supplierId !== undefined) {
        const owner = await tx.project.findUniqueOrThrow({ where: { id: current.projectId }, select: { id: true, clientId: true } });
        allocation = await this.resolveAllocation(tx, owner, {
          phaseId: dto.phaseId === undefined ? current.phaseId : dto.phaseId,
          supplierId: dto.supplierId === undefined ? current.supplierId : dto.supplierId,
          contractId: current.contractId,
        });
      }

      const nextQuantity = dto.quantity !== undefined ? toDecimal(dto.quantity) : current.quantity;
      const nextUnitPrice = dto.unitPrice !== undefined ? roundMoney(dto.unitPrice) : current.unitPrice;
      const newTotal = totalChanges ? this.computeTotal(nextQuantity, nextUnitPrice) : current.total;

      // Statut de paiement fournisseur : coherent avec le (nouveau) total. Avant, paymentStatus/amountPaidToSupplier
      // etaient acceptes par l'API mais silencieusement ignores, et un changement de total laissait un "reste a payer" faux.
      const payment =
        dto.paymentStatus !== undefined
          ? this.resolvePaymentFields(dto.paymentStatus, newTotal, dto.amountPaidToSupplier)
          : this.reconcilePayment(current.paymentStatus, current.amountPaidToSupplier, newTotal);
      const paymentChanged = payment.paymentStatus !== current.paymentStatus || !payment.amountPaidToSupplier.equals(current.amountPaidToSupplier);

      const labels: string[] = [];
      if (totalChanges) labels.push('Quantité/Prix unitaire (total recalculé)');
      if (dto.date !== undefined) labels.push('Date');
      if (dto.categoryId !== undefined) labels.push('Catégorie');
      if (dto.materialId !== undefined) labels.push('Matériau');
      if (dto.label !== undefined) labels.push('Libellé');
      if (dto.unit !== undefined) labels.push('Unité');
      if (dto.observation !== undefined) labels.push('Observation');
      if (dto.supplier !== undefined) labels.push('Fournisseur');
      if (dto.invoiceReference !== undefined) labels.push('Référence facture');
      if (dto.phaseId !== undefined) labels.push('Étape');
      if (dto.supplierId !== undefined) labels.push('Fournisseur (annuaire)');
      if (dto.paymentStatus !== undefined || dto.amountPaidToSupplier !== undefined) labels.push('Paiement fournisseur');

      await tx.expense.update({
        where: { id },
        data: {
          date: dto.date ? new Date(dto.date) : undefined,
          categoryId: dto.categoryId,
          materialId: dto.materialId,
          label: dto.label,
          quantity: dto.quantity,
          unit: dto.unit,
          unitPrice: dto.unitPrice !== undefined ? nextUnitPrice : undefined,
          total: totalChanges ? newTotal : undefined,
          observation: dto.observation,
          supplier: dto.supplier,
          invoiceReference: dto.invoiceReference,
          phaseId: allocation ? allocation.phaseId : undefined,
          supplierId: allocation ? allocation.supplierId : undefined,
          paymentStatus: paymentChanged ? payment.paymentStatus : undefined,
          amountPaidToSupplier: paymentChanged ? payment.amountPaidToSupplier : undefined,
        },
      });

      if (totalChanges && !newTotal.equals(current.total)) {
        await tx.financialCorrection.create({
          data: {
            entityType: 'Expense',
            entityId: id,
            oldValue: current.total,
            newValue: newTotal,
            reason: 'Modification administrative (édition multi-champs)',
            correctedById: actor.userId,
          },
        });
        if (current.status === 'APPROVED') await this.wallets.recompute(current.projectId, tx);
      }

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Expense', entityId: id, oldValue: current, newValue: dto },
        tx,
      );
      return { existing: current, changedFieldLabels: labels };
    });

    if (changedFieldLabels.length > 0) {
      await this.afterCommit(async () => {
        const project = await this.prisma.project.findUnique({ where: { id: existing.projectId }, select: { clientId: true } });
        const client = project ? await this.prisma.clientProfile.findUnique({ where: { id: project.clientId }, select: { userId: true, firstName: true } }) : null;
        if (!client) return;
        await this.notifications.send({
          userId: client.userId,
          type: 'ADMIN_CORRECTION',
          title: 'Modification administrative sur une dépense',
          message: `Champs modifiés : ${changedFieldLabels.join(', ')}.`,
          emailHtml: emailTemplates.adminFieldUpdate(client.firstName, 'Expense', changedFieldLabels.join(', '), this.projectUrl(existing.projectId)),
          emailSubject: 'Modification administrative',
        });
      });
    }

    return this.getRaw(id);
  }

  /** Suppression logique (superadmin) : jamais de suppression physique - reutilise le circuit de cancel(). */
  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.expense.findUnique({ where: { id }, include: { project: { select: { clientId: true, currency: true } } } });
      if (!current) throw AppException.notFound('Dépense');
      if (current.status === 'CANCELLED') {
        throw AppException.conflict('EXPENSE_ALREADY_CANCELLED', 'Cette dépense est déjà annulée.');
      }

      await tx.expense.update({ where: { id }, data: { status: 'CANCELLED', rejectionReason: reason } });
      if (current.status === 'APPROVED') await this.wallets.recompute(current.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Expense',
          entityId: id,
          oldValue: { status: current.status },
          newValue: { status: 'CANCELLED' },
          reason,
        },
        tx,
      );
      return current;
    });

    await this.afterCommit(async () => {
      const client = await this.prisma.clientProfile.findUnique({ where: { id: existing.project.clientId }, select: { userId: true } });
      if (!client) return;
      await this.notifications.send({
        userId: client.userId,
        type: 'ADMIN_CORRECTION',
        title: 'Dépense supprimée',
        message: `Une dépense "${existing.label}" de ${formatMoney(existing.total, existing.project.currency)} a été supprimée par le superadministrateur : ${reason}`,
      });
    });

    return this.getRaw(id);
  }

  async setArchived(id: string, archived: boolean, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Dépense');

      await tx.expense.update({ where: { id }, data: { isArchived: archived, archivedAt: archived ? new Date() : null } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Expense',
          entityId: id,
          oldValue: { isArchived: existing.isArchived },
          newValue: { isArchived: archived },
        },
        tx,
      );
    });

    return this.getRaw(id);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** total = quantite x prix unitaire, arrondi a 2 decimales (comme Decimal(18,2)) et verifie contre le plafond de la colonne. */
  private computeTotal(quantity: Prisma.Decimal | number | string, unitPrice: Prisma.Decimal | number | string): Prisma.Decimal {
    const total = roundMoney(multiply(quantity, unitPrice));
    if (!isWithinMoneyRange(total)) {
      throw AppException.badRequest('AMOUNT_OUT_OF_RANGE', 'Le total de la dépense est trop élevé.');
    }
    return total;
  }

  /**
   * La categorie doit exister, etre active et appartenir au catalogue du client du projet (globale ou privee de CE client) ;
   * le materiau (s'il y en a un) doit en faire autant et appartenir a cette categorie.
   */
  private async assertCategoryAndMaterial(
    projectClientId: string,
    categoryId: string,
    materialId?: string,
    client: TxClient | PrismaService = this.prisma,
  ) {
    const category = await client.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive || !isCatalogueEntryUsableBy(category.ownerClientId, projectClientId)) {
      throw AppException.badRequest('INVALID_CATEGORY', "Cette catégorie n'existe pas ou n'est plus active.");
    }
    if (materialId) {
      const material = await client.material.findUnique({ where: { id: materialId } });
      if (!material || !material.isActive || !isCatalogueEntryUsableBy(material.ownerClientId, projectClientId)) {
        throw AppException.badRequest('INVALID_MATERIAL', "Ce matériau n'existe pas ou n'est plus actif.");
      }
      if (material.categoryId !== categoryId) {
        throw AppException.badRequest('MATERIAL_CATEGORY_MISMATCH', 'Ce matériau n\'appartient pas à la catégorie choisie.');
      }
    }
    return category;
  }

  private resolvePaymentFields(status: ExpensePaymentStatus, total: Prisma.Decimal, providedAmountPaid?: number) {
    if (status === 'PAID_FULL') return { paymentStatus: status, amountPaidToSupplier: total };
    if (status === 'CREDIT') return { paymentStatus: status, amountPaidToSupplier: toDecimal(0) };

    const amount = roundMoney(providedAmountPaid ?? 0);
    if (!isGreaterThan(amount, 0) || !isGreaterThan(total, amount)) {
      throw AppException.badRequest(
        'INVALID_PARTIAL_PAYMENT',
        'Pour un paiement partiel, le montant versé doit être supérieur à 0 et inférieur au total de la dépense.',
      );
    }
    return { paymentStatus: status, amountPaidToSupplier: amount };
  }

  /**
   * Garde le suivi fournisseur coherent quand le total change :
   *  - integralement paye -> le montant paye suit le nouveau total ;
   *  - a credit -> reste 0 ;
   *  - partiel -> conserve le montant verse tant qu'il reste inferieur au total, sinon la depense est consideree payee.
   */
  private reconcilePayment(status: ExpensePaymentStatus, amountPaid: Prisma.Decimal, newTotal: Prisma.Decimal) {
    if (status === 'PAID_FULL') return { paymentStatus: status, amountPaidToSupplier: newTotal };
    if (status === 'CREDIT') return { paymentStatus: status, amountPaidToSupplier: toDecimal(0) };
    if (amountPaid.greaterThanOrEqualTo(newTotal)) return { paymentStatus: 'PAID_FULL' as ExpensePaymentStatus, amountPaidToSupplier: newTotal };
    return { paymentStatus: status, amountPaidToSupplier: amountPaid };
  }

  private withComputedBalanceDue<T extends { total: Prisma.Decimal; amountPaidToSupplier: Prisma.Decimal }>(expense: T) {
    return { ...expense, balanceDueToSupplier: subtract(expense.total, expense.amountPaidToSupplier) };
  }

  /** Reste a payer + etat du justificatif (obligatoire au-dessus d'un montant, joint ou non). */
  private decorate<T extends { total: Prisma.Decimal; amountPaidToSupplier: Prisma.Decimal; attachments: { kind: string }[]; project: { receiptRequiredAbove: Prisma.Decimal | null } }>(expense: T) {
    const receiptRequired = expense.project.receiptRequiredAbove != null && isGreaterThan(expense.total, expense.project.receiptRequiredAbove);
    const hasReceipt = expense.attachments.some((a) => RECEIPT_KINDS.includes(a.kind));
    return { ...this.withComputedBalanceDue(expense), receiptRequired, hasReceipt };
  }

  /** Vrai si une alerte du meme type/projet/cible a deja ete envoyee dans les dernieres 24 h. */
  private async alertRecentlySent(userId: string, type: 'LOW_BALANCE_ALERT' | 'BUDGET_EXCEEDED_ALERT', projectId: string, categoryId?: string) {
    const filters: Prisma.NotificationWhereInput[] = [{ meta: { path: ['projectId'], equals: projectId } }];
    if (categoryId) filters.push({ meta: { path: ['categoryId'], equals: categoryId } });
    const found = await this.prisma.notification.findFirst({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) }, AND: filters },
      select: { id: true },
    });
    return !!found;
  }

  private async runPostApprovalAlerts(projectId: string, categoryId: string, expenseTotal: Prisma.Decimal, currency: string) {
    try {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return;
      const client = await this.prisma.clientProfile.findUnique({ where: { id: project.clientId }, select: { userId: true, firstName: true } });
      if (!client) return;
      const wallet = await this.wallets.getWallet(projectId);
      const budget = toDecimal(project.budget);
      const alerts: SendNotificationInput[] = [];

      if (budget.greaterThan(0)) {
        // Une seule alerte "solde faible" par jour et par projet (avant : une alerte + un email a CHAQUE depense).
        if (wallet.balance.div(budget).lessThan(0.1) && !(await this.alertRecentlySent(client.userId, 'LOW_BALANCE_ALERT', projectId))) {
          alerts.push({
            userId: client.userId,
            type: 'LOW_BALANCE_ALERT',
            title: 'Alerte : solde faible',
            message: `Le solde disponible du projet "${project.name}" est descendu à ${formatMoney(wallet.balance, currency)}.`,
            emailHtml: emailTemplates.lowBalanceAlert(client.firstName, project.name, formatMoney(wallet.balance, currency), this.projectUrl(projectId)),
            emailSubject: 'Alerte : solde faible',
            meta: { projectId },
          });
        }

        if (expenseTotal.div(budget).greaterThan(0.05)) {
          alerts.push({
            userId: client.userId,
            type: 'LARGE_EXPENSE_ALERT',
            title: 'Alerte : dépense importante',
            message: `Une dépense de ${formatMoney(expenseTotal, currency)} dépasse 5% du budget du projet "${project.name}".`,
            meta: { projectId },
          });
        }
      }

      if ((await this.budgets.isCategoryOverBudget(projectId, categoryId)) && !(await this.alertRecentlySent(client.userId, 'BUDGET_EXCEEDED_ALERT', projectId, categoryId))) {
        const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
        if (category) {
          alerts.push({
            userId: client.userId,
            type: 'BUDGET_EXCEEDED_ALERT',
            title: 'Alerte : dépassement de budget',
            message: `La catégorie "${category.name}" du projet "${project.name}" dépasse le budget prévisionnel.`,
            emailHtml: emailTemplates.budgetExceededAlert(client.firstName, project.name, category.name, this.projectUrl(projectId, '/budgets')),
            emailSubject: 'Alerte : dépassement de budget',
            meta: { projectId, categoryId },
          });
        }
      }

      await this.notifications.sendMany(alerts);
    } catch (err) {
      this.logger.error(`Echec du calcul des alertes pour le projet ${projectId}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
