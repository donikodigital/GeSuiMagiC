//backend/src/deposits/deposits.service.ts
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

  /** Etape 1 (section 14) : le client cree le depot, statut EN ATTENTE. */
  async create(projectId: string, dto: CreateDepositDto, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    // Le superviseur beneficiaire doit etre affecte a ce projet (regle 3/section 11).
    const assignment = await this.prisma.projectSupervisor.findFirst({
      where: { projectId, supervisorId: dto.supervisorId, status: 'ACTIVE' },
    });
    if (!assignment) {
      throw AppException.badRequest('SUPERVISOR_NOT_ASSIGNED', "Ce superviseur n'est pas affecte a ce projet.");
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

    // Etape 2 : le superviseur recoit une notification (section 14).
    const supervisor = await this.prisma.supervisorProfile.findUniqueOrThrow({ where: { id: dto.supervisorId } });
    await this.notifications.send({
      userId: supervisor.userId,
      type: 'DEPOSIT_CREATED',
      title: 'Nouveau depot a valider',
      message: `Un depot de ${formatMoney(dto.amount, deposit.currency)} a ete enregistre pour le projet.`,
      emailHtml: emailTemplates.depositCreated(
        supervisor.firstName,
        project.name,
        formatMoney(dto.amount, deposit.currency),
        `${this.config.get<string>('frontendUrl')}/projects/${projectId}/deposits/${deposit.id}`,
      ),
      emailSubject: 'Nouveau depot a valider',
    });

    return deposit;
  }

  async findAllForProject(projectId: string, query: DepositQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.DepositWhereInput = {
      projectId,
      status: query.status,
      supervisorId: query.supervisorId,
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
    if (!deposit) throw AppException.notFound('Depot');
    return deposit;
  }

  /** Consultation avec verification de l'appartenance (section 77 : jamais seulement userId). */
  async findOne(id: string, actor: AuthenticatedUser) {
    const deposit = await this.getRaw(id);
    if (actor.role === 'SUPERADMIN') return deposit;
    if (actor.role === 'CLIENT' && deposit.clientId === actor.clientProfileId) return deposit;
    if (actor.role === 'SUPERVISOR' && deposit.supervisorId === actor.supervisorProfileId) return deposit;
    throw AppException.forbiddenProjectAccess();
  }

  /** Etape 3-4 (section 14) : seul le superviseur beneficiaire peut valider. */
  async approve(id: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });

    if (actor.role !== 'SUPERVISOR' || actor.supervisorProfileId !== deposit.supervisorId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (deposit.status !== 'PENDING') {
      throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce depot a deja ete traite.');
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({
        where: { id },
        data: { status: 'APPROVED', isLocked: true, approvedById: actor.userId, approvedAt: new Date() },
      });
      // Seuls les depots VALIDES alimentent le solde (regle 6).
      await this.wallets.recompute(deposit.projectId, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'APPROVE',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: 'APPROVED' },
        },
        tx,
      );
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: deposit.projectId } });
    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: deposit.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'DEPOSIT_APPROVED',
      title: 'Depot valide',
      message: `Votre depot de ${formatMoney(deposit.amount, deposit.currency)} a ete valide.`,
      emailHtml: emailTemplates.depositApproved(
        client.firstName,
        project.name,
        formatMoney(deposit.amount, deposit.currency),
        `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`,
      ),
      emailSubject: 'Depot valide',
    });

    return this.getRaw(id);
  }

  /** Etape 5 (section 14) : refus avec motif obligatoire. Le solde n'est pas augmente. */
  async reject(id: string, reason: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });

    if (actor.role !== 'SUPERVISOR' || actor.supervisorProfileId !== deposit.supervisorId) {
      throw AppException.forbiddenProjectAccess();
    }
    if (deposit.status !== 'PENDING') {
      throw AppException.conflict('DEPOSIT_NOT_PENDING', 'Ce depot a deja ete traite.');
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
      message: `Votre depot de ${formatMoney(deposit.amount, deposit.currency)} a ete refuse : ${reason}`,
      emailHtml: emailTemplates.depositRejected(
        client.firstName,
        project.name,
        formatMoney(deposit.amount, deposit.currency),
        reason,
        `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`,
      ),
      emailSubject: 'Depot refuse',
    });

    return this.getRaw(id);
  }

  /**
   * Correction administrative (section 16/53). Reservee au superadmin.
   * Ne remplace JAMAIS silencieusement le montant : trace complete conservee
   * dans FinancialCorrection + AuditLog, avant recalcul du solde.
   */
  async correctAmount(id: string, newAmount: number, reason: string, actor: AuthenticatedUser) {
    const deposit = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    const oldAmount = deposit.amount;

    await this.prisma.runInTransaction(async (tx) => {
      await tx.deposit.update({ where: { id }, data: { amount: newAmount } });

      await tx.financialCorrection.create({
        data: {
          entityType: 'Deposit',
          entityId: id,
          oldValue: oldAmount,
          newValue: newAmount,
          reason,
          correctedById: actor.userId,
        },
      });

      if (deposit.status === 'APPROVED') {
        await this.wallets.recompute(deposit.projectId, tx);
      }

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'ADMIN_CORRECTION',
          entityType: 'Deposit',
          entityId: id,
          oldValue: { amount: oldAmount },
          newValue: { amount: newAmount },
          reason,
        },
        tx,
      );
    });

    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: deposit.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'ADMIN_CORRECTION',
      title: 'Correction administrative sur un depot',
      message: `Le montant d'un depot a ete corrige de ${formatMoney(oldAmount, deposit.currency)} a ${formatMoney(newAmount, deposit.currency)}.`,
      emailHtml: emailTemplates.adminCorrection(
        client.firstName,
        'Deposit',
        formatMoney(oldAmount, deposit.currency),
        formatMoney(newAmount, deposit.currency),
        reason,
        `${this.config.get<string>('frontendUrl')}/projects/${deposit.projectId}`,
      ),
      emailSubject: 'Correction administrative',
    });

    return this.getRaw(id);
  }
}
