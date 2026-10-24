//backend/src/site-logs/site-logs.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { assessLocation } from '../common/utils/geo.util';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertEditableDay, assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, getSiteRole, SiteRole } from '../site-common/site-access';
import { CreateSiteLogDto, SiteLogQueryDto, UpdateSiteLogDto } from './dto/site-log.dto';

/** Auteurs du journal : le terrain et l'architecte (compte rendu de visite). Le client lit. */
const LOG_AUTHORS: readonly SiteRole[] = ['SUPERADMIN', 'SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT'];
/** Un auteur peut corriger son entree pendant 48 h ; ensuite seul le superadmin. */
const AUTHOR_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

type LogRow = Prisma.SiteLogGetPayload<{ include: { phase: { select: { name: true } } } }>;

@Injectable()
export class SiteLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
  ) {}

  private async present(rows: LogRow[]) {
    const [names, photos] = await Promise.all([
      loadUserNames(this.prisma, rows.map((r) => r.createdById)),
      this.attachments.listForEntities('SiteLog', rows.map((r) => r.id)),
    ]);
    return rows.map(({ phase, ...row }) => ({
      ...row,
      date: toIsoDate(row.date),
      phaseName: phase?.name ?? null,
      authorName: names.get(row.createdById) ?? null,
      attachments: photos.get(row.id) ?? [],
    }));
  }

  async list(projectId: string, query: SiteLogQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = query.from ? parseIsoDate(query.from) : null;
    const to = query.to ? parseIsoDate(query.to) : null;
    if ((query.from && !from) || (query.to && !to)) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');

    const where: Prisma.SiteLogWhereInput = {
      projectId,
      phaseId: query.phaseId,
      date: from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined,
      ...(query.search ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { content: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.siteLog.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { phase: { select: { name: true } } },
      }),
      this.prisma.siteLog.count({ where }),
    ]);
    return { items: await this.present(rows), meta: buildPaginationMeta(page, limit, total) };
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.siteLog.findFirst({ where: { id, projectId }, include: { phase: { select: { name: true } } } });
    if (!row) throw AppException.notFound('Entrée du journal');
    return (await this.present([row]))[0];
  }

  async create(projectId: string, dto: CreateSiteLogDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, LOG_AUTHORS, 'Seuls les intervenants du chantier rédigent le journal.');

    // Rejeu d'une saisie hors ligne : deja enregistree.
    if (dto.clientRef) {
      const already = await this.prisma.siteLog.findFirst({ where: { projectId, clientRef: dto.clientRef }, select: { id: true } });
      if (already) return this.findOne(projectId, already.id);
    }

    const today = startOfUtcDay();
    const date = dto.date ? parseIsoDate(dto.date) : today;
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    assertEditableDay(actor.role, date, today);

    const site = await this.prisma.project.findUnique({ where: { id: projectId }, select: { siteLatitude: true, siteLongitude: true, geoFenceMeters: true } });
    const location = assessLocation(site ?? { siteLatitude: null, siteLongitude: null, geoFenceMeters: 500 }, dto.latitude, dto.longitude);

    const created = await this.prisma.runInTransaction(async (tx) => {
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      const row = await tx.siteLog.create({
        data: {
          projectId,
          date,
          title: dto.title.trim(),
          content: dto.content.trim(),
          weather: dto.weather,
          phaseId: dto.phaseId,
          latitude: location.latitude,
          longitude: location.longitude,
          isOffSite: location.isOffSite,
          clientRef: dto.clientRef,
          createdById: actor.userId,
        },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'SiteLog', entityId: row.id, newValue: { projectId, date: toIsoDate(date), title: row.title, offSite: location.isOffSite } },
        tx,
      );
      return row;
    });
    return this.findOne(projectId, created.id);
  }

  async update(projectId: string, id: string, dto: UpdateSiteLogDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.siteLog.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Entrée du journal');
      if (actor.role !== 'SUPERADMIN') {
        if (current.createdById !== actor.userId) throw AppException.forbiddenProjectAccess();
        if (Date.now() - current.createdAt.getTime() > AUTHOR_EDIT_WINDOW_MS) {
          throw AppException.forbidden('LOG_LOCKED', "Une entrée ne peut plus être modifiée après 48 h : ajoutez une nouvelle entrée.");
        }
      }
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      await tx.siteLog.update({
        where: { id },
        data: { title: dto.title?.trim(), content: dto.content?.trim(), weather: dto.weather, phaseId: dto.phaseId },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'SiteLog', entityId: id, oldValue: { title: current.title, content: current.content }, newValue: dto },
        tx,
      );
    });
    return this.findOne(projectId, id);
  }

  async remove(projectId: string, id: string, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.siteLog.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Entrée du journal');
      await tx.siteLog.delete({ where: { id } });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'SiteLog', entityId: id, oldValue: { projectId, title: current.title, date: toIsoDate(current.date) } },
        tx,
      );
    });
    return { removed: true };
  }
}
