// backend/src/messages/messages.service.ts - v1.1
// Fix : findAll() pour le superadmin oubliait les messages qu'il envoie
// lui-meme a un client precis (non-diffusion) - ils avaient un recipientId
// non-null et un type != BROADCAST, ne matchant aucune des deux conditions
// d'origine (demandes client->equipe, diffusions groupees). Ajout de la
// condition senderId === actor.userId, qui couvre desormais tout message
// envoye par ce superadmin, cible ou diffuse.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateMessageDto, actor: AuthenticatedUser) {
    const isSuperadmin = actor.role === 'SUPERADMIN';

    if (dto.type === 'BROADCAST' && !isSuperadmin) {
      throw AppException.forbiddenProjectAccess();
    }
    if (!isSuperadmin && dto.recipientId) {
      dto.recipientId = undefined;
    }

    const message = await this.prisma.message.create({
      data: {
        type: dto.type,
        subject: dto.subject,
        body: dto.body,
        senderId: actor.userId,
        recipientId: isSuperadmin ? dto.recipientId ?? null : null,
        relatedEntityType: dto.relatedEntityType,
        relatedEntityId: dto.relatedEntityId,
      },
    });

    await this.notifyRecipients(message, actor);

    return this.getRaw(message.id);
  }

  async reply(parentId: string, dto: ReplyMessageDto, actor: AuthenticatedUser) {
    const parent = await this.prisma.message.findUniqueOrThrow({ where: { id: parentId } });
    await this.assertCanAccess(parent, actor);

    const recipientId = actor.role === 'SUPERADMIN' ? parent.senderId : null;

    const reply = await this.prisma.message.create({
      data: {
        type: parent.type,
        subject: `Re: ${parent.subject}`,
        body: dto.body,
        senderId: actor.userId,
        recipientId,
        relatedEntityType: parent.relatedEntityType,
        relatedEntityId: parent.relatedEntityId,
        parentId: parent.id,
      },
    });

    if (parent.status === 'OPEN' && actor.role === 'SUPERADMIN') {
      await this.prisma.message.update({ where: { id: parent.id }, data: { status: 'IN_PROGRESS' } });
    }

    await this.notifyRecipients(reply, actor);

    return this.getRaw(parent.id);
  }

  async findAll(query: MessageQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.MessageWhereInput =
      actor.role === 'SUPERADMIN'
        ? {
            parentId: null,
            status: query.status,
            type: query.type,
            OR: [
              { type: { not: 'BROADCAST' }, recipientId: null }, // demandes des clients vers l'equipe
              { senderId: actor.userId }, // tout message envoye par ce superadmin (cible ou diffusion)
            ],
          }
        : {
            parentId: null,
            status: query.status,
            type: query.type,
            OR: [{ senderId: actor.userId }, { recipientId: actor.userId }, { type: 'BROADCAST', recipientId: null }],
          };

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, email: true, role: true, clientProfile: { select: { firstName: true, lastName: true } } } },
          recipient: { select: { id: true, email: true, clientProfile: { select: { firstName: true, lastName: true } } } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, email: true, role: true, clientProfile: { select: { firstName: true, lastName: true } } } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const message = await this.getRaw(id);
    await this.assertCanAccess(message, actor);
    return message;
  }

  async updateStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED', actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERADMIN') throw AppException.forbiddenProjectAccess();
    await this.prisma.message.update({ where: { id }, data: { status } });
    return this.getRaw(id);
  }

  async markAsRead(id: string, actor: AuthenticatedUser) {
    const message = await this.prisma.message.findUniqueOrThrow({ where: { id } });
    await this.assertCanAccess(message, actor);
    if (message.recipientId === actor.userId || (actor.role === 'SUPERADMIN' && message.recipientId === null)) {
      await this.prisma.message.update({ where: { id }, data: { isRead: true } });
    }
    return { marked: true };
  }

  private async getRaw(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, email: true, role: true, clientProfile: { select: { firstName: true, lastName: true } } } },
        recipient: { select: { id: true, email: true, clientProfile: { select: { firstName: true, lastName: true } } } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, email: true, role: true, clientProfile: { select: { firstName: true, lastName: true } } } } },
        },
      },
    });
    if (!message) throw AppException.notFound('Message');
    return message;
  }

  private async assertCanAccess(message: { senderId: string; recipientId: string | null; type: MessageType }, actor: AuthenticatedUser) {
    if (actor.role === 'SUPERADMIN') {
      if (message.type === 'BROADCAST' && message.senderId !== actor.userId && message.recipientId !== null) {
        throw AppException.forbiddenProjectAccess();
      }
      return;
    }
    const allowed = message.senderId === actor.userId || message.recipientId === actor.userId || (message.type === 'BROADCAST' && message.recipientId === null);
    if (!allowed) throw AppException.forbiddenProjectAccess();
  }

  private async notifyRecipients(
    message: { id: string; type: MessageType; subject: string; body: string; senderId: string; recipientId: string | null },
    actor: AuthenticatedUser,
  ) {
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      include: { clientProfile: true, supervisorProfile: true },
    });
    const senderLabel = sender.clientProfile
      ? `${sender.clientProfile.firstName} ${sender.clientProfile.lastName}`
      : sender.supervisorProfile
        ? `${sender.supervisorProfile.firstName} ${sender.supervisorProfile.lastName}`
        : 'Superadmin';

    const url = `${this.config.get<string>('frontendUrl')}/contact`;

    if (message.type === 'BROADCAST') {
      const targets = message.recipientId
        ? [await this.prisma.user.findUniqueOrThrow({ where: { id: message.recipientId } })]
        : await this.prisma.user.findMany({ where: { role: 'CLIENT', status: 'ACTIVE' } });

      for (const target of targets) {
        await this.notifications.send({
          userId: target.id,
          type: 'BROADCAST_RECEIVED',
          title: message.subject,
          message: message.body,
          emailHtml: emailTemplates.broadcastMessage(target.email, message.subject, message.body, url),
          emailSubject: message.subject,
        });
      }
      return;
    }

    if (message.recipientId) {
      await this.notifications.send({
        userId: message.recipientId,
        type: 'MESSAGE_RECEIVED',
        title: message.subject,
        message: message.body,
        emailHtml: emailTemplates.newMessage(senderLabel, message.subject, message.body, url),
        emailSubject: `Nouveau message : ${message.subject}`,
      });
      return;
    }

    const superadmins = await this.prisma.user.findMany({ where: { role: UserRole.SUPERADMIN, status: 'ACTIVE' } });
    for (const admin of superadmins) {
      await this.notifications.send({
        userId: admin.id,
        type: 'MESSAGE_RECEIVED',
        title: `Nouvelle demande : ${message.subject}`,
        message: message.body,
        emailHtml: emailTemplates.newMessage(senderLabel, message.subject, message.body, url),
        emailSubject: `Nouvelle demande client : ${message.subject}`,
      });
    }
  }
}