// backend/src/deposits/deposits.service.ts - v1.1
// Ajout de update() (edition libre multi-champs), archive()/unarchive() et
// remove() (suppression logique -> statut CANCELLED, jamais de suppression
// physique - coherent avec Expense.cancel() et la section 52 du cahier des
// charges). Toutes reservees au superadmin (verifie au controller).

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { formatMoney } from '../common/utils/money.util';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositQueryDto } from './dto/deposit-query.dto';
import { UpdateDepositDto } from './dto/update-deposit.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async create(projectId: string, dto: CreateDepositDto, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const assignment = await this.prisma.projectSupervisor.findFirst({
      where: { projectId, supervisorId: dto.supervisorId, status: 'ACTIVE' },
    });
    if (!assignment) {
      throw AppException.badRequest('SUPERVISOR_NOT_ASSIGNED', "Ce superviseur n'est pas affecté à ce projet.");
    }

    const deposit = await this.prisma.deposit.create({
      data: {
        projectId,
        clientId: project.clientId,
        supervisorId: dto.supervisorId,
        amount: dto.amount,
        currency: dto.currency ?? project.currency,
        date: dto.date ? new Date(dto.date) : new Date(),
        motif: dto.motif,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        observation: dto.observation,
        status: 'PENDING',
        createdById: actor.userId,
      },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'CREATE',
      entityType: 'Deposit',
      entityId: deposit.id,
      newValue: { amount: dto.amount, projectId, supervisorId: dto.supervisorId, status: 'PENDING' },
    });

    const supervisor = await this.prisma.supervisorProfile.findUniqueOrThrow({ where: { id: dto.supervisorId } });
    await this.notifications.send({
      userId: supervisor.userId,
      type: 'DEPOSIT_CREATED',
      title: 'Nouveau dépôt à valider',
      message: `Un depot de ${formatMoney(dto.amount, deposit.currency)} a été enregistré pour le projet.`,
      emailHtml: emailTemplates.depositCreated(
        supervisor.firstName,
        project.name,
        formatMoney(dto.amount, deposit.currency),
        `${this.config.get<string>('frontendUrl')}/projects/${projectId}/deposits/${deposit.id}`,
      ),
      emailSubject: 'Nouveau dépôt à valider',
    });

    return deposit;
  }

  async findAllForProject(projectId: string, query: DepositQueryDto & { includeArchived?: boolean }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.DepositWhereInput = {
      projectId,
      status: query.status,
      supervisorId: query.supervisorId,
      isArchived: query.includeArchived ? undefined : false,
      date: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      ...(query.search ? { OR: [{ motif: { contains: query.search, mode: 'insensitive' } }, { reference: { contains: query.search, mode: 'insensitive' } }] } : {}),
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

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  private async getRaw(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: { supervisor: true, client: true, project: { select: { id: true, name: true, currency: true } }, attachments: true },
    });
    if (!deposit) throw AppException.notFound('Dépôt');
    return deposit;
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const deposit = await this.getRaw(id);
    if (actor.role === 'SUPERADMIN') return deposit;
    if (actor.role === 'CLIENT' && deposit.clientId === actor.clientProfileId) return deposit;
    if (actor.role === 'SUPERVISOR' && deposit.supervisorId === actor.supervisorProfileId) return deposit;
    throw AppException.forbiddenProjectAccess();
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });

    if (actor.role !== 'SUPERVISOR' || actor.supervisorProfileId !== deposit.supervisorId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (deposit.status !== 'PENDING') {
      throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce dépôt a déjà été traîté.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({
        where: { id },
        data: { status: 'APPROVED', isLocked: true, approvedById: actor.userId, approvedAt: new Date() },
      });
      await this.wallets.recompute(deposit.projectId, tx);

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'Deposit', entityId: id, oldValue: { status: 'PENDING' }, newValue: { status: 'APPROVED' } },
        tx,
      );
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: deposit.projectId } });
    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: deposit.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'DEPOSIT_APPROVED',
      title: 'Dépôt validé',
      message: `Votre dépôt de ${formatMoney(deposit.amount, deposit.currency)} a été validé.`,
      emailHtml: emailTemplates.depositApproved(client.firstName, project.name, formatMoney(deposit.amount, deposit.currency), `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`),
      emailSubject: 'Dépôt validé',
    });

    return this.getRaw(id);
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });

    if (actor.role !== 'SUPERVISOR' || actor.supervisorProfileId !== deposit.supervisorId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (deposit.status !== 'PENDING') {
      throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce dépôt a déjà été traîté');
    }

    await this.prisma.deposit.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, approvedById: actor.userId, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'REJECT',
      entityType: 'Deposit',
      entityId: id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'REJECTED', reason },
      reason,
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: deposit.projectId } });
    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: deposit.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'DEPOSIT_REJECTED',
      title: 'Depot refuse',
      message: `Votre dépôt de ${formatMoney(deposit.amount, deposit.currency)} a été refusé : ${reason}`,
      emailHtml: emailTemplates.depositRejected(client.firstName, project.name, formatMoney(deposit.amount, deposit.currency), reason, `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`),
      emailSubject: 'Dépôt refusé',
    });

    return this.getRaw(id);
  }

  async correctAmount(id: string, newAmount: number, reason: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    const oldAmount = deposit.amount;

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({ where: { id }, data: { amount: newAmount } });
      await tx.financialCorrection.create({ data: { entityType: 'Deposit', entityId: id, oldValue: oldAmount, newValue: newAmount, reason, correctedById: actor.userId } });
      if (deposit.status === 'APPROVED') await this.wallets.recompute(deposit.projectId, tx);

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'ADMIN_CORRECTION', entityType: 'Deposit', entityId: id, oldValue: { amount: oldAmount }, newValue: { amount: newAmount }, reason },
        tx,
      );
    });

    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: deposit.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Correction administrative sur un dépôt',
      message: `Le montant d'un dépôt a été corrigé de ${formatMoney(oldAmount, deposit.currency)} a ${formatMoney(newAmount, deposit.currency)}.`,
      emailHtml: emailTemplates.adminCorrection(client.firstName, 'Deposit', formatMoney(oldAmount, deposit.currency), formatMoney(newAmount, deposit.currency), reason, `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`),
      emailSubject: 'Correction administrative',
    });

    return this.getRaw(id);
  }

  /** Edition libre multi-champs (superadmin). Si le montant change, on passe aussi par le circuit de correction financiere. */
  async update(id: string, dto: UpdateDepositDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    const amountChanged = dto.amount !== undefined && Number(dto.amount) !== Number(existing.amount);

    const changedFieldLabels: string[] = [];
    if (amountChanged) changedFieldLabels.push('Montant');
    if (dto.date !== undefined) changedFieldLabels.push('Date');
    if (dto.motif !== undefined) changedFieldLabels.push('Motif');
    if (dto.paymentMethod !== undefined) changedFieldLabels.push('Mode de versement');
    if (dto.reference !== undefined) changedFieldLabels.push('Référence');
    if (dto.observation !== undefined) changedFieldLabels.push('Observation');

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({
        where: { id },
        data: {
          amount: dto.amount,
          date: dto.date ? new Date(dto.date) : undefined,
          motif: dto.motif,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          observation: dto.observation,
        },
      });

      if (amountChanged) {
        await tx.financialCorrection.create({
          data: { entityType: 'Deposit', entityId: id, oldValue: existing.amount, newValue: dto.amount!, reason: 'Modification administrative (édition multi-champs)', correctedById: actor.userId },
        });
        if (existing.status === 'APPROVED') await this.wallets.recompute(existing.projectId, tx);
      }

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Deposit', entityId: id, oldValue: existing, newValue: dto },
        tx,
      );
    });

    if (changedFieldLabels.length > 0) {
      const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: existing.clientId } });
      await this.notifications.send({
        userId: client.userId,
        type: 'ADMIN_CORRECTION',
        title: 'Modification administrative sur un dépôt',
        message: `Champs modifiés : ${changedFieldLabels.join(', ')}.`,
        emailHtml: emailTemplates.adminFieldUpdate(client.firstName, 'Deposit', changedFieldLabels.join(', '), `${this.config.get<string>('frontendUrl')}/projects/${existing.projectId}`),
        emailSubject: 'Modification administrative',
      });
    }

    return this.getRaw(id);
  }

  /** Suppression logique (superadmin) : jamais de suppression physique - bascule en CANCELLED. */
  async remove(id: string, reason: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    if (existing.status === 'CANCELLED') {
      throw AppException.conflict('DEPOSIT_ALREADY_CANCELLED', 'Ce dépôt est déjà annulé.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({ where: { id }, data: { status: 'CANCELLED', rejectionReason: reason } });
      if (existing.status === 'APPROVED') await this.wallets.recompute(existing.projectId, tx);

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'Deposit', entityId: id, oldValue: { status: existing.status }, newValue: { status: 'CANCELLED' }, reason },
        tx,
      );
    });

    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: existing.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Dépôt supprimé',
      message: `Un dépôt de ${formatMoney(existing.amount, existing.currency)} a été supprimé par le superadministrateur : ${reason}`,
    });

    return this.getRaw(id);
  }

  async setArchived(id: string, archived: boolean, actor: AuthenticatedUser) {
    const existing = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    await this.prisma.deposit.update({ where: { id }, data: { isArchived: archived, archivedAt: archived ? new Date() : null } });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Deposit',
      entityId: id,
      oldValue: { isArchived: existing.isArchived },
      newValue: { isArchived: archived },
    });

    return this.getRaw(id);
  }
}