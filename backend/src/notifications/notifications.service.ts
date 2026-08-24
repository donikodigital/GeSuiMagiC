//backend/src/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
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
 * Emails envoyes via SMTP (Gmail par defaut - voir README pour la
 * configuration d'un mot de passe d'application Google). Le transport est
 * generique : n'importe quel serveur SMTP standard (Gmail, Outlook,
 * SendGrid, Mailgun...) fonctionne en changeant simplement SMTP_HOST/PORT.
 *
 * Principe : l'echec d'envoi d'email ne doit JAMAIS faire echouer l'operation
 * metier qui le declenche (ex: une depense doit rester validee meme si
 * l'envoi d'email echoue). On logue l'echec et on marque emailSent=false.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const user = this.config.get<string>('smtp.user');
    const password = this.config.get<string>('smtp.password');
    this.fromEmail = this.config.get<string>('smtp.fromEmail')!;

    if (user && password) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('smtp.host'),
        port: this.config.get<number>('smtp.port'),
        secure: this.config.get<boolean>('smtp.secure'),
        auth: { user, pass: password },
      });
    } else {
      this.transporter = null;
    }
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

      if (!this.transporter) {
        this.logger.warn(`SMTP_USER/SMTP_PASSWORD absents - email non envoye (type=${input.type}, to=${user.email})`);
        return;
      }

      await this.transporter.sendMail({
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