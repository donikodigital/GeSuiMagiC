//backend/src/supervisors/supervisors.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { invalidateIdentity } from '../auth/auth-cache';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';
import { UpdateOwnSupervisorProfileDto } from './dto/update-own-profile.dto';

@Injectable()
export class SupervisorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateSupervisorDto, clientId: string, actor: AuthenticatedUser) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw AppException.conflict('EMAIL_ALREADY_USED', 'Cet email est deja utilise par un compte existant.');

    const { user, profile } = await this.prisma.runInTransaction(async (tx) => {
      const createdUser = await tx.user.create({ data: { email, role: 'SUPERVISOR', status: 'INVITED' } });

      const createdProfile = await tx.supervisorProfile.create({
        data: {
          userId: createdUser.id,
          clientId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          address: dto.address,
          profession: dto.profession,
          phone: dto.phone,
          photoUrl: dto.photoUrl,
          idDocumentUrl: dto.idDocumentUrl,
          notes: dto.notes,
        },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Supervisor',
          entityId: createdProfile.id,
          newValue: { email: createdUser.email, firstName: dto.firstName, lastName: dto.lastName, clientId },
        },
        tx,
      );

      return { user: createdUser, profile: createdProfile };
    });

    await this.authService.createInvitation(user.id);

    return this.findOne(profile.id, actor);
  }

  /**
   * Liste des superviseurs. `clientId` est OBLIGATOIRE pour un client (fail-closed) : avant, un profil client
   * absent donnait `clientId: undefined`, que Prisma ignore -> les superviseurs de TOUS les clients.
   */
  async findAll(actor: AuthenticatedUser, query: { page: number; limit: number; search?: string }) {
    let clientId: string | undefined;
    if (actor.role === 'CLIENT') {
      if (!actor.clientProfileId) throw AppException.forbiddenProjectAccess();
      clientId = actor.clientProfileId;
    } else if (actor.role !== 'SUPERADMIN') {
      throw AppException.forbiddenProjectAccess();
    }

    const where: Prisma.SupervisorProfileWhereInput = {
      clientId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supervisorProfile.findMany({
        where,
        include: {
          user: { select: { email: true, status: true, lastLoginAt: true } },
          projectAssignments: { where: { status: 'ACTIVE' }, include: { project: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.supervisorProfile.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const supervisor = await this.prisma.supervisorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, status: true, lastLoginAt: true } },
        projectAssignments: { where: { status: 'ACTIVE' }, include: { project: { select: { id: true, name: true, status: true } } } },
      },
    });
    if (!supervisor) throw AppException.notFound('Superviseur');

    // Isolation multi-tenant (fail-closed) : un client ne consulte que SES superviseurs, un superviseur que lui-meme.
    if (actor.role === 'CLIENT' && (!actor.clientProfileId || supervisor.clientId !== actor.clientProfileId)) {
      throw AppException.forbiddenProjectAccess();
    }
    if (actor.role === 'SUPERVISOR' && (!actor.supervisorProfileId || supervisor.id !== actor.supervisorProfileId)) {
      throw AppException.forbiddenProjectAccess();
    }

    return supervisor;
  }

  async update(id: string, dto: UpdateSupervisorDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);
    const updated = await this.prisma.supervisorProfile.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Supervisor',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  /** Section equivalente au client : le superviseur ne peut modifier que certaines informations personnelles. */
  async updateOwnProfile(supervisorProfileId: string, dto: UpdateOwnSupervisorProfileDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.supervisorProfile.findUnique({ where: { id: supervisorProfileId } });
    if (!existing) throw AppException.notFound('Superviseur');
    const updated = await this.prisma.supervisorProfile.update({ where: { id: supervisorProfileId }, data: dto });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Supervisor',
      entityId: supervisorProfileId,
      oldValue: { phone: existing.phone, address: existing.address, profession: existing.profession },
      newValue: dto,
    });

    return updated;
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED', actor: AuthenticatedUser) {
    const supervisor = await this.findOne(id, actor);

    const account = await this.prisma.user.findUnique({ where: { id: supervisor.userId }, select: { passwordHash: true, status: true } });
    if (!account) throw AppException.notFound('Superviseur');

    // Un compte qui n'a jamais ete active (pas de mot de passe) ne peut pas passer "ACTIVE" : il revient a
    // "INVITED" pour pouvoir terminer l'activation par le lien d'invitation. Avant, il devenait ACTIVE sans mot
    // de passe : connexion impossible ET lien d'invitation inutilisable (compte bloque).
    const nextStatus = status === 'ACTIVE' && !account.passwordHash ? 'INVITED' : status;

    await this.prisma.runInTransaction(async (tx) => {
      await tx.user.update({
        where: { id: supervisor.userId },
        // Compte desactive/suspendu : la session de refresh est revoquee immediatement.
        data: { status: nextStatus, ...(nextStatus === 'ACTIVE' || nextStatus === 'INVITED' ? {} : { refreshTokenHash: null }) },
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Supervisor',
          entityId: id,
          oldValue: { status: account.status },
          newValue: { status: nextStatus },
          reason: `Changement de statut du superviseur -> ${nextStatus}`,
        },
        tx,
      );
    });
    invalidateIdentity(supervisor.userId);

    return this.findOne(id, actor);
  }

  /** Renvoie le lien d'invitation d'un superviseur qui n'a pas encore active son compte (lien perdu ou expire). */
  async resendInvitation(id: string, actor: AuthenticatedUser) {
    const supervisor = await this.findOne(id, actor);
    if (supervisor.user.status !== 'INVITED') {
      throw AppException.badRequest('SUPERVISOR_ALREADY_ACTIVE', 'Ce superviseur a déjà activé son compte.');
    }

    await this.authService.createInvitation(supervisor.userId);

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Supervisor',
      entityId: id,
      reason: "Renvoi du lien d'invitation (compte toujours au statut INVITED)",
    });

    return { sent: true };
  }
}
