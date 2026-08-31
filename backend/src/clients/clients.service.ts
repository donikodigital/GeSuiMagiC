//backend/src/clients/clients.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateOwnClientProfileDto } from './dto/update-own-profile.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Section 7-8 : creation d'un client (+ premier projet optionnel) + invitation securisee. */
  async create(dto: CreateClientDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (existing) throw AppException.conflict('EMAIL_ALREADY_USED', 'Cet email est déjà utilisé par un compte existant.');

    const { user, clientProfile } = await this.prisma.runInTransaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email.toLowerCase().trim(), role: 'CLIENT', status: 'INVITED' },
      });

      const createdProfile = await tx.clientProfile.create({
        data: {
          userId: createdUser.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          profession: dto.profession,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          companyName: dto.companyName,
          companyAddress: dto.companyAddress,
          taxId: dto.taxId,
        },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Client',
          entityId: createdProfile.id,
          newValue: { email: createdUser.email, firstName: dto.firstName, lastName: dto.lastName },
        },
        tx,
      );

      return { user: createdUser, clientProfile: createdProfile };
    });

    if (dto.firstProject) {
      await this.projectsService.create(
        { ...dto.firstProject },
        clientProfile.id,
        actor,
      );
    }

    // Envoi de l'invitation APRES le commit de la transaction (effet de bord externe).
    await this.authService.createInvitation(user.id);

    return this.findOne(clientProfile.id);
  }

  async findAll(query: { page: number; limit: number; search?: string }) {
    const where: Prisma.ClientProfileWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.clientProfile.findMany({
        where,
        include: { user: { select: { email: true, status: true, lastLoginAt: true } }, _count: { select: { projects: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.clientProfile.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async findOne(id: string) {
    const client = await this.prisma.clientProfile.findUnique({
      where: { id },
      include: { user: { select: { email: true, status: true, lastLoginAt: true, createdAt: true } }, _count: { select: { projects: true, supervisors: true } } },
    });
    if (!client) throw AppException.notFound('Client');
    return client;
  }

  /** Section 4.1 : le superadmin peut modifier les informations d'un client. */
  async update(id: string, dto: UpdateClientDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.clientProfile.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Client',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  /** Section 5 : le client ne peut modifier que certaines informations personnelles. */
  async updateOwnProfile(clientProfileId: string, dto: UpdateOwnClientProfileDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    const updated = await this.prisma.clientProfile.update({ where: { id: clientProfileId }, data: dto });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Client',
      entityId: clientProfileId,
      oldValue: { phone: existing.phone, address: existing.address, city: existing.city, profession: existing.profession },
      newValue: dto,
    });

    return updated;
  }

  async setSuspended(id: string, suspended: boolean, actor: AuthenticatedUser) {
    const existing = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.clientProfile.update({ where: { id }, data: { isActive: !suspended } });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: suspended ? 'UPDATE' : 'UPDATE',
      entityType: 'Client',
      entityId: id,
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: !suspended },
      reason: suspended ? 'Suspension du client par le superadmin' : 'Reactivation du client par le superadmin',
    });

    return updated;
  }
}
