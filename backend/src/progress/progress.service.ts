//backend/src/progress/progress.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { loadUserNames } from '../common/utils/user-names.util';
import { assertProjectOpenFor, findProjectOrThrow } from '../attendance/attendance.helpers';
import { assertSiteRole, DECISION_MAKERS, FIELD_WRITERS, getSiteRole } from '../site-common/site-access';
import { SiteNotifierService } from '../site-common/site-notifier.service';
import { computeProjectProgress } from './progress.calc';
import { DecideProgressDto, ProgressUpdatesQueryDto, SubmitProgressDto } from './dto/progress.dto';

/**
 * Avancement des etapes. Le superviseur DECLARE un pourcentage ; il ne compte qu'une fois VALIDE par le
 * conducteur de travaux / l'architecte (ou le client), et jamais par son propre auteur.
 * L'avancement du projet est recalcule a chaque validation.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: SiteNotifierService,
  ) {}

  /** Recalcule et enregistre l'avancement global du projet (moyenne des etapes actives). */
  async recomputeProject(tx: TxClient, projectId: string): Promise<number> {
    const phases = await tx.projectPhase.findMany({ where: { projectId }, select: { progressPercent: true, budgetAmount: true, isActive: true } });
    const percent = computeProjectProgress(phases);
    await tx.project.update({ where: { id: projectId }, data: { progressPercent: percent } });
    return percent;
  }

  async overview(projectId: string) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    const [phases, pending, progress] = await Promise.all([
      this.prisma.projectPhase.findMany({
        where: { projectId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, position: true, isActive: true, progressPercent: true, budgetAmount: true },
      }),
      this.prisma.phaseProgressUpdate.findMany({ where: { projectId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, include: { phase: { select: { name: true } } } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { progressPercent: true } }),
    ]);
    const names = await loadUserNames(this.prisma, pending.map((u) => u.submittedById));
    return {
      projectId: project.id,
      progressPercent: progress?.progressPercent ?? 0,
      phases,
      pendingUpdates: pending.map((u) => ({ ...u, phaseName: u.phase.name, submittedByName: names.get(u.submittedById) ?? null, phase: undefined })),
    };
  }

  async history(projectId: string, query: ProgressUpdatesQueryDto) {
    await findProjectOrThrow(this.prisma, projectId);
    const rows = await this.prisma.phaseProgressUpdate.findMany({
      where: { projectId, phaseId: query.phaseId, status: query.status },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { phase: { select: { name: true } } },
    });
    const names = await loadUserNames(this.prisma, rows.flatMap((r) => [r.submittedById, r.decidedById]));
    return rows.map((r) => ({
      ...r,
      phase: undefined,
      phaseName: r.phase.name,
      submittedByName: names.get(r.submittedById) ?? null,
      decidedByName: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
    }));
  }

  async submit(projectId: string, dto: SubmitProgressDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    assertSiteRole(await getSiteRole(this.prisma, projectId, actor), FIELD_WRITERS, "Seuls le superviseur et le conducteur de travaux déclarent l'avancement.");

    if (dto.clientRef) {
      const already = await this.prisma.phaseProgressUpdate.findFirst({ where: { projectId, clientRef: dto.clientRef } });
      if (already) return already;
    }

    const { created, phaseName } = await this.prisma.runInTransaction(async (tx) => {
      const phase = await tx.projectPhase.findFirst({ where: { id: dto.phaseId, projectId }, select: { name: true, isActive: true, progressPercent: true } });
      if (!phase || !phase.isActive) throw AppException.badRequest('INVALID_PHASE', "Cette étape n'existe pas ou n'est plus active.");

      const pendingForPhase = await tx.phaseProgressUpdate.count({ where: { phaseId: dto.phaseId, status: 'PENDING' } });
      if (pendingForPhase > 0) {
        throw AppException.conflict('PROGRESS_ALREADY_PENDING', "Un avancement est déjà en attente de validation pour cette étape.");
      }
      if (dto.percent === phase.progressPercent) {
        throw AppException.badRequest('NO_CHANGE', "Cet avancement est identique à l'avancement validé actuel.");
      }

      const row = await tx.phaseProgressUpdate.create({
        data: { projectId, phaseId: dto.phaseId, percent: dto.percent, note: dto.note?.trim() || null, submittedById: actor.userId, clientRef: dto.clientRef },
      });
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'PhaseProgressUpdate', entityId: row.id, newValue: { projectId, phaseId: dto.phaseId, percent: dto.percent, previous: phase.progressPercent } },
        tx,
      );
      return { created: row, phaseName: phase.name };
    });

    const message = `Avancement déclaré : « ${phaseName} » à ${dto.percent} % (${project.name}).`;
    // Les responsables techniques valident en premier ; sans responsable technique affecte, c'est le client.
    await this.notifier.toReviewers(projectId, { type: 'PROGRESS_SUBMITTED', title: 'Avancement à valider', message, path: '/progress' }, actor.userId);
    await this.notifier.toClient(project, { type: 'PROGRESS_SUBMITTED', title: 'Avancement déclaré', message, path: '/progress' });
    return created;
  }

  async decide(projectId: string, updateId: string, dto: DecideProgressDto, actor: AuthenticatedUser) {
    const project = await findProjectOrThrow(this.prisma, projectId);
    assertProjectOpenFor(actor, project.status);
    const role = await getSiteRole(this.prisma, projectId, actor);
    assertSiteRole(role, DECISION_MAKERS, "Votre fonction ne permet pas de valider l'avancement.");
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) throw AppException.badRequest('NOTE_REQUIRED', 'Indiquez le motif du refus.');

    const result = await this.prisma.runInTransaction(async (tx) => {
      const update = await tx.phaseProgressUpdate.findFirst({ where: { id: updateId, projectId }, include: { phase: { select: { name: true } } } });
      if (!update) throw AppException.notFound('Avancement');
      if (update.status !== 'PENDING') throw AppException.conflict('PROGRESS_ALREADY_DECIDED', 'Cet avancement a déjà été traité.');
      // Un responsable technique ne valide pas son propre avancement (le client et le superadmin le peuvent).
      if (update.submittedById === actor.userId && role !== 'CLIENT' && role !== 'SUPERADMIN') {
        throw AppException.forbidden('SELF_REVIEW', 'Vous ne pouvez pas valider votre propre déclaration.');
      }

      const done = await tx.phaseProgressUpdate.updateMany({
        where: { id: updateId, status: 'PENDING' },
        data: { status: dto.decision, decidedById: actor.userId, decidedAt: new Date(), decisionNote: dto.note?.trim() || null },
      });
      if (done.count !== 1) throw AppException.conflict('PROGRESS_ALREADY_DECIDED', 'Cet avancement a déjà été traité.');

      let projectPercent: number | null = null;
      if (dto.decision === 'VALIDATED') {
        // Une validation tardive d'une declaration plus ancienne ne doit pas ecraser un avancement plus recent deja valide.
        const newer = await tx.phaseProgressUpdate.count({ where: { phaseId: update.phaseId, status: 'VALIDATED', createdAt: { gt: update.createdAt } } });
        if (newer === 0) {
          await tx.projectPhase.update({ where: { id: update.phaseId }, data: { progressPercent: update.percent } });
          projectPercent = await this.recomputeProject(tx, projectId);
        }
      }
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: dto.decision === 'VALIDATED' ? 'APPROVE' : 'REJECT',
          entityType: 'PhaseProgressUpdate',
          entityId: updateId,
          oldValue: { status: 'PENDING' },
          newValue: { status: dto.decision, percent: update.percent, projectPercent },
          reason: dto.note,
        },
        tx,
      );
      return { update, projectPercent };
    });

    const verdict = dto.decision === 'VALIDATED' ? 'validé' : 'refusé';
    await this.notifier.toUser(result.update.submittedById, projectId, {
      type: 'PROGRESS_DECIDED',
      title: `Avancement ${verdict}`,
      message: `Votre avancement « ${result.update.phase.name} » à ${result.update.percent} % a été ${verdict}${dto.note ? ` : ${dto.note}` : '.'}`,
      path: '/progress',
    });
    return this.prisma.phaseProgressUpdate.findUnique({ where: { id: updateId } });
  }
}
