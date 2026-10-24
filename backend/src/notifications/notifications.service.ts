//backend/src/notifications/notifications.service.ts
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/exceptions/app.exception';
import { E164_REGEX, MessagingService } from './messaging.service';

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  emailHtml?: string; // si absent, pas d'email envoye (notification in-app uniquement)
  emailSubject?: string;
  emailAttachments?: { filename: string; content: Buffer; contentType: string }[];
  meta?: Record<string, unknown>;
}

interface EmailJob {
  notificationId: string;
  userId: string;
  type: NotificationType;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Notifications egalement envoyees par WhatsApp / SMS aux utilisateurs qui ont active ces canaux :
 * uniquement ce qui demande une action ou une decision rapide (pas les accuses de lecture, ni les invitations).
 */
export const MESSAGING_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'DEPOSIT_CREATED',
  'DEPOSIT_APPROVED',
  'DEPOSIT_REJECTED',
  'EXPENSE_PENDING_APPROVAL',
  'EXPENSE_APPROVED',
  'EXPENSE_REJECTED',
  'LOW_BALANCE_ALERT',
  'BUDGET_EXCEEDED_ALERT',
  'MEAL_ACCOUNT_REQUESTED',
  'MEAL_ACCOUNT_ANSWERED',
  'CHANGE_ORDER_REQUESTED',
  'CHANGE_ORDER_DECIDED',
  'SNAG_REPORTED',
  'PROGRESS_SUBMITTED',
  'PROGRESS_DECIDED',
  'TECH_REVIEW_REQUESTED',
  'DOCUMENT_EXPIRING',
  'ATTENDANCE_REMINDER',
  'STATEMENT_SUBMITTED',
  'STATEMENT_DECIDED',
  'LOCATION_ALERT',
  'LOW_STOCK_ALERT',
  'SCHEDULE_ALERT',
]);

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
    private readonly messaging: MessagingService,
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
          attachments: input.emailAttachments,
        });
      });

      await this.dispatchMessaging(inputs);
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

        await this.transporter.sendMail({ from: this.fromEmail, to: user.email, subject: job.subject, html: job.html, attachments: job.attachments });
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

  /** WhatsApp / SMS pour les destinataires qui les ont actives. Ne leve jamais d'exception. */
  private async dispatchMessaging(inputs: SendNotificationInput[]): Promise<void> {
    try {
      const eligible = inputs.filter((i) => MESSAGING_NOTIFICATION_TYPES.has(i.type));
      if (eligible.length === 0) return;
      if (!this.messaging.isAvailable('WHATSAPP') && !this.messaging.isAvailable('SMS')) return;

      const users = await this.prisma.user.findMany({
        where: {
          id: { in: [...new Set(eligible.map((i) => i.userId))] },
          messagingPhone: { not: null },
          OR: [{ whatsappOptIn: true }, { smsOptIn: true }],
        },
        select: { id: true, messagingPhone: true, whatsappOptIn: true, smsOptIn: true },
      });
      if (users.length === 0) return;
      const byId = new Map(users.map((u) => [u.id, u]));

      const jobs: Array<() => Promise<unknown>> = [];
      for (const input of eligible) {
        const user = byId.get(input.userId);
        if (!user?.messagingPhone) continue;
        const text = `${input.title}\n${input.message}`;
        // WhatsApp en priorite ; le SMS ne sert que si WhatsApp n'est pas active (jamais les deux pour le meme message).
        if (user.whatsappOptIn && this.messaging.isAvailable('WHATSAPP')) {
          jobs.push(() => this.messaging.send('WHATSAPP', user.messagingPhone!, text));
        } else if (user.smsOptIn && this.messaging.isAvailable('SMS')) {
          jobs.push(() => this.messaging.send('SMS', user.messagingPhone!, text));
        }
      }
      for (let i = 0; i < jobs.length; i += 5) {
        await Promise.allSettled(jobs.slice(i, i + 5).map((job) => job()));
      }
    } catch (err) {
      this.logger.warn(`Echec de la distribution WhatsApp/SMS : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { messagingPhone: true, whatsappOptIn: true, smsOptIn: true },
    });
    if (!user) throw AppException.notFound('Utilisateur');
    return {
      ...user,
      whatsappAvailable: this.messaging.isAvailable('WHATSAPP'),
      smsAvailable: this.messaging.isAvailable('SMS'),
    };
  }

  async updatePreferences(userId: string, dto: { messagingPhone?: string | null; whatsappOptIn?: boolean; smsOptIn?: boolean }) {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { messagingPhone: true } });
    if (!current) throw AppException.notFound('Utilisateur');

    const phone = dto.messagingPhone === undefined ? current.messagingPhone : dto.messagingPhone;
    if (phone !== null && !E164_REGEX.test(phone)) {
      throw AppException.badRequest('INVALID_PHONE', 'Le numéro doit être au format international, par exemple +224620000000.');
    }
    // Pas de numero : aucun canal ne peut rester actif.
    const whatsappOptIn = phone ? (dto.whatsappOptIn ?? undefined) : false;
    const smsOptIn = phone ? (dto.smsOptIn ?? undefined) : false;
    if (phone && (dto.whatsappOptIn === true || dto.smsOptIn === true) && !current.messagingPhone && dto.messagingPhone === undefined) {
      throw AppException.badRequest('PHONE_REQUIRED', "Renseignez d'abord votre numéro pour activer WhatsApp ou les SMS.");
    }

    await this.prisma.user.update({ where: { id: userId }, data: { messagingPhone: phone, whatsappOptIn, smsOptIn } });
    return this.getPreferences(userId);
  }

  /** Message de test vers le numero de l'utilisateur, pour verifier qu'il recoit bien les alertes. */
  async sendTestMessage(userId: string, channel: 'WHATSAPP' | 'SMS') {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { messagingPhone: true } });
    if (!user?.messagingPhone) throw AppException.badRequest('PHONE_REQUIRED', "Renseignez d'abord votre numéro.");
    if (!this.messaging.isAvailable(channel)) {
      throw AppException.conflict('CHANNEL_UNAVAILABLE', `Le canal ${channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'} n'est pas configuré sur ce serveur.`);
    }
    const sent = await this.messaging.send(channel, user.messagingPhone, 'Suivi de Chantier : ceci est un message de test. Vous recevrez ici vos alertes importantes.');
    if (!sent) throw AppException.conflict('SEND_FAILED', "Le message n'a pas pu être envoyé. Vérifiez le numéro puis réessayez.");
    return { sent: true };
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
