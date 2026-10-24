//backend/src/quality/snags.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, CONTRIBUTORS, DECISION_MAKERS, FIELD_WRITERS, getSiteRole } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { snagTransition, summarizeSnags } from './quality.calc';
import { CreateSnagDto, SnagQueryDto, TransitionSnagDto, UpdateSnagDto } from './dto/quality.dto';

type SnagRow = Prisma.SnagGetPayload<{ include: { phase: { select: { name: true } } } }>;

/** Reserves / non-conformites : relevees par tous les intervenants, levees par le terrain, confirmees par le client ou le technique. */
@Injectable()
export class SnagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private async present(rows: SnagRow[], today: Date) {
    const [names, photos] = await Promise.all([
      loadUserNames(this.prisma, rows.flatMap((r) => [r.raisedById, r.fixedById, r.closedById])),
      this.attachments.listForEntities('Snag', rows.map((r) => r.id)),
    ]);
    return rows.map(({ phase, ...row }) => ({
      ...row,
      dueDate: row.dueDate ? toIsoDate(row.dueDate) : null,
      phaseName: phase?.name ?? null,
      overdue: row.status !== 'CLOSED' && !!row.dueDate && row.dueDate.getTime() < today.getTime(),
      raisedByName: names.get(row.raisedById) ?? null,
      fixedByName: row.fixedById ? (names.get(row.fixedById) ?? null) : null,
      closedByName: row.closedById ? (names.get(row.closedById) ?? null) : null,
      attachments: photos.get(row.id) ?? [],
    }));
  }

  async list(projectId: string, query: SnagQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const today = startOfUtcDay();
    const rows = await this.prisma.snag.findMany({
      where: { projectId, status: query.status, severity: query.severity, phaseId: query.phaseId },
      orderBy: [{ status: 'asc' }, { number: 'desc' }],
      include: { phase: { select: { name: true } } },
      take: 500,
    });
    const all = await this.prisma.snag.findMany({ where: { projectId }, select: { status: true, severity: true, dueDate: true } });
    return { items: await this.present(rows, today), summary: summarizeSnags(all, today) };
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.snag.findFirst({ where: { id, projectId }, include: { phase: { select: { name: true } } } });
    if (!row) throw AppException.notFound('Réserve');
    return (await this.present([row], startOfUtcDay()))[0];
  }

  async create(projectId: string, dto: CreateSnagDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), CONTRIBUTORS);

    if (dto.clientRef) {
      const already = await this.prisma.snag.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.findOne(projectId, already.id);
    }
    const dueDate = dto.dueDate ? parseIsoDate(dto.dueDate) : null;
    if (dto.dueDate && !dueDate) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');

    const created = await this.prisma.runInTransaction(async (tx) => {
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      const number = await nextProjectNumber(tx, 'snag', projectId);
      const row = await tx.snag.create({
        data: {
          projectId,
          number,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          location: dto.location?.trim() || null,
          severity: dto.severity ?? 'MINOR',
          phaseId: dto.phaseId,
          dueDate,
          raisedById: actor.userId,
          clientRef: dto.clientRef,
        },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Snag', entityId: row.id, newValue: { projectId, number, severity: row.severity, title: row.title } },
        tx,
      );
      return row;
    });

    const input = {
      type: 'SNAG_REPORTED' as const,
      title: created.severity === 'CRITICAL' ? 'Réserve CRITIQUE signalée' : 'Réserve signalée',
      message: `Réserve n°${created.number} « ${created.title} » (${project.name}).`,
      path: '/quality',
      meta: { snagId: created.id },
    };
    await this.notifier.toClient(project, input);
    await this.notifier.toReviewers(projectId, input, actor.userId);
    await this.notifier.toSupervisors(projectId, input, actor.userId);
    return this.findOne(projectId, created.id);
  }

  async update(projectId: string, id: string, dto: UpdateSnagDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.snag.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Réserve');
      // Le declarant corrige sa propre reserve ; le client, le technique et le superadmin toutes.
      if (current.raisedById !== actor.userId && !DECISION_MAKERS.includes(role)) throw AppException.forbiddenProjectAccess();
      if (current.status === 'CLOSED') throw AppException.conflict('SNAG_CLOSED', 'Une réserve close ne peut plus être modifiée : rouvrez-la.');

      let dueDate: Date | null | undefined;
      if (dto.dueDate !== undefined) {
        dueDate = dto.dueDate === null ? null : parseIsoDate(dto.dueDate);
        if (dueDate === null && dto.dueDate !== null) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
      }
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      await tx.snag.update({
        where: { id },
        data: { title: dto.title?.trim(), description: dto.description?.trim(), location: dto.location?.trim(), severity: dto.severity, phaseId: dto.phaseId, dueDate },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Snag', entityId: id, oldValue: { title: current.title, severity: current.severity }, newValue: dto },
        tx,
      );
    });
    return this.findOne(projectId, id);
  }

  async transition(projectId: string, id: string, dto: TransitionSnagDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);

    const snag = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.snag.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Réserve');

      const rule = snagTransition(current.status, dto.to);
      if (!rule.allowed) throw AppException.conflict('INVALID_TRANSITION', `Une réserve « ${current.status} » ne peut pas passer à « ${dto.to} ».`);
      assertSiteRole(role, rule.rule === 'FIELD' ? FIELD_WRITERS : DECISION_MAKERS, 'Votre fonction ne permet pas ce changement de statut.');
      if (rule.noteRequired && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif.');

      const now = new Date();
      const data: Prisma.SnagUpdateManyMutationInput & { fixedById?: string | null; closedById?: string | null } = { status: dto.to };
      if (dto.to === 'FIXED') Object.assign(data, { fixedById: actor.userId, fixedAt: now, fixNote: dto.note?.trim() || null });
      if (dto.to === 'CLOSED') Object.assign(data, { closedById: actor.userId, closedAt: now, closureNote: dto.note?.trim() || null });
      if (dto.to === 'OPEN') Object.assign(data, { fixedById: null, fixedAt: null, closedById: null, closedAt: null, closureNote: dto.note!.trim() });

      const done = await tx.snag.updateMany({ where: { id, status: current.status }, data });
      if (done.count !== 1) throw AppException.conflict('SNAG_CHANGED', 'Cette réserve vient d\'être modifiée : actualisez la page.');
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Snag', entityId: id, oldValue: { status: current.status }, newValue: { status: dto.to }, reason: dto.note },
        tx,
      );
      return current;
    });

    const label = { OPEN: 'rouverte', FIXED: 'levée (à confirmer)', CLOSED: 'close' }[dto.to];
    const input = { type: 'SNAG_UPDATED' as const, title: 'Réserve mise à jour', message: `Réserve n°${snag.number} « ${snag.title} » ${label}.`, path: '/quality', meta: { snagId: id } };
    await this.notifier.toUser(snag.raisedById, projectId, input);
    if (dto.to === 'FIXED') {
      await this.notifier.toClient(project, input);
      await this.notifier.toReviewers(projectId, input, actor.userId);
    }
    return this.findOne(projectId, id);
  }
}
