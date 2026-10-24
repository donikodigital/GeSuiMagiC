//backend/src/documents/documents.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { parseIsoDate, startOfUtcDay, toIsoDate } from '../common/utils/month.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, CONTRIBUTORS, DECISION_MAKERS, getSiteRole } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { alertLevelToSend, daysUntil, documentStatus } from './documents.calc';
import { CreateProjectDocumentDto, UpdateProjectDocumentDto } from './dto/document.dto';

/** Documents reglementaires du chantier (permis, assurances, garanties...) avec alertes avant expiration. */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private async present(rows: Array<Awaited<ReturnType<PrismaService['projectDocument']['findMany']>>[number]>) {
    const today = startOfUtcDay();
    const files = await this.attachments.listForEntities('ProjectDocument', rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      issuedAt: row.issuedAt ? toIsoDate(row.issuedAt) : null,
      expiresAt: row.expiresAt ? toIsoDate(row.expiresAt) : null,
      status: documentStatus(row.expiresAt, today),
      daysLeft: daysUntil(row.expiresAt, today),
      attachments: files.get(row.id) ?? [],
    }));
  }

  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.projectDocument.findMany({ where: { projectId }, orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] });
    return this.present(rows);
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.projectDocument.findFirst({ where: { id, projectId } });
    if (!row) throw AppException.notFound('Document');
    return (await this.present([row]))[0];
  }

  private parseDates(dto: { issuedAt?: string; expiresAt?: string }) {
    const issuedAt = dto.issuedAt ? parseIsoDate(dto.issuedAt) : undefined;
    const expiresAt = dto.expiresAt ? parseIsoDate(dto.expiresAt) : undefined;
    if ((dto.issuedAt && !issuedAt) || (dto.expiresAt && !expiresAt)) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    return { issuedAt, expiresAt };
  }

  async create(projectId: string, dto: CreateProjectDocumentDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), CONTRIBUTORS, 'Votre fonction ne permet pas d\'ajouter un document.');
    const { issuedAt, expiresAt } = this.parseDates(dto);
    if (issuedAt && expiresAt && expiresAt.getTime() < issuedAt.getTime()) throw AppException.badRequest('INVALID_DATE_RANGE', "L'expiration précède la date d'émission.");

    const row = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.projectDocument.create({
        data: { projectId, type: dto.type, title: dto.title.trim(), reference: dto.reference?.trim() || null, issuedAt: issuedAt ?? null, expiresAt: expiresAt ?? null, notes: dto.notes?.trim() || null, createdById: actor.userId },
      });
      await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectDocument', entityId: created.id, newValue: { projectId, type: dto.type, title: created.title, expiresAt: dto.expiresAt } }, tx);
      return created;
    });
    return (await this.present([row]))[0];
  }

  async update(projectId: string, id: string, dto: UpdateProjectDocumentDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Votre fonction ne permet pas de modifier un document.');
    const { issuedAt, expiresAt } = this.parseDates(dto);

    const row = await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.projectDocument.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Document');
      const nextIssued = issuedAt ?? current.issuedAt;
      const nextExpires = expiresAt ?? current.expiresAt;
      if (nextIssued && nextExpires && nextExpires.getTime() < nextIssued.getTime()) throw AppException.badRequest('INVALID_DATE_RANGE', "L'expiration précède la date d'émission.");
      const renewed = !!expiresAt && (!current.expiresAt || expiresAt.getTime() !== current.expiresAt.getTime());
      const updated = await tx.projectDocument.update({
        where: { id },
        data: { type: dto.type, title: dto.title?.trim(), reference: dto.reference?.trim(), issuedAt, expiresAt, notes: dto.notes?.trim(), lastAlertDays: renewed ? null : undefined },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'ProjectDocument', entityId: id, oldValue: { title: current.title, expiresAt: current.expiresAt ? toIsoDate(current.expiresAt) : null }, newValue: dto },
        tx,
      );
      return updated;
    });
    return (await this.present([row]))[0];
  }

  /**
   * Tache quotidienne : alerte le client et les responsables techniques quand un document franchit un seuil
   * d'expiration (60, 30, 14, 7 jours puis a l'echeance). Renvoie le nombre d'alertes envoyees.
   */
  async sendExpiryAlerts(today: Date = startOfUtcDay()): Promise<number> {
    const rows = await this.prisma.projectDocument.findMany({
      where: { expiresAt: { not: null }, project: { status: { in: ['ACTIVE', 'PLANNED', 'SUSPENDED'] } } },
      include: { project: { select: { id: true, name: true, clientId: true } } },
    });
    let sent = 0;
    for (const row of rows) {
      const level = alertLevelToSend(row.expiresAt, today, row.lastAlertDays);
      if (level === null) continue;
      try {
        const days = daysUntil(row.expiresAt, today) as number;
        const when = days < 0 ? `a expiré il y a ${-days} jour(s)` : days === 0 ? "expire aujourd'hui" : `expire dans ${days} jour(s)`;
        const input = {
          type: 'DOCUMENT_EXPIRING' as const,
          title: days <= 0 ? 'Document expiré' : "Document bientôt expiré",
          message: `« ${row.title} » (${row.project.name}) ${when}. Pensez à le renouveler.`,
          path: '/documents',
          meta: { documentId: row.id },
        };
        await this.notifier.toClient(row.project, input);
        await this.notifier.toReviewers(row.project.id, input);
        await this.prisma.projectDocument.update({ where: { id: row.id }, data: { lastAlertDays: level } });
        sent += 1;
      } catch (err) {
        this.logger.error(`Alerte d'expiration impossible pour le document ${row.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
    return sent;
  }
}
