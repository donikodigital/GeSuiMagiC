//backend/src/attendance/phases.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { summarizeByPhase } from './attendance.calc';
import { createDefaultPhases } from './attendance.constants';
import { findProjectOrThrow } from './attendance.helpers';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { ReorderPhasesDto } from './dto/reorder-phases.dto';

/**
 * Etapes du chantier (Fondation, Murs, Toiture...), configurables par projet.
 * Le client, ses superviseurs affectes et le superadmin peuvent les gerer ; une etape deja
 * utilisee par un jour travaille ne peut plus etre supprimee (seulement desactivee), pour ne
 * jamais perdre l'historique des jours.
 */
@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Etapes du projet, dans l'ordre, avec jours travailles et jours-ouvriers cumules. */
  async list(projectId: string) {
    await findProjectOrThrow(this.prisma, projectId);
    return this.listWithStats(projectId);
  }

  private async listWithStats(projectId: string) {
    const [phases, rows] = await Promise.all([
      this.prisma.projectPhase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.workDay.findMany({
        where: { projectId, isWorked: true },
        select: { date: true, isWorked: true, workersCount: true, phaseId: true },
      }),
    ]);
    const stats = new Map(summarizeByPhase(rows, phases).map((s) => [s.phaseId, s]));
    return phases.map((phase) => {
      const s = stats.get(phase.id)!;
      return { ...phase, workedDays: s.workedDays, workerDays: s.workerDays, firstDate: s.firstDate, lastDate: s.lastDate };
    });
  }

  async create(projectId: string, dto: CreatePhaseDto, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);
    const name = dto.name.trim();

    return this.prisma.runInTransaction(async (tx) => {
      const clash = await tx.projectPhase.findFirst({
        where: { projectId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (clash) throw AppException.conflict('PHASE_NAME_TAKEN', 'Une étape porte déjà ce nom.');

      const last = await tx.projectPhase.aggregate({ where: { projectId }, _max: { position: true } });
      const created = await tx.projectPhase.create({ data: { projectId, name, position: (last._max.position ?? -1) + 1 } });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectPhase', entityId: created.id, newValue: { projectId, name } },
        tx,
      );
      return created;
    });
  }

  /** Etapes par defaut, pour un projet cree avant l'existence du suivi (aucune etape). */
  async createDefaults(projectId: string, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);

    await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.projectPhase.count({ where: { projectId } });
      if (existing > 0) throw AppException.conflict('PHASES_ALREADY_EXIST', 'Ce projet a déjà des étapes.');
      await createDefaultPhases(tx, projectId);
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectPhase', entityId: projectId, newValue: { defaults: true } },
        tx,
      );
    });
    return this.listWithStats(projectId);
  }

  async update(projectId: string, phaseId: string, dto: UpdatePhaseDto, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId } });
      if (!phase) throw AppException.notFound('Étape');

      const name = dto.name?.trim();
      if (name && name.toLowerCase() !== phase.name.toLowerCase()) {
        const clash = await tx.projectPhase.findFirst({
          where: { projectId, id: { not: phaseId }, name: { equals: name, mode: 'insensitive' } },
          select: { id: true },
        });
        if (clash) throw AppException.conflict('PHASE_NAME_TAKEN', 'Une étape porte déjà ce nom.');
      }

      const updated = await tx.projectPhase.update({
        where: { id: phaseId },
        data: { name: name ?? undefined, isActive: dto.isActive },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'ProjectPhase',
          entityId: phaseId,
          oldValue: { name: phase.name, isActive: phase.isActive },
          newValue: { name: updated.name, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }

  async reorder(projectId: string, dto: ReorderPhasesDto, actor: AuthenticatedUser) {
    await findProjectOrThrow(this.prisma, projectId);

    await this.prisma.runInTransaction(async (tx) => {
      const phases = await tx.projectPhase.findMany({ where: { projectId }, select: { id: true } });
      const known = new Set(phases.map((p) => p.id));
      if (phases.length !== dto.orderedIds.length || dto.orderedIds.some((id) => !known.has(id))) {
        throw AppException.badRequest('PHASES_MISMATCH', "La liste doit contenir toutes les étapes du projet, une seule fois chacune.");
      }

      for (const [position, id] of dto.orderedIds.entries()) {
        await tx.projectPhase.update({ where: { id }, data: { position } });
      }
      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'ProjectPhase', entityId: projectId, newValue: { orderedIds: dto.orderedIds } },
        tx,
      );
    });
    return this.listWithStats(projectId);
  }

  async remove(projectId: string, phaseId: string, actor: AuthenticatedUser) {
    await this.prisma.runInTransaction(async (tx) => {
      const phase = await tx.projectPhase.findFirst({ where: { id: phaseId, projectId } });
      if (!phase) throw AppException.notFound('Étape');

      const used = await tx.workDay.count({ where: { phaseId } });
      if (used > 0) {
        throw AppException.conflict('PHASE_IN_USE', `Cette étape est utilisée par ${used} jour(s) : désactivez-la plutôt que de la supprimer.`);
      }

      await tx.projectPhase.delete({ where: { id: phaseId } });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'ProjectPhase',
          entityId: phaseId,
          oldValue: { projectId, name: phase.name },
        },
        tx,
      );
    });
    return { removed: true };
  }
}
