//backend/src/site-common/site-notifier.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, SendNotificationInput } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { getClientUserId, listTechnicalReviewerUserIds } from '../common/utils/technical-review.util';

export type NoticeInput = Omit<SendNotificationInput, 'userId' | 'emailHtml'> & {
  /** Chemin a la suite de /projects/:id (ex: "/progress"). Genere le bouton de l'email. */
  path?: string;
  /** Texte detaille de l'email (par defaut le message de la notification). */
  emailBody?: string;
};

/**
 * Destinataires courants des evenements de chantier : le client, les responsables techniques, les superviseurs.
 * Ne leve jamais d'exception : une notification ne doit jamais faire echouer l'operation deja enregistree.
 */
@Injectable()
export class SiteNotifierService {
  private readonly logger = new Logger(SiteNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  projectUrl(projectId: string, path = ''): string {
    return `${this.config.get<string>('frontendUrl')}/projects/${projectId}${path}`;
  }

  private build(userId: string, projectId: string, input: NoticeInput): SendNotificationInput {
    const { path, emailBody, ...rest } = input;
    return {
      ...rest,
      userId,
      emailHtml: emailTemplates.notice(input.title, emailBody ?? input.message, this.projectUrl(projectId, path ?? '')),
      emailSubject: input.emailSubject ?? input.title,
      meta: { projectId, ...(input.meta ?? {}) },
    };
  }

  private async safe(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      this.logger.error('Echec de la notification de chantier', err instanceof Error ? err.stack : String(err));
    }
  }

  async toClient(project: { id: string; clientId: string }, input: NoticeInput): Promise<void> {
    await this.safe(async () => {
      const userId = await getClientUserId(this.prisma, project.clientId);
      if (userId) await this.notifications.send(this.build(userId, project.id, input));
    });
  }

  async toReviewers(projectId: string, input: NoticeInput, excludeUserId?: string): Promise<void> {
    await this.safe(async () => {
      const ids = (await listTechnicalReviewerUserIds(this.prisma, projectId)).filter((id) => id !== excludeUserId);
      await this.notifications.sendMany(ids.map((id) => this.build(id, projectId, input)));
    });
  }

  async toSupervisors(projectId: string, input: NoticeInput, excludeUserId?: string): Promise<void> {
    await this.safe(async () => {
      const rows = await this.prisma.projectSupervisor.findMany({
        where: { projectId, status: 'ACTIVE', supervisor: { user: { status: 'ACTIVE' } } },
        select: { supervisor: { select: { userId: true } } },
      });
      const ids = rows.map((r) => r.supervisor.userId).filter((id) => id !== excludeUserId);
      await this.notifications.sendMany(ids.map((id) => this.build(id, projectId, input)));
    });
  }

  async toUser(userId: string, projectId: string, input: NoticeInput): Promise<void> {
    await this.safe(async () => {
      await this.notifications.send(this.build(userId, projectId, input));
    });
  }

  /** Vrai si une notification de ce type et de cette cible a deja ete envoyee recemment (evite les doublons d'alertes). */
  async recentlySent(userId: string, type: SendNotificationInput['type'], metaKey: string, metaValue: string, withinMs: number): Promise<boolean> {
    const found = await this.prisma.notification.findFirst({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - withinMs) }, meta: { path: [metaKey], equals: metaValue } },
      select: { id: true },
    });
    return !!found;
  }
}
