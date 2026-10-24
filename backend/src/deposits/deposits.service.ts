//backend/src/deposits/deposits.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { formatMoney, roundMoney } from '../common/utils/money.util';
import { buildDateRange } from '../common/utils/date-range.util';
import { assertProjectAcceptsFinancialOperations } from '../common/utils/project-status.util';
import { analyzeForeignDeposit, MAX_RATE_GAP_PERCENT, summarizeByCurrency } from './currency.calc';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositQueryDto } from './dto/deposit-query.dto';
import { UpdateDepositDto } from './dto/update-deposit.dto';

/**
 * Regles principales :
 *  - un depot est cree PENDING par le client, puis valide/refuse par le superviseur beneficiaire ;
 *  - le changement de statut est ATOMIQUE (mise a jour conditionnelle "WHERE status = PENDING") : deux
 *    decisions simultanees (valider + refuser) ne peuvent plus laisser le portefeuille incoherent ;
 *  - toute ecriture financiere + son audit + le recalcul du portefeuille partagent UNE transaction ;
 *  - les notifications (email...) partent APRES la transaction et ne la font jamais echouer.
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private projectUrl(projectId: string, suffix = ''): string {
    return `${this.config.get<string>('frontendUrl')}/projects/${projectId}${suffix}`;
  }

  /** Execute un effet de bord post-commit (lecture + notification) sans jamais faire echouer l'operation deja validee. */
  private async afterCommit(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      this.logger.error('Echec d\'une tache post-validation (notification)', err instanceof Error ? err.stack : String(err));
    }
  }

  async create(projectId: string, dto: CreateDepositDto, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppException.notFound('Projet');

    // Un projet suspendu / termine / archive n'accepte plus de nouveau depot.
    assertProjectAcceptsFinancialOperations(project.status);

    // La devise est verrouillee sur celle du projet : le portefeuille additionne les montants sans conversion.
    if (dto.currency && dto.currency !== project.currency) {
      throw AppException.badRequest('CURRENCY_MISMATCH', `La devise d'un depot doit etre celle du projet (${project.currency}).`);
    }

    const assignment = await this.prisma.projectSupervisor.findFirst({
      where: { projectId, supervisorId: dto.supervisorId, status: 'ACTIVE' },
      include: { supervisor: { select: { userId: true, firstName: true } } },
    });
    if (!assignment) {
      throw AppException.badRequest('SUPERVISOR_NOT_ASSIGNED', "Ce superviseur n'est pas affecté à ce projet.");
    }

    // L'architecte controle le chantier mais ne gere pas d'argent.
    const position = (assignment as { position?: string }).position;
    if (position === 'ARCHITECT') {
      throw AppException.badRequest('SUPERVISOR_NOT_ALLOWED', "L'architecte ne reçoit pas de dépôt : choisissez le superviseur ou le conducteur de travaux.");
    }

    const amount = roundMoney(dto.amount);
    const foreign = this.resolveForeignFields(dto, project.currency, amount);

    // Depot + audit dans la meme transaction (avant : deux ecritures independantes).
    const deposit = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.deposit.create({
        data: {
          projectId,
          clientId: project.clientId,
          supervisorId: dto.supervisorId,
          amount,
          currency: project.currency,
          date: dto.date ? new Date(dto.date) : new Date(),
          motif: dto.motif,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          observation: dto.observation,
          ...foreign.data,
          status: 'PENDING',
          createdById: actor.userId,
        },
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Deposit',
          entityId: created.id,
          newValue: {
            amount: amount.toString(),
            projectId,
            supervisorId: dto.supervisorId,
            status: 'PENDING',
            ...(foreign.analysis ? { originalAmount: dto.originalAmount, originalCurrency: dto.originalCurrency, exchangeRate: dto.exchangeRate, gapPercent: foreign.analysis.gapPercent } : {}),
          },
        },
        tx,
      );
      return created;
    });

    await this.afterCommit(() =>
      this.notifications.send({
        userId: assignment.supervisor.userId,
        type: 'DEPOSIT_CREATED',
        title: 'Nouveau dépôt à valider',
        message: `Un dépôt de ${formatMoney(amount, deposit.currency)} a été enregistré pour le projet.`,
        emailHtml: emailTemplates.depositCreated(
          assignment.supervisor.firstName,
          project.name,
          formatMoney(amount, deposit.currency),
          this.projectUrl(projectId, `/deposits/${deposit.id}`),
        ),
        emailSubject: 'Nouveau dépôt à valider',
      }),
    );

    return this.decorate(deposit);
  }

  /** Controle la coherence des champs de change (tout ou rien) et calcule l'analyse. */
  private resolveForeignFields(dto: CreateDepositDto, projectCurrency: string, amount: Prisma.Decimal) {
    const provided = [dto.originalAmount, dto.originalCurrency, dto.exchangeRate].filter((v) => v !== undefined);
    if (provided.length === 0) {
      if (dto.transferFees !== undefined) {
        throw AppException.badRequest('FOREIGN_FIELDS_INCOMPLETE', "Les frais de transfert vont avec le montant d'origine, sa devise et le taux.");
      }
      return { data: {}, analysis: null };
    }
    if (provided.length !== 3) {
      throw AppException.badRequest('FOREIGN_FIELDS_INCOMPLETE', "Pour un envoi de l'étranger, renseignez le montant envoyé, sa devise et le taux de change.");
    }
    if (dto.originalCurrency === projectCurrency) {
      throw AppException.badRequest('SAME_CURRENCY', 'La devise d\'origine est celle du projet : aucune conversion à enregistrer.');
    }
    const analysis = analyzeForeignDeposit({ amount, originalAmount: dto.originalAmount!, exchangeRate: dto.exchangeRate!, transferFees: dto.transferFees });
    if (Math.abs(analysis.gapPercent) > MAX_RATE_GAP_PERCENT) {
      throw AppException.badRequest(
        'AMOUNT_RATE_MISMATCH',
        `Le montant crédité (${formatMoney(amount, projectCurrency)}) s'écarte de ${Math.abs(analysis.gapPercent)} % du montant attendu (${formatMoney(analysis.expectedAmount, projectCurrency)} = montant envoyé × taux). Vérifiez le taux.`,
      );
    }
    return {
      data: {
        originalAmount: roundMoney(dto.originalAmount!),
        originalCurrency: dto.originalCurrency,
        exchangeRate: dto.exchangeRate,
        transferFees: dto.transferFees !== undefined ? roundMoney(dto.transferFees) : null,
      },
      analysis,
    };
  }

  /** Ajoute l'analyse du change (taux effectif frais compris, ecart) aux depots envoyes de l'etranger. */
  private decorate<T extends { amount: Prisma.Decimal; originalAmount: Prisma.Decimal | null; exchangeRate: Prisma.Decimal | null; transferFees: Prisma.Decimal | null }>(deposit: T) {
    if (!deposit.originalAmount || !deposit.exchangeRate) return { ...deposit, foreign: null };
    return {
      ...deposit,
      foreign: analyzeForeignDeposit({ amount: deposit.amount, originalAmount: deposit.originalAmount, exchangeRate: deposit.exchangeRate, transferFees: deposit.transferFees }),
    };
  }

  /** Total envoye, frais et taux moyen par devise d'origine (depots valides seulement). */
  async currencySummary(projectId: string, actor: AuthenticatedUser) {
    const where: Prisma.DepositWhereInput = { projectId, status: 'APPROVED', originalCurrency: { not: null } };
    if (actor.role === 'SUPERVISOR') {
      if (!actor.supervisorProfileId) throw AppException.forbiddenProjectAccess();
      where.supervisorId = actor.supervisorProfileId;
    }
    const rows = await this.prisma.deposit.findMany({
      where,
      select: { originalCurrency: true, originalAmount: true, exchangeRate: true, transferFees: true, amount: true },
    });
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { currency: true } });
    return { projectCurrency: project?.currency ?? null, currencies: summarizeByCurrency(rows) };
  }

  async findAllForProject(projectId: string, query: DepositQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Un superviseur ne voit QUE ses propres depots (comme findOne), pas ceux des autres superviseurs du projet.
    let supervisorId = query.supervisorId;
    if (actor.role === 'SUPERVISOR') {
      if (!actor.supervisorProfileId) throw AppException.forbiddenProjectAccess();
      supervisorId = actor.supervisorProfileId;
    }

    const where: Prisma.DepositWhereInput = {
      projectId,
      status: query.status,
      supervisorId,
      isArchived: query.includeArchived ? undefined : false,
      date: buildDateRange(query.from, query.to),
      ...(query.search
        ? { OR: [{ motif: { contains: query.search, mode: 'insensitive' } }, { reference: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        include: { supervisor: { select: { firstName: true, lastName: true } }, attachments: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deposit.count({ where }),
    ]);

    return { items: items.map((d) => this.decorate(d)), meta: buildPaginationMeta(page, limit, total) };
  }

  /**
   * Lecture detaillee. Seuls prenom/nom des profils lies sont renvoyes : avant, le profil COMPLET du
   * superviseur (piece d'identite, notes...) et du client (telephone, identifiant fiscal...) etait expose.
   */
  private async getRaw(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: {
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, currency: true } },
        attachments: true,
      },
    });
    if (!deposit) throw AppException.notFound('Dépôt');
    return this.decorate(deposit);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const deposit = await this.getRaw(id);
    if (actor.role === 'SUPERADMIN') return deposit;
    if (actor.role === 'CLIENT' && actor.clientProfileId && deposit.clientId === actor.clientProfileId) return deposit;
    if (actor.role === 'SUPERVISOR' && actor.supervisorProfileId && deposit.supervisorId === actor.supervisorProfileId) return deposit;
    throw AppException.forbiddenProjectAccess();
  }

  /** Charge le depot et verifie que l'acteur est son superviseur beneficiaire, toujours affecte au projet. */
  private async loadForSupervisorDecision(id: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUnique({ where: { id } });
    if (!deposit) throw AppException.notFound('Dépôt');

    if (actor.role !== 'SUPERVISOR' || !actor.supervisorProfileId || actor.supervisorProfileId !== deposit.supervisorId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (deposit.status !== 'PENDING') {
      throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce dépôt a déjà été traité.');
    }

    // Un superviseur revoque du projet ne peut plus decider d'un depot en attente.
    const assignment = await this.prisma.projectSupervisor.findFirst({
      where: { projectId: deposit.projectId, supervisorId: deposit.supervisorId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!assignment) throw AppException.forbiddenProjectAccess();

    return deposit;
  }

  private async notifyClient(
    deposit: { clientId: string; projectId: string },
    build: (client: { userId: string; firstName: string }, project: { name: string }) => Parameters<NotificationsService['send']>[0],
  ) {
    await this.afterCommit(async () => {
      const [client, project] = await Promise.all([
        this.prisma.clientProfile.findUnique({ where: { id: deposit.clientId }, select: { userId: true, firstName: true } }),
        this.prisma.project.findUnique({ where: { id: deposit.projectId }, select: { name: true } }),
      ]);
      if (!client || !project) return;
      await this.notifications.send(build(client, project));
    });
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const deposit = await this.loadForSupervisorDecision(id, actor);

    await this.prisma.runInTransaction(async (tx) => {
      // Mise a jour conditionnelle : si une autre decision est passee entre-temps, rien n'est modifie.
      const updated = await tx.deposit.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', isLocked: true, approvedById: actor.userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce dépôt a déjà été traité.');

      await this.wallets.recompute(deposit.projectId, tx);

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'Deposit', entityId: id, oldValue: { status: 'PENDING' }, newValue: { status: 'APPROVED' } },
        tx,
      );
    });

    await this.notifyClient(deposit, (client, project) => ({
      userId: client.userId,
      type: 'DEPOSIT_APPROVED',
      title: 'Dépôt validé',
      message: `Votre dépôt de ${formatMoney(deposit.amount, deposit.currency)} a été validé.`,
      emailHtml: emailTemplates.depositApproved(client.firstName, project.name, formatMoney(deposit.amount, deposit.currency), this.projectUrl(deposit.projectId)),
      emailSubject: 'Dépôt validé',
    }));

    return this.getRaw(id);
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser) {
    const deposit = await this.loadForSupervisorDecision(id, actor);

    await this.prisma.runInTransaction(async (tx) => {
      // Avant : mise a jour sans condition de statut ni transaction -> un refus pouvait ecraser une validation
      // concurrente SANS recalculer le portefeuille (solde faux).
      const updated = await tx.deposit.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED', rejectionReason: reason, approvedById: actor.userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce dépôt a déjà été traité.');

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'REJECT',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: 'REJECTED', reason },
          reason,
        },
        tx,
      );
    });

    await this.notifyClient(deposit, (client, project) => ({
      userId: client.userId,
      type: 'DEPOSIT_REJECTED',
      title: 'Dépôt refusé',
      message: `Votre dépôt de ${formatMoney(deposit.amount, deposit.currency)} a été refusé : ${reason}`,
      emailHtml: emailTemplates.depositRejected(client.firstName, project.name, formatMoney(deposit.amount, deposit.currency), reason, this.projectUrl(deposit.projectId)),
      emailSubject: 'Dépôt refusé',
    }));

    return this.getRaw(id);
  }

  async correctAmount(id: string, newAmountInput: number, reason: string, actor: AuthenticatedUser) {
    const newAmount = roundMoney(newAmountInput);

    const { deposit, oldAmount } = await this.prisma.runInTransaction(async (tx) => {
      // Lecture DANS la transaction : l'ancienne valeur historisee est bien celle qui est remplacee.
      const current = await tx.deposit.findUnique({ where: { id } });
      if (!current) throw AppException.notFound('Dépôt');
      if (current.status === 'CANCELLED' || current.status === 'REJECTED') {
        throw AppException.conflict('DEPOSIT_NOT_CORRECTABLE', 'Un dépôt annulé ou refusé ne peut pas être corrigé.');
      }
      if (current.amount.equals(newAmount)) {
        throw AppException.badRequest('NO_CHANGE', 'Le nouveau montant est identique au montant actuel.');
      }

      await tx.deposit.update({ where: { id }, data: { amount: newAmount } });
      await tx.financialCorrection.create({
        data: { entityType: 'Deposit', entityId: id, oldValue: current.amount, newValue: newAmount, reason, correctedById: actor.userId },
      });
      if (current.status === 'APPROVED') await this.wallets.recompute(current.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'ADMIN_CORRECTION',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { amount: current.amount.toString() },
          newValue: { amount: newAmount.toString() },
          reason,
        },
        tx,
      );
      return { deposit: current, oldAmount: current.amount };
    });

    await this.notifyClient(deposit, (client, project) => ({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Correction administrative sur un dépôt',
      message: `Le montant d'un dépôt a été corrigé de ${formatMoney(oldAmount, deposit.currency)} à ${formatMoney(newAmount, deposit.currency)}.`,
      emailHtml: emailTemplates.adminCorrection(
        client.firstName,
        'Deposit',
        formatMoney(oldAmount, deposit.currency),
        formatMoney(newAmount, deposit.currency),
        reason,
        this.projectUrl(deposit.projectId),
      ),
      emailSubject: `Correction administrative (${project.name})`,
    }));

    return this.getRaw(id);
  }

  /** Edition libre multi-champs (superadmin). Si le montant change, on passe aussi par le circuit de correction financiere. */
  async update(id: string, dto: UpdateDepositDto, actor: AuthenticatedUser) {
    const { existing, changedFieldLabels } = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.deposit.findUnique({ where: { id } });
      if (!current) throw AppException.notFound('Dépôt');

      const newAmount = dto.amount !== undefined ? roundMoney(dto.amount) : undefined;
      const amountChanged = newAmount !== undefined && !newAmount.equals(current.amount);
      if (amountChanged && (current.status === 'CANCELLED' || current.status === 'REJECTED')) {
        throw AppException.conflict('DEPOSIT_NOT_CORRECTABLE', 'Le montant d\'un dépôt annulé ou refusé ne peut pas être modifié.');
      }

      const labels: string[] = [];
      if (amountChanged) labels.push('Montant');
      if (dto.date !== undefined) labels.push('Date');
      if (dto.motif !== undefined) labels.push('Motif');
      if (dto.paymentMethod !== undefined) labels.push('Mode de versement');
      if (dto.reference !== undefined) labels.push('Référence');
      if (dto.observation !== undefined) labels.push('Observation');
      if (dto.originalAmount !== undefined || dto.originalCurrency !== undefined || dto.exchangeRate !== undefined || dto.transferFees !== undefined) {
        labels.push('Change et frais de transfert');
      }

      await tx.deposit.update({
        where: { id },
        data: {
          amount: amountChanged ? newAmount : undefined,
          date: dto.date ? new Date(dto.date) : undefined,
          motif: dto.motif,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          observation: dto.observation,
          originalAmount: dto.originalAmount === undefined ? undefined : dto.originalAmount === null ? null : roundMoney(dto.originalAmount),
          originalCurrency: dto.originalCurrency,
          exchangeRate: dto.exchangeRate,
          transferFees: dto.transferFees === undefined ? undefined : dto.transferFees === null ? null : roundMoney(dto.transferFees),
        },
      });

      if (amountChanged) {
        await tx.financialCorrection.create({
          data: {
            entityType: 'Deposit',
            entityId: id,
            oldValue: current.amount,
            newValue: newAmount!,
            reason: 'Modification administrative (édition multi-champs)',
            correctedById: actor.userId,
          },
        });
        if (current.status === 'APPROVED') await this.wallets.recompute(current.projectId, tx);
      }

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Deposit', entityId: id, oldValue: current, newValue: dto },
        tx,
      );
      return { existing: current, changedFieldLabels: labels };
    });

    if (changedFieldLabels.length > 0) {
      await this.notifyClient(existing, (client) => ({
        userId: client.userId,
        type: 'ADMIN_CORRECTION',
        title: 'Modification administrative sur un dépôt',
        message: `Champs modifiés : ${changedFieldLabels.join(', ')}.`,
        emailHtml: emailTemplates.adminFieldUpdate(client.firstName, 'Deposit', changedFieldLabels.join(', '), this.projectUrl(existing.projectId)),
        emailSubject: 'Modification administrative',
      }));
    }

    return this.getRaw(id);
  }

  /** Suppression logique (superadmin) : jamais de suppression physique - bascule en CANCELLED. */
  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.deposit.findUnique({ where: { id } });
      if (!current) throw AppException.notFound('Dépôt');
      if (current.status === 'CANCELLED') {
        throw AppException.conflict('DEPOSIT_ALREADY_CANCELLED', 'Ce dépôt est déjà annulé.');
      }

      await tx.deposit.update({ where: { id }, data: { status: 'CANCELLED', rejectionReason: reason } });
      if (current.status === 'APPROVED') await this.wallets.recompute(current.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { status: current.status },
          newValue: { status: 'CANCELLED' },
          reason,
        },
        tx,
      );
      return current;
    });

    await this.notifyClient(existing, (client) => ({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Dépôt supprimé',
      message: `Un dépôt de ${formatMoney(existing.amount, existing.currency)} a été supprimé par le superadministrateur : ${reason}`,
    }));

    return this.getRaw(id);
  }

  async setArchived(id: string, archived: boolean, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.deposit.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Dépôt');

      await tx.deposit.update({ where: { id }, data: { isArchived: archived, archivedAt: archived ? new Date() : null } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { isArchived: existing.isArchived },
          newValue: { isArchived: archived },
        },
        tx,
      );
    });

    return this.getRaw(id);
  }
}
