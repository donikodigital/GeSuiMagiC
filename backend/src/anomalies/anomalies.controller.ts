//backend/src/anomalies/anomalies.controller.ts
import { Body, Controller, Get, Injectable, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/exceptions/app.exception';
import { CreateAnomalyDto } from './dto/create-anomaly.dto';
import { UpdateAnomalyStatusDto } from './dto/update-anomaly-status.dto';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { buildPaginationMeta, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AnomaliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async create(projectId: string, dto: CreateAnomalyDto, actor: AuthenticatedUser) {
    if (actor.role !== 'CLIENT' || !actor.clientProfileId) throw AppException.forbiddenProjectAccess();

    const anomaly = await this.prisma.anomaly.create({
      data: {
        projectId,
        clientId: actor.clientProfileId,
        reportedById: actor.userId,
        category: dto.category,
        relatedExpenseId: dto.relatedExpenseId,
        description: dto.description,
        status: 'OPEN',
      },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'CREATE',
      entityType: 'Anomaly',
      entityId: anomaly.id,
      newValue: { projectId, category: dto.category },
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const superadmins = await this.prisma.user.findMany({ where: { role: 'SUPERADMIN', status: 'ACTIVE' } });
    for (const admin of superadmins) {
      await this.notifications.send({
        userId: admin.id,
        type: 'ANOMALY_REPORTED',
        title: 'Nouvelle anomalie signalee',
        message: `Une anomalie a ete signalee sur le projet "${project.name}".`,
        emailHtml: emailTemplates.anomalyReported(
          admin.email,
          project.name,
          dto.description,
          `${this.config.get<string>('frontendUrl')}/admin/anomalies/${anomaly.id}`,
        ),
        emailSubject: 'Nouvelle anomalie signalee',
      });
    }

    return anomaly;
  }

  async findAllForProject(projectId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.anomaly.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.anomaly.count({ where: { projectId } }),
    ]);
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async findAllForSuperadmin(query: AnomalyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.anomaly.findMany({
        where,
        include: { project: { select: { name: true } }, client: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.anomaly.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async updateStatus(id: string, dto: UpdateAnomalyStatusDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.anomaly.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.anomaly.update({ where: { id }, data: { status: dto.status, resolutionNote: dto.resolutionNote } });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Anomaly',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status, resolutionNote: dto.resolutionNote },
    });

    const client = await this.prisma.clientProfile.findUniqueOrThrow({ where: { id: existing.clientId } });
    await this.notifications.send({
      userId: client.userId,
      type: 'ANOMALY_UPDATED',
      title: 'Mise a jour de votre signalement',
      message: `Le statut de votre signalement est maintenant : ${dto.status}.`,
    });

    return updated;
  }
}

@Controller('projects/:projectId/anomalies')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProjectAnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Post()
  @Roles(UserRole.CLIENT)
  async create(@Param('projectId') projectId: string, @Body() dto: CreateAnomalyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.anomaliesService.create(projectId, dto, actor);
  }

  @Get()
  async findAll(@Param('projectId') projectId: string, @Query() query: PaginationQueryDto) {
    return this.anomaliesService.findAllForProject(projectId, query);
  }
}

@Controller('anomalies')
@Roles(UserRole.SUPERADMIN)
export class AnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Get()
  async findAll(@Query() query: AnomalyQueryDto) {
    return this.anomaliesService.findAllForSuperadmin(query);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateAnomalyStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.anomaliesService.updateStatus(id, dto, actor);
  }
}