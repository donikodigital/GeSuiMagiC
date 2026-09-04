// backend/src/projects/projects.service.ts - v1.4
// Injection de StorageService (nouveau constructeur) pour nettoyer les
// fichiers physiques sur R2 lors de remove() - avant, seules les lignes
// Attachment en base etaient supprimees, laissant les fichiers orphelins
// sur le bucket. On recupere la liste des attachments du projet AVANT la
// transaction (deleteByUrl fait un appel reseau externe, a garder hors
// transaction DB comme le fait deja AttachmentsService.remove), puis on
// appelle deleteByUrl pour chacun juste avant de commit la suppression
// des lignes correspondantes. deleteByUrl avale deja ses propres erreurs
// (voir storage.service.ts - log un warning et continue) donc un fichier
// introuvable cote R2 ne bloque pas la suppression du projet.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectFinancialsDto } from './dto/update-project-financials.dto';
import { ProjectQueryDto } from './dto/project-query.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateProjectDto, clientId: string, actor: AuthenticatedUser) {
    const currency = dto.currency ?? 'GNF';

    const project = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          clientId,
          name: dto.name,
          description: dto.description,
          motif: dto.motif,
          constructionType: dto.constructionType,
          location: dto.location,
          city: dto.city,
          country: dto.country,
          surfaceArea: dto.surfaceArea,
          roomCount: dto.roomCount,
          projectType: dto.projectType,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          estimatedDurationDays: dto.estimatedDurationDays,
          estimatedCost: dto.estimatedCost,
          budget: dto.budget,
          currency,
          status: ProjectStatus.DRAFT,
          autoApproveExpenses: dto.autoApproveExpenses,
          expenseApprovalThreshold: dto.expenseApprovalThreshold,
        },
      });

      await this.wallets.createForProject(created.id, currency, tx);

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Project',
          entityId: created.id,
          newValue: { name: created.name, budget: created.budget, currency, clientId },
        },
        tx,
      );

      return created;
    });

    return project;
  }

  async findAll(query: ProjectQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProjectWhereInput = {
      clientId: actor.role === 'CLIENT' ? actor.clientProfileId : query.clientId,
      city: query.city,
      country: query.country,
      status: query.status,
      ...(actor.role === 'SUPERVISOR'
        ? { supervisors: { some: { supervisorId: actor.supervisorProfileId, status: 'ACTIVE' } } }
        : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as Prisma.QueryMode } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { wallet: true, client: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        wallet: true,
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        supervisors: {
          where: { status: 'ACTIVE' },
          include: { supervisor: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        },
      },
    });
    if (!project) throw AppException.notFound('Projet');
    return project;
  }

  async updateNonFinancial(id: string, dto: UpdateProjectDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.project.findUniqueOrThrow({ where: { id } });

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  async updateFinancials(id: string, dto: UpdateProjectFinancialsDto, actor: AuthenticatedUser) {
    if (actor.role === 'CLIENT') {
      const allowedForClient: (keyof UpdateProjectFinancialsDto)[] = ['budget', 'autoApproveExpenses', 'expenseApprovalThreshold'];
      const attemptedForbidden = Object.keys(dto).some((k) => !allowedForClient.includes(k as keyof UpdateProjectFinancialsDto));
      if (attemptedForbidden) {
        throw AppException.badRequest('FORBIDDEN_FIELD', "Seul le superadmin peut modifier la devise ou le cout estimatif d'un projet.");
      }
    }

    const existing = await this.prisma.project.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.project.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      oldValue: { budget: existing.budget, currency: existing.currency, autoApproveExpenses: existing.autoApproveExpenses, expenseApprovalThreshold: existing.expenseApprovalThreshold },
      newValue: dto,
      reason: 'Mise a jour des parametres financiers du projet',
    });

    return updated;
  }

  async updateStatus(id: string, status: ProjectStatus, actor: AuthenticatedUser) {
    const existing = await this.prisma.project.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.project.update({
      where: { id },
      data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : existing.archivedAt },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status },
    });

    return updated;
  }

  async assignSupervisor(projectId: string, supervisorId: string, actor: AuthenticatedUser) {
    const supervisor = await this.prisma.supervisorProfile.findUnique({ where: { id: supervisorId } });
    if (!supervisor) throw AppException.notFound('Superviseur');

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (supervisor.clientId !== project.clientId) throw AppException.forbiddenProjectAccess();

    const assignment = await this.prisma.projectSupervisor.upsert({
      where: { projectId_supervisorId: { projectId, supervisorId } },
      update: { status: 'ACTIVE', revokedAt: null },
      create: { projectId, supervisorId, status: 'ACTIVE' },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'CREATE',
      entityType: 'ProjectSupervisor',
      entityId: assignment.id,
      newValue: { projectId, supervisorId },
    });

    return assignment;
  }

  async revokeSupervisor(projectId: string, supervisorId: string, actor: AuthenticatedUser) {
    const assignment = await this.prisma.projectSupervisor.findUnique({
      where: { projectId_supervisorId: { projectId, supervisorId } },
    });
    if (!assignment) throw AppException.notFound('Affectation');

    const updated = await this.prisma.projectSupervisor.update({
      where: { id: assignment.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'ProjectSupervisor',
      entityId: assignment.id,
      oldValue: { status: 'ACTIVE' },
      newValue: { status: 'REVOKED' },
    });

    return updated;
  }

  async listSupervisors(projectId: string) {
    return this.prisma.projectSupervisor.findMany({
      where: { projectId, status: 'ACTIVE' },
      include: { supervisor: true },
    });
  }

  /**
   * Suppression definitive d'un projet (bouton reglages - visible cote
   * front pour CLIENT et SUPERADMIN, uniquement tant que le projet n'a
   * aucune donnee financiere enregistree). Verification refaite ici cote
   * serveur : compte les Deposit/Expense lies au projet, quel que soit
   * leur statut - jamais se fier au seul masquage du bouton. Recupere les
   * attachments AVANT la transaction pour nettoyer les fichiers R2 (appel
   * reseau externe, ne doit pas etre dans la transaction DB).
   */
  async remove(id: string, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw AppException.notFound('Projet');

    const [depositCount, expenseCount] = await Promise.all([
      this.prisma.deposit.count({ where: { projectId: id } }),
      this.prisma.expense.count({ where: { projectId: id } }),
    ]);

    if (depositCount > 0 || expenseCount > 0) {
      throw AppException.badRequest(
        'PROJECT_HAS_DATA',
        'Ce projet a déjà des dépôts ou des dépenses enregistrés et ne peut plus être supprimé.',
      );
    }

    const attachments = await this.prisma.attachment.findMany({ where: { projectId: id }, select: { fileUrl: true } });
    for (const attachment of attachments) {
      await this.storage.deleteByUrl(attachment.fileUrl);
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.setting.deleteMany({ where: { projectId: id } });
      await tx.projectSupervisor.deleteMany({ where: { projectId: id } });
      await tx.attachment.deleteMany({ where: { projectId: id } });
      await tx.wallet.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Project',
          entityId: id,
          oldValue: { name: project.name, status: project.status },
          reason: "Suppression du projet (aucune donnée financière enregistrée)",
        },
        tx,
      );
    });

    return { removed: true };
  }
}