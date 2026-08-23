import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';

@Injectable()
export class SupervisorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateSupervisorDto, clientId: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (existing) throw AppException.conflict('EMAIL_ALREADY_USED', 'Cet email est deja utilise par un compte existant.');

    const { user, profile } = await this.prisma.runInTransaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email.toLowerCase().trim(), role: 'SUPERVISOR', status: 'INVITED' },
      });

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

  async findAll(clientId: string | undefined, query: { page: number; limit: number; search?: string }) {
    const where = {
      clientId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
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

    // Isolation multi-tenant : un client ne peut consulter que ses propres superviseurs.
    if (actor.role === 'CLIENT' && supervisor.clientId !== actor.clientProfileId) {
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

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED', actor: AuthenticatedUser) {
    const supervisor = await this.findOne(id, actor);
    await this.prisma.user.update({ where: { id: supervisor.userId }, data: { status } });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Supervisor',
      entityId: id,
      newValue: { status },
      reason: `Changement de statut du superviseur -> ${status}`,
    });

    return this.findOne(id, actor);
  }
}
