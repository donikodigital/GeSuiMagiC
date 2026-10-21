//backend/src/projects/projects.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { projectAccessFilter } from '../common/utils/project-access.util';
import { roundMoney } from '../common/utils/money.util';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectFinancialsDto } from './dto/update-project-financials.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { createDefaultPhases } from '../attendance/attendance.constants';

/** Verifie la coherence des dates d'un projet (fin >= debut). */
function assertDateRange(start?: Date | null, end?: Date | null) {
  if (start && end && end < start) {
    throw AppException.badRequest('INVALID_DATE_RANGE', 'La date de fin doit être postérieure à la date de début.');
  }
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateProjectDto, clientId: string, actor: AuthenticatedUser) {
    // Un superadmin cree "pour le compte de" un client : ce client doit exister.
    const owner = await this.prisma.clientProfile.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!owner) throw AppException.badRequest('CLIENT_NOT_FOUND', 'Client introuvable.');

    return this.prisma.runInTransaction((tx) => this.createWithin(tx, dto, clientId, actor));
  }

  /**
   * Creation du projet + portefeuille + audit dans une transaction EXISTANTE.
   * Utilisee par ClientsService pour creer le client et son premier projet de facon atomique
   * (avant : un echec de creation du projet laissait un client cree sans invitation envoyee).
   */
  async createWithin(tx: TxClient, dto: CreateProjectDto, clientId: string, actor: AuthenticatedUser) {
    const currency = dto.currency ?? 'GNF';
    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    assertDateRange(startDate, endDate);

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
        startDate,
        endDate,
        estimatedDurationDays: dto.estimatedDurationDays,
        estimatedCost: dto.estimatedCost,
        budget: roundMoney(dto.budget),
        currency,
        status: ProjectStatus.DRAFT,
        autoApproveExpenses: dto.autoApproveExpenses,
        expenseApprovalThreshold: dto.expenseApprovalThreshold,
      },
    });

    await this.wallets.createForProject(created.id, currency, tx);
    await createDefaultPhases(tx, created.id);

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
  }

  async findAll(query: ProjectQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Perimetre de l'acteur (fail-closed) + filtres. Avant, un profil manquant produisait `clientId: undefined`
    // que Prisma ignore : la liste renvoyait alors les projets de TOUS les clients.
    const where: Prisma.ProjectWhereInput = {
      AND: [
        projectAccessFilter(actor),
        {
          clientId: actor.role === 'SUPERADMIN' ? query.clientId : undefined,
          city: query.city,
          country: query.country,
          status: query.status,
          ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as Prisma.QueryMode } } : {}),
        },
      ],
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
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Projet');

      const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
      const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
      assertDateRange(startDate ?? existing.startDate, endDate ?? existing.endDate);

      const updated = await tx.project.update({
        where: { id },
        data: { ...dto, startDate, endDate },
      });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Project', entityId: id, oldValue: existing, newValue: updated },
        tx,
      );
      return updated;
    });
  }

  async updateFinancials(id: string, dto: UpdateProjectFinancialsDto, actor: AuthenticatedUser) {
    if (actor.role === 'CLIENT') {
      const allowedForClient: (keyof UpdateProjectFinancialsDto)[] = ['budget', 'autoApproveExpenses', 'expenseApprovalThreshold'];
      const attemptedForbidden = Object.keys(dto).some((k) => !allowedForClient.includes(k as keyof UpdateProjectFinancialsDto));
      if (attemptedForbidden) {
        throw AppException.badRequest('FORBIDDEN_FIELD', "Seul le superadmin peut modifier la devise ou le cout estimatif d'un projet.");
      }
    }

    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Projet');

      const currencyChanges = dto.currency !== undefined && dto.currency !== existing.currency;
      if (currencyChanges) {
        // Les montants ne sont jamais convertis : changer la devise d'un projet qui a deja des operations
        // les relabelliserait silencieusement (1 000 000 GNF deviendrait 1 000 000 EUR).
        const [deposits, expenses] = await Promise.all([
          tx.deposit.count({ where: { projectId: id } }),
          tx.expense.count({ where: { projectId: id } }),
        ]);
        if (deposits > 0 || expenses > 0) {
          throw AppException.conflict('CURRENCY_LOCKED', 'La devise ne peut plus être modifiée : ce projet a déjà des dépôts ou des dépenses.');
        }
      }

      const updated = await tx.project.update({
        where: { id },
        data: { ...dto, budget: dto.budget !== undefined ? roundMoney(dto.budget) : undefined },
      });
      // La devise du portefeuille suit celle du projet.
      if (currencyChanges) await tx.wallet.update({ where: { projectId: id }, data: { currency: dto.currency } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Project',
          entityId: id,
          oldValue: {
            budget: existing.budget,
            currency: existing.currency,
            autoApproveExpenses: existing.autoApproveExpenses,
            expenseApprovalThreshold: existing.expenseApprovalThreshold,
          },
          newValue: dto,
          reason: 'Mise a jour des parametres financiers du projet',
        },
        tx,
      );
      return updated;
    });
  }

  async updateStatus(id: string, status: ProjectStatus, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Projet');
      if (existing.status === status) return existing;

      const updated = await tx.project.update({
        where: { id },
        // archivedAt suit le statut (avant, il restait renseigne apres un desarchivage).
        data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
      });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Project', entityId: id, oldValue: { status: existing.status }, newValue: { status } },
        tx,
      );
      return updated;
    });
  }

  async assignSupervisor(projectId: string, supervisorId: string, actor: AuthenticatedUser) {
    const supervisor = await this.prisma.supervisorProfile.findUnique({ where: { id: supervisorId } });
    if (!supervisor) throw AppException.notFound('Superviseur');

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppException.notFound('Projet');
    // Un superviseur ne peut etre affecte qu'aux projets de SON client.
    if (supervisor.clientId !== project.clientId) throw AppException.forbiddenProjectAccess();

    return this.prisma.runInTransaction(async (tx) => {
      const assignment = await tx.projectSupervisor.upsert({
        where: { projectId_supervisorId: { projectId, supervisorId } },
        update: { status: 'ACTIVE', revokedAt: null },
        create: { projectId, supervisorId, status: 'ACTIVE' },
      });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ProjectSupervisor', entityId: assignment.id, newValue: { projectId, supervisorId } },
        tx,
      );
      return assignment;
    });
  }

  async revokeSupervisor(projectId: string, supervisorId: string, actor: AuthenticatedUser) {
    const result = await this.prisma.runInTransaction(async (tx) => {
      const assignment = await tx.projectSupervisor.findUnique({ where: { projectId_supervisorId: { projectId, supervisorId } } });
      if (!assignment) throw AppException.notFound('Affectation');

      const updated = await tx.projectSupervisor.update({
        where: { id: assignment.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      // Les depots encore en attente de CE superviseur ne peuvent plus etre decides par lui (acces retire) :
      // on le signale a l'appelant pour qu'ils soient traites par le superadmin.
      const pendingDeposits = await tx.deposit.count({ where: { projectId, supervisorId, status: 'PENDING' } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'ProjectSupervisor',
          entityId: assignment.id,
          oldValue: { status: assignment.status },
          newValue: { status: 'REVOKED', pendingDeposits },
        },
        tx,
      );
      return { ...updated, pendingDeposits };
    });

    return result;
  }

  /** Superviseurs actifs du projet. Profil reduit : pas de piece d'identite ni de notes internes. */
  async listSupervisors(projectId: string) {
    return this.prisma.projectSupervisor.findMany({
      where: { projectId, status: 'ACTIVE' },
      include: { supervisor: { select: { id: true, firstName: true, lastName: true, phone: true, profession: true, photoUrl: true } } },
    });
  }

  /**
   * Suppression definitive d'un projet (bouton reglages - visible cote
   * front pour CLIENT et SUPERADMIN, uniquement tant que le projet n'a
   * aucune donnee financiere enregistree). Verification refaite ici cote
   * serveur, DANS la transaction : compte les Deposit/Expense lies au
   * projet, quel que soit leur statut - jamais se fier au seul masquage du
   * bouton. Les fichiers du stockage ne sont supprimes qu'APRES le commit
   * (avant, ils l'etaient avant : un echec de la transaction laissait des
   * pieces jointes en base sans leur fichier).
   */
  async remove(id: string, actor: AuthenticatedUser) {
    const fileUrls = await this.prisma.runInTransaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id } });
      if (!project) throw AppException.notFound('Projet');

      const [depositCount, expenseCount] = await Promise.all([
        tx.deposit.count({ where: { projectId: id } }),
        tx.expense.count({ where: { projectId: id } }),
      ]);
      if (depositCount > 0 || expenseCount > 0) {
        throw AppException.badRequest('PROJECT_HAS_DATA', 'Ce projet a déjà des dépôts ou des dépenses enregistrés et ne peut plus être supprimé.');
      }

      const attachments = await tx.attachment.findMany({ where: { projectId: id }, select: { fileUrl: true } });

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
          reason: 'Suppression du projet (aucune donnée financière enregistrée)',
        },
        tx,
      );
      return attachments.map((a) => a.fileUrl);
    });

    // deleteByUrl avale ses propres erreurs (log + continue).
    for (const fileUrl of fileUrls) {
      await this.storage.deleteByUrl(fileUrl);
    }

    return { removed: true };
  }
}
