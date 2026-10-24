//backend/src/quality/receptions.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma, ReceptionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { nextProjectNumber } from '../common/utils/sequence.util';
import { parseIsoDate, toIsoDate } from '../common/utils/month.util';
import { loadUserNames } from '../common/utils/user-names.util';
import { PDF_COLOR, frDate, pdfBullets, pdfHeader, pdfKeyValues, pdfParagraph, pdfSection, pdfWidth, renderPdf, PDF_MARGIN, pdfEnsureSpace } from '../common/pdf/pdf.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, DECISION_MAKERS, getSiteRole, OWNERS } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { CreateReceptionDto } from './dto/quality.dto';

export const RECEPTION_LABEL: Record<ReceptionType, string> = {
  PHASE: "Réception d'étape",
  PROVISIONAL: 'Réception provisoire',
  FINAL: 'Réception définitive',
};

interface SnapshotItem {
  number: number;
  title: string;
  severity: string;
  status: string;
  location: string | null;
}

/**
 * Proces-verbaux de reception (etape, provisoire, definitive). La liste des reserves non levees est FIGEE a la creation du PV :
 * la reception est dite « avec reserves » quand elle n'est pas vide. Une fois signe par le client, le PV ne change plus.
 */
@Injectable()
export class ReceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: SiteNotifierService,
  ) {}

  private present(row: Prisma.ReceptionGetPayload<{ include: { phase: { select: { name: true } } } }>, names: Map<string, string>) {
    const { phase, ...rest } = row;
    return {
      ...rest,
      date: toIsoDate(row.date),
      typeLabel: RECEPTION_LABEL[row.type],
      phaseName: phase?.name ?? null,
      withReserves: row.openSnagsCount > 0,
      createdByName: names.get(row.createdById) ?? null,
    };
  }

  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.reception.findMany({ where: { projectId }, orderBy: { number: 'desc' }, include: { phase: { select: { name: true } } } });
    const names = await loadUserNames(this.prisma, rows.map((r) => r.createdById));
    return rows.map((r) => this.present(r, names));
  }

  async findOne(projectId: string, id: string) {
    await findProjectOrThrow(this.prisma, projectId);
    const row = await this.prisma.reception.findFirst({ where: { id, projectId }, include: { phase: { select: { name: true } } } });
    if (!row) throw AppException.notFound('Procès-verbal');
    const names = await loadUserNames(this.prisma, [row.createdById]);
    return this.present(row, names);
  }

  async create(projectId: string, dto: CreateReceptionDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), DECISION_MAKERS, 'Seuls le client et les responsables techniques établissent un procès-verbal.');

    const date = parseIsoDate(dto.date);
    if (!date) throw AppException.badRequest('INVALID_DATE', 'La date doit etre au format AAAA-MM-JJ.');
    if (dto.type === 'PHASE' && !dto.phaseId) throw AppException.badRequest('PHASE_REQUIRED', "Indiquez l'étape réceptionnée.");
    if (dto.type !== 'PHASE' && dto.phaseId) throw AppException.badRequest('PHASE_NOT_ALLOWED', "Une réception provisoire ou définitive porte sur tout le chantier.");

    const created = await this.prisma.runInTransaction(async (tx) => {
      if (dto.phaseId) {
        const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
        if (!phase) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas sur ce projet.");
      }
      const unresolved = await tx.snag.findMany({
        where: { projectId, status: { not: 'CLOSED' }, ...(dto.phaseId ? { phaseId: dto.phaseId } : {}) },
        orderBy: { number: 'asc' },
        select: { number: true, title: true, severity: true, status: true, location: true },
      });
      // La reception definitive ne peut pas se faire avec une reserve critique encore ouverte.
      if (dto.type === 'FINAL' && unresolved.some((s) => s.severity === 'CRITICAL')) {
        throw AppException.conflict('CRITICAL_SNAGS_OPEN', 'Des réserves critiques ne sont pas encore levées : la réception définitive est impossible.');
      }

      const number = await nextProjectNumber(tx, 'reception', projectId);
      const row = await tx.reception.create({
        data: {
          projectId,
          number,
          type: dto.type,
          phaseId: dto.phaseId,
          date,
          notes: dto.notes?.trim() || null,
          attendees: dto.attendees?.trim() || null,
          reservesSnapshot: unresolved as unknown as Prisma.InputJsonValue,
          openSnagsCount: unresolved.length,
          createdById: actor.userId,
        },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Reception', entityId: row.id, newValue: { projectId, number, type: dto.type, reserves: unresolved.length } },
        tx,
      );
      return row;
    });

    await this.notifier.toClient(project, {
      type: 'SNAG_UPDATED',
      title: 'Procès-verbal de réception à signer',
      message: `${RECEPTION_LABEL[dto.type]} n°${created.number} établie pour ${project.name}${created.openSnagsCount ? ` avec ${created.openSnagsCount} réserve(s)` : ' sans réserve'}.`,
      path: '/quality',
      meta: { receptionId: created.id },
    });
    return this.findOne(projectId, created.id);
  }

  /** Signature du client : fige le PV. */
  async sign(projectId: string, id: string, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), OWNERS, 'Seul le client signe le procès-verbal.');

    await this.prisma.runInTransaction(async (tx) => {
      const current = await tx.reception.findFirst({ where: { id, projectId } });
      if (!current) throw AppException.notFound('Procès-verbal');
      if (current.signedAt) throw AppException.conflict('RECEPTION_ALREADY_SIGNED', 'Ce procès-verbal est déjà signé.');

      const signer = actor.clientProfileId
        ? await tx.clientProfile.findUnique({ where: { id: actor.clientProfileId }, select: { firstName: true, lastName: true } })
        : null;
      const signerName = signer ? `${signer.firstName} ${signer.lastName}` : 'Administrateur';
      await tx.reception.update({ where: { id }, data: { signedAt: new Date(), signedById: actor.userId, signerName } });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'APPROVE', entityType: 'Reception', entityId: id, newValue: { signedBy: signerName } },
        tx,
      );
    });
    return this.findOne(projectId, id);
  }

  async pdf(projectId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, location: true, city: true, country: true, client: { select: { firstName: true, lastName: true, companyName: true } } },
    });
    if (!project) throw AppException.notFound('Projet');
    const reception = await this.prisma.reception.findFirst({ where: { id, projectId }, include: { phase: { select: { name: true } } } });
    if (!reception) throw AppException.notFound('Procès-verbal');

    const reserves = (reception.reservesSnapshot as unknown as SnapshotItem[] | null) ?? [];
    const label = RECEPTION_LABEL[reception.type];
    const place = [project.location, project.city, project.country].filter(Boolean).join(', ');

    const buffer = await renderPdf((doc) => {
      pdfHeader(doc, 'Procès-verbal de réception', `${label} n°${reception.number} — ${project.name}`);
      pdfKeyValues(doc, [
        ['Projet', project.name],
        ['Maître d\'ouvrage', project.client.companyName || `${project.client.firstName} ${project.client.lastName}`],
        ['Lieu', place || '-'],
        ['Date de la réception', frDate(reception.date)],
        ['Nature', label],
        ['Étape concernée', reception.phase?.name ?? 'Ensemble du chantier'],
      ]);

      if (reception.attendees) {
        pdfSection(doc, 'Personnes présentes');
        pdfParagraph(doc, reception.attendees);
      }
      if (reception.notes) {
        pdfSection(doc, 'Observations');
        pdfParagraph(doc, reception.notes);
      }

      pdfSection(doc, reserves.length ? `Réserves à lever (${reserves.length})` : 'Réserves');
      if (reserves.length === 0) {
        pdfParagraph(doc, 'La réception est prononcée sans réserve.');
      } else {
        pdfParagraph(doc, 'La réception est prononcée avec les réserves suivantes, à lever par l\'entreprise :', { muted: true });
        pdfBullets(
          doc,
          reserves.map((r) => `n°${r.number} — ${r.title}${r.location ? ` (${r.location})` : ''} — gravité ${({ MINOR: 'mineure', MAJOR: 'majeure', CRITICAL: 'critique' } as Record<string, string>)[r.severity] ?? r.severity}`),
        );
      }

      pdfSection(doc, 'Signatures');
      pdfEnsureSpace(doc, 110);
      const y = doc.y + 4;
      const half = pdfWidth(doc) / 2;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLOR.muted);
      doc.text('Le maître d\'ouvrage', PDF_MARGIN, y, { width: half - 10 });
      doc.text('Le conducteur de travaux / l\'entreprise', PDF_MARGIN + half, y, { width: half - 10 });
      doc.roundedRect(PDF_MARGIN, y + 16, half - 16, 70, 6).lineWidth(0.6).strokeColor(PDF_COLOR.border).stroke();
      doc.roundedRect(PDF_MARGIN + half, y + 16, half - 16, 70, 6).lineWidth(0.6).strokeColor(PDF_COLOR.border).stroke();
      if (reception.signedAt) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(PDF_COLOR.moss);
        doc.text(`Signé électroniquement par ${reception.signerName ?? '-'}`, PDF_MARGIN + 8, y + 30, { width: half - 32 });
        doc.text(`le ${frDate(reception.signedAt)}`, PDF_MARGIN + 8, y + 44, { width: half - 32 });
      }
      doc.y = y + 96;
    });
    return { buffer, filename: `PV-reception-${reception.number}-${project.name}.pdf` };
  }
}
