//backend/src/anomalies/anomalies.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateAnomalyDto } from './dto/create-anomaly.dto';
import { UpdateAnomalyStatusDto } from './dto/update-anomaly-status.dto';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';

/**
 * Signalements d'anomalies (section 62).
 *
 * Le client signale ; le superadmin traite. Les notifications partent APRES
 * la validation de la transaction et ne peuvent jamais faire echouer
 * l'operation (voir NotificationsService).
 */
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

    // Le projet doit appartenir au client (defense en profondeur en plus du guard).
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId: actor.clientProfileId },
      select: { id: true, name: true, clientId: true },
    });
    if (!project) throw AppException.forbiddenProjectAccess();

    // Une depense liee doit appartenir a CE projet (sinon on pouvait referencer
    // la depense d'un autre client).
    if (dto.relatedExpenseId) {
      const expense = await this.prisma.expense.findFirst({
        where: { id: dto.relatedExpenseId, projectId },
        select: { id: true },
      });
      if (!expense) throw AppException.badRequest('INVALID_RELATED_EXPENSE', 'La depense indiquee n\'appartient pas a ce projet.');
    }

    const anomaly = await this.prisma.$transaction(async (tx) => {
      const created = await tx.anomaly.create({
        data: {
          projectId,
          clientId: project.clientId,
          reportedById: actor.userId,
          category: dto.category,
          relatedExpenseId: dto.relatedExpenseId,
          description: dto.description,
          status: 'OPEN',
        },
      });
      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'CREATE',
          entityType: 'Anomaly',
          entityId: created.id,
          newValue: { projectId, category: dto.category, relatedExpenseId: dto.relatedExpenseId ?? null },
        },
        tx,
      );
      return created;
    });

    await this.notifySuperadmins(project.name, dto.description);
    return anomaly;
  }

  async findAllForProject(projectId: string, query: AnomalyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.AnomalyWhereInput = { projectId, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.anomaly.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.anomaly.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async findAllForSuperadmin(query: AnomalyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.AnomalyWhereInput = query.status ? { status: query.status } : {};
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
    const { updated, clientUserId } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.anomaly.findUnique({
        where: { id },
        include: { client: { select: { userId: true } } },
      });
      if (!existing) throw AppException.notFound('Anomaly');

      const result = await tx.anomaly.update({
        where: { id },
        data: { status: dto.status, resolutionNote: dto.resolutionNote ?? existing.resolutionNote },
      });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Anomaly',
          entityId: id,
          oldValue: { status: existing.status, resolutionNote: existing.resolutionNote },
          newValue: { status: result.status, resolutionNote: result.resolutionNote },
        },
        tx,
      );
      return { updated: result, clientUserId: existing.client.userId };
    });

    await this.notifications.send({
      userId: clientUserId,
      type: 'ANOMALY_UPDATED',
      title: 'Mise a jour de votre signalement',
      message: `Le statut de votre signalement est maintenant : ${dto.status}.`,
    });

    return updated;
  }

  private async notifySuperadmins(projectName: string, description: string): Promise<void> {
    try {
      const superadmins = await this.prisma.user.findMany({
        where: { role: 'SUPERADMIN', status: 'ACTIVE' },
        select: { id: true, email: true },
      });
      // Lien vers la vraie page liste /anomalies (il n'existe pas de route par identifiant).
      const url = `${this.config.get<string>('frontendUrl')}/anomalies`;
      await this.notifications.sendMany(
        superadmins.map((admin) => ({
          userId: admin.id,
          type: 'ANOMALY_REPORTED' as const,
          title: 'Nouvelle anomalie signalee',
          message: `Une anomalie a ete signalee sur le projet "${projectName}".`,
          emailHtml: emailTemplates.anomalyReported(admin.email, projectName, description, url),
          emailSubject: 'Nouvelle anomalie signalee',
        })),
      );
    } catch {
      // Effet secondaire : ne doit jamais faire echouer le signalement deja enregistre.
    }
  }
}
