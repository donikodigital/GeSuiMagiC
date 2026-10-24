//backend/src/contracts/contracts.service.ts
import { Injectable } from '@nestjs/common';
import { ContractPaymentType, Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { formatMoney, isGreaterThan, roundMoney } from '../common/utils/money.util';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, DECISION_MAKERS, FIELD_WRITERS, getSiteRole, OWNERS } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { checkPayment, computeStatement, summarizeContract } from './contracts.calc';
import { CancelContractDto, CreateContractDto, DecideStatementDto, RecordContractPaymentDto, SubmitStatementDto, UpdateContractDto } from './dto/contract.dto';

const PAYMENT_LABEL: Record<ContractPaymentType, string> = {
  ADVANCE: 'Acompte',
  STATEMENT: 'Situation de travaux',
  RETENTION_RELEASE: 'Déblocage de retenue de garantie',
  OTHER: 'Paiement',
};

const contractInclude = {
  supplier: { select: { id: true, name: true, trade: true, phone: true } },
  phase: { select: { name: true } },
  statements: { orderBy: { number: 'asc' as const } },
  payments: { orderBy: { date: 'asc' as const }, include: { expense: { select: { status: true } } } },
} satisfies Prisma.ContractInclude;

type ContractFull = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

/**
 * Marches de sous-traitance : montant convenu, retenue de garantie, situations de travaux validees puis payees.
 * Chaque paiement cree une DEPENSE (donc soumise aux memes regles : seuils, justificatif, validation technique) :
 * le solde du projet reste la seule source de verite de l'argent.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly expenses: ExpensesService,
    private readonly attachments: AttachmentsService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private summaryOf(contract: ContractFull) {
    return summarizeContract(
      contract.amount,
      contract.statements,
      contract.payments.map((p) => ({ type: p.type, amount: p.amount, statementId: p.statementId, expenseStatus: p.expense?.status ?? null })),
    );
  }

  private async present(contract: ContractFull) {
    const { phase, supplier, statements, payments, ...rest } = contract;
    const names = await loadUserNames(this.prisma, [...statements.flatMap((s) => [s.submittedById, s.decidedById]), ...payments.map((p) => p.recordedById)]);
    const [statementFiles, paymentFiles] = await Promise.all([
      this.attachments.listForEntities('ProgressStatement', statements.map((s) => s.id)),
      this.attachments.listForEntities('ContractPayment', payments.map((p) => p.id)),
    ]);
    return {
      ...rest,
      signedAt: contract.signedAt ? toIsoDate(contract.signedAt) : null,
      phaseName: phase?.name ?? null,
      supplier,
      summary: this.summaryOf(contract),
      statements: statements.map((s) => ({
        ...s,
        periodEnd: toIsoDate(s.periodEnd),
        submittedByName: names.get(s.submittedById) ?? null,
        decidedByName: s.decidedById ? (names.get(s.decidedById) ?? null) : null,
        paid: roundMoney(payments.filter((p) => p.statementId === s.id && p.expense?.status !== 'REJECTED' && p.expense?.status !== 'CANCELLED').reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0))),
        attachments: statementFiles.get(s.id) ?? [],
      })),
      payments: payments.map(({ expense, ...p }) => ({
        ...p,
        date: toIsoDate(p.date),
        expenseStatus: expense?.status ?? null,
        recordedByName: names.get(p.recordedById) ?? null,
        attachments: paymentFiles.get(p.id) ?? [],
      })),
    };
  }

  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const contracts = await this.prisma.contract.findMany({ where: { projectId }, orderBy: { number: 'desc' }, include: contractInclude });
    return contracts.map((contract) => {
      const { statements, payments, phase, ...rest } = contract;
      return { ...rest, phaseName: phase?.name ?? null, summary: this.summaryOf(contract), statementCount: statements.length, paymentCount: payments.length };
    });
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const contract = await this.prisma.contract.findFirst({ where: { id, projectId }, include: contractInclude });
    if (!contract) throw AppException.notFound('Marché');
    return this.present(contract);
  }

  /** Cree un marche. Utilise aussi par l'attribution d'un lot de devis. */
  async createInTx(
    tx: TxClient,
    projectId: string,
    clientId: string,
    input: { supplierId: string; title: string; description?: string; amount: number | Prisma.Decimal; retentionPercent?: number; phaseId?: string | null; signedAt?: Date | null; quoteId?: string },
    actor: AuthenticatedUser,
  ) {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, ownerClientId: clientId }, select: { id: true, isActive: true } });
    if (!supplier || !supplier.isActive) throw AppException.badRequest('INVALID_SUPPLIER', "Ce fournisseur n'existe pas ou n'est plus actif.");
    if (input.phaseId) {
      const phase = await tx.projectPhase.findFirst({ where: { id: input.phaseId, projectId }, select: { id: true } });
      if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
    }
    const number = await nextProjectNumber(tx, 'contract', projectId);
    const created = await tx.contract.create({
      data: {
        projectId,
        number,
        supplierId: input.supplierId,
        phaseId: input.phaseId ?? undefined,
        quoteId: input.quoteId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        amount: roundMoney(input.amount),
        retentionPercent: input.retentionPercent ?? 5,
        signedAt: input.signedAt ?? undefined,
        createdById: actor.userId,
      },
    });
    await this.audit.log(
      { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Contract', entityId: created.id, newValue: { projectId, number, supplierId: input.supplierId, amount: created.amount.toString() } },
      tx,
    );
    return created;
  }

  async create(projectId: string, dto: CreateContractDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seuls le client et le superadministrateur signent un marché.');

    const signedAt = dto.signedAt ? parseIsoDate(dto.signedAt) : null;
    if (dto.signedAt && !signedAt) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');

    const created = await this.prisma.runInTransaction((tx) =>
      this.createInTx(tx, projectId, project.clientId, { supplierId: dto.supplierId, title: dto.title, description: dto.description, amount: dto.amount, retentionPercent: dto.retentionPercent, phaseId: dto.phaseId, signedAt }, actor),
    );
    return this.findOne(projectId, created.id);
  }

  async update(projectId: string, id: string, dto: UpdateContractDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seuls le client et le superadministrateur modifient un marché.');

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.contract.findFirst({ where: { id, projectId }, include: { statements: { select: { cumulativeAmount: true } } } });
      if (!current) throw AppException.notFound('Marché');
      if (current.status !== 'ACTIVE') throw AppException.conflict('CONTRACT_NOT_ACTIVE', 'Seul un marché en cours peut être modifié.');

      // Le pourcentage de retenue ne change plus une fois des situations calculees ; le montant ne descend jamais sous les travaux declares.
      if (dto.retentionPercent !== undefined && current.statements.length > 0 && !current.retentionPercent.equals(dto.retentionPercent)) {
        throw AppException.conflict('RETENTION_LOCKED', 'La retenue ne peut plus changer : des situations ont déjà été calculées.');
      }
      if (dto.amount !== undefined) {
        const declared = current.statements.reduce((max, s) => (s.cumulativeAmount.greaterThan(max) ? s.cumulativeAmount : max), new Prisma.Decimal(0));
        if (roundMoney(dto.amount).lessThan(declared)) {
          throw AppException.badRequest('AMOUNT_BELOW_WORKS', `Le montant ne peut pas être inférieur aux travaux déjà déclarés (${formatMoney(declared)}).`);
        }
      }
      let signedAt: Date | null | undefined;
      if (dto.signedAt !== undefined) {
        signedAt = dto.signedAt === null ? null : parseIsoDate(dto.signedAt);
        if (dto.signedAt !== null && !signedAt) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
      }
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      await tx.contract.update({
        where: { id },
        data: { title: dto.title?.trim(), description: dto.description?.trim(), amount: dto.amount !== undefined ? roundMoney(dto.amount) : undefined, retentionPercent: dto.retentionPercent, phaseId: dto.phaseId, signedAt },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Contract', entityId: id, oldValue: { amount: current.amount.toString(), title: current.title }, newValue: dto },
        tx,
      );
    });
    return this.findOne(projectId, id);
  }

  /** Cloture du marche : plus de situation, la retenue de garantie peut etre debloquee. */
  async complete(projectId: string, id: string, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seuls le client et le superadministrateur terminent un marché.');

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.contract.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Marché');
      if (current.status !== 'ACTIVE') throw AppException.conflict('CONTRACT_NOT_ACTIVE', 'Ce marché est déjà clos.');
      const pending = await tx.progressStatement.count({ where: { contractId: id, status: 'SUBMITTED' } });
      if (pending > 0) throw AppException.conflict('STATEMENT_PENDING', 'Une situation de travaux attend encore une décision.');

      await tx.contract.update({ where: { id }, data: { status: 'COMPLETED' } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Contract', entityId: id, oldValue: { status: 'ACTIVE' }, newValue: { status: 'COMPLETED' } }, tx);
    });
    return this.findOne(projectId, id);
  }

  async cancel(projectId: string, id: string, dto: CancelContractDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seuls le client et le superadministrateur annulent un marché.');

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.contract.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Marché');
      if (current.status === 'CANCELLED') throw AppException.conflict('CONTRACT_CANCELLED', 'Ce marché est déjà annulé.');
      const paid = await tx.contractPayment.count({ where: { contractId: id, expense: { status: { in: ['APPROVED', 'PENDING'] } } } });
      if (paid > 0) throw AppException.conflict('CONTRACT_HAS_PAYMENTS', "Des paiements ont déjà été enregistrés : ce marché ne peut plus être annulé (clôturez-le).");

      await tx.contract.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CANCEL', entityType: 'Contract', entityId: id, oldValue: { status: current.status }, newValue: { status: 'CANCELLED' }, reason: dto.reason }, tx);
    });
    return this.findOne(projectId, id);
  }

  // -------------------------------------------------------------------------
  // Situations de travaux
  // -------------------------------------------------------------------------
  async submitStatement(projectId: string, contractId: string, dto: SubmitStatementDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, 'Seuls le superviseur et le conducteur de travaux déclarent une situation.');

    const periodEnd = parseIsoDate(dto.periodEnd);
    if (!periodEnd) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    if (periodEnd.getTime() > startOfUtcDay().getTime()) throw AppException.badRequest('FUTURE_DATE', 'La fin de période ne peut pas être dans le futur.');

    const { statement, contract } = await this.prisma.runInTransaction(async (tx) => {
      const found = await tx.contract.findFirst({ where: { id: contractId, projectId }, include: { statements: { orderBy: { number: 'asc' } }, payments: { include: { expense: { select: { status: true } } } } } });
      if (!found) throw AppException.notFound('Marché');
      if (found.status !== 'ACTIVE') throw AppException.conflict('CONTRACT_NOT_ACTIVE', 'Ce marché est clos : aucune nouvelle situation.');
      if (found.statements.some((s) => s.status === 'SUBMITTED')) {
        throw AppException.conflict('STATEMENT_PENDING', 'Une situation attend déjà une décision.');
      }

      const lastKept = [...found.statements].reverse().find((s) => s.status === 'VALIDATED');
      const previousCumulative = lastKept?.cumulativeAmount ?? new Prisma.Decimal(0);
      const cumulative = roundMoney(dto.cumulativeAmount);
      if (!cumulative.greaterThan(previousCumulative)) {
        throw AppException.badRequest('CUMULATIVE_NOT_INCREASING', `Le cumul doit dépasser celui de la dernière situation validée (${formatMoney(previousCumulative)}).`);
      }
      if (isGreaterThan(cumulative, found.amount)) {
        throw AppException.badRequest('EXCEEDS_CONTRACT', `Le cumul dépasse le montant du marché (${formatMoney(found.amount)}) : demandez un avenant.`);
      }

      const summary = summarizeContract(found.amount, found.statements, found.payments.map((p) => ({ type: p.type, amount: p.amount, statementId: p.statementId, expenseStatus: p.expense?.status ?? null })));
      const advanceRecovered = roundMoney(dto.advanceRecovered ?? 0);
      if (advanceRecovered.greaterThan(summary.advanceOutstanding)) {
        throw AppException.badRequest('ADVANCE_RECOVERY_TOO_HIGH', `La récupération d'acompte dépasse l'acompte restant à récupérer (${formatMoney(summary.advanceOutstanding)}).`);
      }

      const computed = computeStatement({ retentionPercent: found.retentionPercent, previousCumulative, cumulativeAmount: cumulative, advanceRecovered });
      if (computed.netPayable.lessThan(0)) {
        throw AppException.badRequest('NEGATIVE_NET', 'La récupération d\'acompte dépasse le montant net de la période.');
      }

      const number = ((await tx.progressStatement.aggregate({ where: { contractId }, _max: { number: true } }))._max.number ?? 0) + 1;
      const row = await tx.progressStatement.create({
        data: {
          contractId,
          projectId,
          number,
          periodEnd,
          cumulativeAmount: cumulative,
          amountThisPeriod: computed.amountThisPeriod,
          retentionAmount: computed.retentionAmount,
          advanceRecovered: computed.advanceRecovered,
          netPayable: computed.netPayable,
          note: dto.note?.trim() || null,
          submittedById: actor.userId,
        },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProgressStatement', entityId: row.id, newValue: { contractId, number, cumulative: cumulative.toString(), net: computed.netPayable.toString() } },
        tx,
      );
      return { statement: row, contract: found };
    });

    const message = `Situation n°${statement.number} du marché « ${contract.title} » : net à payer ${formatMoney(statement.netPayable, project.currency)}.`;
    await this.notifier.toReviewers(projectId, { type: 'STATEMENT_SUBMITTED', title: 'Situation de travaux à valider', message, path: '/subcontracting', meta: { contractId, statementId: statement.id } }, actor.userId);
    await this.notifier.toClient(project, { type: 'STATEMENT_SUBMITTED', title: 'Situation de travaux déclarée', message, path: '/subcontracting', meta: { contractId, statementId: statement.id } });
    return this.findOne(projectId, contractId);
  }

  async decideStatement(projectId: string, contractId: string, statementId: string, dto: DecideStatementDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, DECISION_MAKERS, 'Votre fonction ne permet pas de valider une situation.');
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif du refus.');

    const statement = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.progressStatement.findFirst({ where: { id: statementId, contractId, projectId } });
      if (!current) throw AppException.notFound('Situation');
      if (current.status !== 'SUBMITTED') throw AppException.conflict('STATEMENT_ALREADY_DECIDED', 'Cette situation a déjà été traitée.');
      if (current.submittedById === actor.userId && role !== 'CLIENT' && role !== 'SUPERADMIN') {
        throw AppException.forbidden('SELF_REVIEW', 'Vous ne pouvez pas valider votre propre situation.');
      }
      const done = await tx.progressStatement.updateMany({
        where: { id: statementId, status: 'SUBMITTED' },
        data: { status: dto.decision, decidedById: actor.userId, decidedAt: new Date(), decisionNote: dto.note?.trim() || null },
      });
      if (done.count !== 1) throw AppException.conflict('STATEMENT_ALREADY_DECIDED', 'Cette situation a déjà été traitée.');
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: dto.decision === 'VALIDATED' ? 'APPROVE' : 'REJECT', entityType: 'ProgressStatement', entityId: statementId, oldValue: { status: 'SUBMITTED' }, newValue: { status: dto.decision }, reason: dto.note },
        tx,
      );
      return current;
    });

    const verdict = dto.decision === 'VALIDATED' ? 'validée' : 'refusée';
    await this.notifier.toUser(statement.submittedById, projectId, {
      type: 'STATEMENT_DECIDED',
      title: `Situation ${verdict}`,
      message: `La situation n°${statement.number} a été ${verdict}${dto.note ? ` : ${dto.note}` : '.'}`,
      path: '/subcontracting',
      meta: { contractId, statementId },
    });
    return this.findOne(projectId, contractId);
  }

  // -------------------------------------------------------------------------
  // Paiements (chaque paiement = une depense)
  // -------------------------------------------------------------------------
  async recordPayment(projectId: string, contractId: string, dto: RecordContractPaymentDto, actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERVISOR' || !actor.supervisorProfileId) {
      throw AppException.forbidden('ROLE_NOT_ALLOWED', 'Seul un superviseur enregistre les paiements (ils sont comptabilisés comme dépenses).');
    }
    const supervisorId = actor.supervisorProfileId;
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppException.notFound('Projet');
    assertProjectOpenFor(actor, project.status);

    const date = dto.date ? new Date(dto.date) : new Date();

    // Rejeu d'une saisie hors ligne.
    if (dto.clientRef) {
      const already = await this.prisma.expense.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.findOne(projectId, contractId);
    }

    const created = await this.prisma.runInTransaction(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: contractId, projectId },
        include: { supplier: { select: { name: true } }, statements: true, payments: { include: { expense: { select: { status: true } } } } },
      });
      if (!contract) throw AppException.notFound('Marché');

      const summary = summarizeContract(contract.amount, contract.statements, contract.payments.map((p) => ({ type: p.type, amount: p.amount, statementId: p.statementId, expenseStatus: p.expense?.status ?? null })));
      let statement: { status: 'SUBMITTED' | 'VALIDATED' | 'REJECTED'; netPayable: Prisma.Decimal; alreadyPaid: Prisma.Decimal } | null = null;
      if (dto.statementId) {
        const target = contract.statements.find((s) => s.id === dto.statementId);
        if (!target) throw AppException.badRequest('INVALID_STATEMENT', "Cette situation n'appartient pas à ce marché.");
        const alreadyPaid = contract.payments
          .filter((p) => p.statementId === target.id && p.expense?.status !== 'REJECTED' && p.expense?.status !== 'CANCELLED')
          .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
        statement = { status: target.status, netPayable: target.netPayable, alreadyPaid };
      }
      const verdict = checkPayment({ type: dto.type, amount: dto.amount, contractStatus: contract.status, summary, statement });
      if (!verdict.ok) throw AppException.badRequest(verdict.code!, verdict.message!);

      const amount = roundMoney(dto.amount);
      const result = await this.expenses.createInTx(tx, project, actor, supervisorId, {
        date,
        categoryId: dto.categoryId,
        label: `${PAYMENT_LABEL[dto.type]} — ${contract.supplier.name} (${contract.title})`,
        quantity: 1,
        unit: 'forfait',
        unitPrice: amount,
        invoiceReference: dto.reference,
        observation: dto.note,
        supplierId: contract.supplierId,
        contractId,
        phaseId: contract.phaseId ?? undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        clientRef: dto.clientRef,
      });
      const payment = await tx.contractPayment.create({
        data: { contractId, projectId, statementId: dto.statementId, type: dto.type, amount, date, reference: dto.reference, note: dto.note?.trim() || null, expenseId: result.expense.id, recordedById: actor.userId },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ContractPayment', entityId: payment.id, newValue: { contractId, type: dto.type, amount: amount.toString(), expenseId: result.expense.id } },
        tx,
      );
      return result;
    });

    await this.expenses.afterCreate(project, created, actor);
    return this.findOne(projectId, contractId);
  }
}
