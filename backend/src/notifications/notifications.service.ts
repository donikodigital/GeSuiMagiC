//backend/src/notifications/notifications.service.ts
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
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

interface EmailJob {
  notificationId: string;
  userId: string;
  type: NotificationType;
  subject: string;
  html: string;
}

/** Envois SMTP simultanes maximum. */
const EMAIL_CONCURRENCY = 3;
/** Tentatives d'envoi par email (1 + 2 relances). */
const EMAIL_MAX_ATTEMPTS = 3;
/** Delai maximum accorde a la fin des envois en cours lors de l'arret du serveur. */
const SHUTDOWN_GRACE_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Centralise toutes les notifications (section 41/67).
 * Emails envoyes via SMTP (Gmail par defaut - voir README pour la
 * configuration d'un mot de passe d'application Google). Le transport est
 * generique : n'importe quel serveur SMTP standard (Gmail, Outlook,
 * SendGrid, Mailgun...) fonctionne en changeant simplement SMTP_HOST/PORT.
 *
 * Principes :
 *  - La notification in-app est enregistree tout de suite ; l'EMAIL part en
 *    arriere-plan (petite file en memoire, 3 envois simultanes, 3 tentatives).
 *    Avant, chaque requete HTTP attendait le serveur SMTP : une diffusion a
 *    N clients bloquait la requete N fois la duree d'un envoi.
 *  - L'echec d'une notification ou d'un email ne fait JAMAIS echouer
 *    l'operation metier qui la declenche (une depense doit rester validee meme
 *    si l'envoi echoue). On logue et on laisse emailSent=false.
 */
@Injectable()
export class NotificationsService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromEmail: string;

  private readonly queue: EmailJob[] = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

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
        // Sans delais, un serveur SMTP injoignable pouvait bloquer indefiniment.
        connectionTimeout: this.config.get<number>('smtp.connectionTimeoutMs') ?? 10_000,
        greetingTimeout: this.config.get<number>('smtp.connectionTimeoutMs') ?? 10_000,
        socketTimeout: this.config.get<number>('smtp.socketTimeoutMs') ?? 15_000,
      });
    } else {
      this.transporter = null;
    }
  }

  /** Enregistre la notification in-app et planifie l'email (en arriere-plan). Ne leve jamais d'exception. */
  async send(input: SendNotificationInput): Promise<void> {
    await this.sendMany([input]);
  }

  /** Version groupee (diffusions) : une seule transaction d'ecriture, emails en arriere-plan. */
  async sendMany(inputs: SendNotificationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      const created = await this.prisma.$transaction(
        inputs.map((input) =>
          this.prisma.notification.create({
            data: {
              userId: input.userId,
              type: input.type,
              title: input.title,
              message: input.message,
              meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
            },
            select: { id: true },
          }),
        ),
      );

      created.forEach((notification, index) => {
        const input = inputs[index];
        if (!input.emailHtml) return;
        this.enqueueEmail({
          notificationId: notification.id,
          userId: input.userId,
          type: input.type,
          subject: input.emailSubject ?? input.title,
          html: input.emailHtml,
        });
      });
    } catch (err) {
      this.logger.error(`Echec d'enregistrement de ${inputs.length} notification(s)`, err instanceof Error ? err.stack : String(err));
      // Volontairement pas de rethrow : la notification est un effet secondaire, pas une condition bloquante.
    }
  }

  /** Resolu quand plus aucun email n'est en cours ni en attente (arret du serveur, tests). */
  flush(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.race([this.flush(), sleep(SHUTDOWN_GRACE_MS)]);
  }

  private enqueueEmail(job: EmailJob) {
    this.queue.push(job);
    this.pump();
  }

  private pump() {
    while (this.active < EMAIL_CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      void this.deliver(job).finally(() => {
        this.active--;
        this.pump();
        if (this.active === 0 && this.queue.length === 0) {
          const waiters = this.idleWaiters;
          this.idleWaiters = [];
          waiters.forEach((resolve) => resolve());
        }
      });
    }
  }

  private async deliver(job: EmailJob): Promise<void> {
    for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
      try {
        const user = await this.prisma.user.findUnique({ where: { id: job.userId }, select: { email: true } });
        if (!user) return;

        if (!this.transporter) {
          this.logger.warn(`SMTP_USER/SMTP_PASSWORD absents - email non envoye (type=${job.type}, userId=${job.userId})`);
          return;
        }

        await this.transporter.sendMail({ from: this.fromEmail, to: user.email, subject: job.subject, html: job.html });
        await this.prisma.notification.update({ where: { id: job.notificationId }, data: { emailSent: true } });
        return;
      } catch (err) {
        if (attempt === EMAIL_MAX_ATTEMPTS) {
          this.logger.error(
            `Echec d'envoi email apres ${attempt} tentatives (type=${job.type}, userId=${job.userId})`,
            err instanceof Error ? err.stack : String(err),
          );
          return;
        }
        this.logger.warn(`Echec d'envoi email (tentative ${attempt}/${EMAIL_MAX_ATTEMPTS}, type=${job.type}) - nouvelle tentative.`);
        await sleep(attempt * 2000);
      }
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
