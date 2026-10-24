//backend/src/change-orders/change-orders.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { formatMoney, roundMoney, toDecimal } from '../common/utils/money.util';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { addDays } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, CONTRIBUTORS, getSiteRole, OWNERS } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { CancelChangeOrderDto, ChangeOrderQueryDto, CreateChangeOrderDto, DecideChangeOrderDto } from './dto/change-order.dto';

type ChangeOrderRow = Prisma.ChangeOrderGetPayload<{ include: { phase: { select: { name: true } } } }>;

/**
 * Avenants. Un superviseur (ou l'architecte) propose ; le CLIENT decide. Une fois approuve, le surcout s'ajoute au
 * budget du projet (et de l'etape) et le delai supplementaire repousse les dates de fin prevues. L'annulation d'un
 * avenant approuve (superadmin) defait exactement ces ajustements.
 */
@Injectable()
export class ChangeOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private async present(rows: ChangeOrderRow[]) {
    const names = await loadUserNames(this.prisma, rows.flatMap((r) => [r.requestedById, r.decidedById]));
    return rows.map(({ phase, ...row }) => ({
      ...row,
      phaseName: phase?.name ?? null,
      requestedByName: names.get(row.requestedById) ?? null,
      decidedByName: row.decidedById ? (names.get(row.decidedById) ?? null) : null,
    }));
  }

  async list(projectId: string, query: ChangeOrderQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.changeOrder.findMany({
      where: { projectId, status: query.status },
      orderBy: { number: 'desc' },
      include: { phase: { select: { name: true } } },
    });
    const approved = rows.filter((r) => r.status === 'APPROVED');
    const pending = rows.filter((r) => r.status === 'PENDING');
    const sum = (list: ChangeOrderRow[]) => roundMoney(list.reduce((total, r) => total.add(r.extraCost), toDecimal(0)));
    return {
      items: await this.present(rows),
      summary: {
        approvedCost: sum(approved),
        approvedDays: approved.reduce((n, r) => n + r.extraDays, 0),
        pendingCost: sum(pending),
        pendingCount: pending.length,
      },
    };
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.changeOrder.findFirst({ where: { id, projectId }, include: { phase: { select: { name: true } } } });
    if (!row) throw AppException.notFound('Avenant');
    return (await this.present([row]))[0];
  }

  async create(projectId: string, dto: CreateChangeOrderDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, CONTRIBUTORS.filter((r) => r !== 'CLIENT'), 'Le client valide les avenants mais ne les propose pas.');

    const created = await this.prisma.runInTransaction(async (tx) => {
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      const number = await nextProjectNumber(tx, 'changeOrder', projectId);
      const row = await tx.changeOrder.create({
        data: {
          projectId,
          number,
          title: dto.title.trim(),
          description: dto.description.trim(),
          extraCost: roundMoney(dto.extraCost),
          extraDays: dto.extraDays ?? 0,
          phaseId: dto.phaseId,
          requestedById: actor.userId,
        },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ChangeOrder', entityId: row.id, newValue: { projectId, number, extraCost: row.extraCost.toString(), extraDays: row.extraDays } },
        tx,
      );
      return row;
    });

    await this.notifier.toClient(project, {
      type: 'CHANGE_ORDER_REQUESTED',
      title: 'Avenant à valider',
      message: `Avenant n°${created.number} « ${created.title} » (${project.name}) : +${formatMoney(created.extraCost, project.currency)}${created.extraDays ? `, +${created.extraDays} jour(s)` : ''}. Votre accord est requis.`,
      path: '/progress',
      meta: { changeOrderId: created.id },
    });
    return this.findOne(projectId, created.id);
  }

  /** Ajuste (sens = +1) ou defait (sens = -1) les effets d'un avenant sur le budget et le planning. */
  private async applyEffects(tx: TxClient, projectId: string, order: { extraCost: Prisma.Decimal; extraDays: number; phaseId: string | null }, sign: 1 | -1) {
    const delta = sign === 1 ? order.extraCost : order.extraCost.neg();
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { budget: true, endDate: true } });
    await tx.project.update({
      where: { id: projectId },
      data: {
        budget: roundMoney(project.budget.add(delta)),
        endDate: project.endDate && order.extraDays ? addDays(project.endDate, sign * order.extraDays) : undefined,
      },
    });
    if (order.phaseId) {
      const phase = await tx.projectPhase.findUnique({ where: { id: order.phaseId }, select: { budgetAmount: true, plannedEnd: true } });
      if (phase) {
        await tx.projectPhase.update({
          where: { id: order.phaseId },
          data: {
            // Une etape sans budget n'en recoit pas un fictif : seul le budget du projet augmente.
            budgetAmount: phase.budgetAmount ? roundMoney(phase.budgetAmount.add(delta)) : undefined,
            plannedEnd: phase.plannedEnd && order.extraDays ? addDays(phase.plannedEnd, sign * order.extraDays) : undefined,
          },
        });
      }
    }
  }

  async decide(projectId: string, id: string, dto: DecideChangeOrderDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seul le client valide un avenant.');
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif du refus.');

    const order = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.changeOrder.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Avenant');
      if (current.status !== 'PENDING') throw AppException.conflict('CHANGE_ORDER_NOT_PENDING', 'Cet avenant a déjà été traité.');

      const done = await tx.changeOrder.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: dto.decision, decidedById: actor.userId, decidedAt: new Date(), decisionNote: dto.note?.trim() || null, appliedToBudget: dto.decision === 'APPROVED' },
      });
      if (done.count !== 1) throw AppException.conflict('CHANGE_ORDER_NOT_PENDING', 'Cet avenant a déjà été traité.');
      if (dto.decision === 'APPROVED') await this.applyEffects(tx, projectId, current, 1);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: dto.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entityType: 'ChangeOrder',
          entityId: id,
          oldValue: { status: 'PENDING' },
          newValue: { status: dto.decision, extraCost: current.extraCost.toString(), extraDays: current.extraDays },
          reason: dto.note,
        },
        tx,
      );
      return current;
    });

    const verdict = dto.decision === 'APPROVED' ? 'approuvé' : 'refusé';
    await this.notifier.toUser(order.requestedById, projectId, {
      type: 'CHANGE_ORDER_DECIDED',
      title: `Avenant ${verdict}`,
      message: `L'avenant n°${order.number} « ${order.title} » a été ${verdict} par le client${dto.note ? ` : ${dto.note}` : '.'}`,
      path: '/progress',
      meta: { changeOrderId: id },
    });
    return this.findOne(projectId, id);
  }

  async cancel(projectId: string, id: string, dto: CancelChangeOrderDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.changeOrder.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Avenant');
      if (current.status === 'CANCELLED' || current.status === 'REJECTED') {
        throw AppException.conflict('CHANGE_ORDER_CLOSED', 'Cet avenant est déjà clos.');
      }
      // Proposition en attente : son auteur ou le superadmin la retire ; avenant approuve : superadmin uniquement.
      const isAuthor = current.requestedById === actor.userId;
      if (current.status === 'APPROVED' ? actor.role !== 'SUPERADMIN' : !(isAuthor || actor.role === 'SUPERADMIN')) {
        throw AppException.forbidden('ROLE_NOT_ALLOWED', "Vous ne pouvez pas annuler cet avenant.");
      }

      if (current.status === 'APPROVED' && current.appliedToBudget) await this.applyEffects(tx, projectId, current, -1);
      await tx.changeOrder.update({ where: { id }, data: { status: 'CANCELLED', appliedToBudget: false, decisionNote: dto.reason.trim() } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CANCEL',
          entityType: 'ChangeOrder',
          entityId: id,
          oldValue: { status: current.status, extraCost: current.extraCost.toString() },
          newValue: { status: 'CANCELLED', budgetReverted: current.status === 'APPROVED' },
          reason: dto.reason,
        },
        tx,
      );
    });
    return this.findOne(projectId, id);
  }
}
