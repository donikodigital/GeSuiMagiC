import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  emailHtml?: string; // si absent, pas d'email envoye (notification in-app uniquement)
  emailSubject?: string;
  meta?: Record<string, unknown>;
}

/**
 * Centralise toutes les notifications (section 41/67).
 * Principe : l'echec d'envoi d'email ne doit JAMAIS faire echouer l'operation
 * metier qui le declenche (ex: une depense doit rester validee meme si
 * Resend est indisponible). On logue l'echec et on marque emailSent=false.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail = this.config.get<string>('resend.fromEmail')!;
  }

  async send(input: SendNotificationInput): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
      },
    });

    if (!input.emailHtml) return;

    try {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      if (!user) return;

      if (!this.resend) {
        this.logger.warn(`RESEND_API_KEY absent - email non envoye (type=${input.type}, to=${user.email})`);
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to: user.email,
        subject: input.emailSubject ?? input.title,
        html: input.emailHtml,
      });

      await this.prisma.notification.update({ where: { id: notification.id }, data: { emailSent: true } });
    } catch (err) {
      this.logger.error(`Echec d'envoi email (type=${input.type}, userId=${input.userId})`, err instanceof Error ? err.stack : String(err));
      // Volontairement pas de rethrow : l'email est un effet secondaire, pas une condition bloquante.
    }
  }

  async listForUser(userId: string, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total };
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }
}
