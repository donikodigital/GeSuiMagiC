//backend/src/messages/messages.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, SendNotificationInput } from '../notifications/notifications.service';
import { emailTemplates } from '../notifications/templates/email-templates';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { projectAccessFilter } from '../common/utils/project-access.util';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';

const senderSelect = {
  id: true,
  email: true,
  role: true,
  clientProfile: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

const recipientSelect = {
  id: true,
  email: true,
  clientProfile: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

type NotifiableMessage = {
  id: string;
  type: MessageType;
  subject: string;
  body: string;
  senderId: string;
  recipientId: string | null;
};

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

    // Un non-superadmin ne choisit jamais le destinataire : sa demande va a l'equipe.
    const recipientId = isSuperadmin ? dto.recipientId ?? null : null;
    // Verifie AVANT d'ecrire (avant, un destinataire inconnu faisait echouer l'envoi apres la creation du message).
    if (recipientId) await this.assertValidRecipient(recipientId);

    await this.assertRelatedEntityAccessible(dto.relatedEntityType, dto.relatedEntityId, actor);

    const message = await this.prisma.message.create({
      data: {
        type: dto.type,
        subject: dto.subject,
        body: dto.body,
        senderId: actor.userId,
        recipientId,
        relatedEntityType: dto.relatedEntityType,
        relatedEntityId: dto.relatedEntityId,
      },
    });

    await this.notifyRecipients(message, actor);

    return this.getRaw(message.id, actor);
  }

  async reply(parentId: string, dto: ReplyMessageDto, actor: AuthenticatedUser) {
    const isSuperadmin = actor.role === 'SUPERADMIN';

    const given = await this.prisma.message.findUnique({ where: { id: parentId }, include: { sender: { select: { role: true } } } });
    if (!given) throw AppException.notFound('Message');
    // On repond toujours au message RACINE du fil (une reponse a une reponse reste dans le meme fil).
    const root = given.parentId
      ? await this.prisma.message.findUnique({ where: { id: given.parentId }, include: { sender: { select: { role: true } } } })
      : given;
    if (!root) throw AppException.notFound('Message');

    await this.assertCanAccess(root, actor);

    const isGlobalBroadcast = root.type === 'BROADCAST' && root.recipientId === null;

    let recipientId: string | null;
    if (!isSuperadmin) {
      // Un client/superviseur repond a l'equipe, JAMAIS aux autres clients.
      recipientId = null;
    } else if (dto.recipientId) {
      await this.assertValidRecipient(dto.recipientId);
      recipientId = dto.recipientId;
    } else if (isGlobalBroadcast) {
      // Suite publique d'une diffusion : visible de tous les destinataires de la diffusion.
      recipientId = null;
    } else {
      // Reponse a un message de client -> a ce client ; reponse dans un fil ouvert par un admin -> a son destinataire.
      recipientId = root.sender.role === 'SUPERADMIN' ? root.recipientId : root.senderId;
    }

    // Avant : la reponse d'un client a une diffusion heritait du type BROADCAST (sans destinataire) et
    // etait donc visible ET envoyee par email a TOUS les clients. Une reponse privee devient un message "OTHER".
    const type: MessageType = !isSuperadmin && root.type === 'BROADCAST' ? 'OTHER' : root.type;

    const reply = await this.prisma.message.create({
      data: {
        type,
        subject: `Re: ${root.subject.replace(/^(Re:\s*)+/i, '')}`,
        body: dto.body,
        senderId: actor.userId,
        recipientId,
        relatedEntityType: root.relatedEntityType,
        relatedEntityId: root.relatedEntityId,
        parentId: root.id,
      },
    });

    if (root.status === 'OPEN' && isSuperadmin) {
      await this.prisma.message.update({ where: { id: root.id }, data: { status: 'IN_PROGRESS' } });
    }

    await this.notifyRecipients(reply, actor, { publicBroadcastFollowUp: isSuperadmin && recipientId === null && isGlobalBroadcast });

    return this.getRaw(root.id, actor);
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
          sender: { select: senderSelect },
          recipient: { select: recipientSelect },
          replies: {
            where: this.repliesVisibleTo(actor),
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: senderSelect } },
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
    const message = await this.getRaw(id, actor);
    await this.assertCanAccess(message, actor);
    return message;
  }

  async updateStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED', actor: AuthenticatedUser) {
    if (actor.role !== 'SUPERADMIN') throw AppException.forbiddenProjectAccess();
    const exists = await this.prisma.message.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppException.notFound('Message');
    await this.prisma.message.update({ where: { id }, data: { status } });
    return this.getRaw(id, actor);
  }

  async markAsRead(id: string, actor: AuthenticatedUser) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) throw AppException.notFound('Message');
    await this.assertCanAccess(message, actor);
    if (message.recipientId === actor.userId || (actor.role === 'SUPERADMIN' && message.recipientId === null)) {
      await this.prisma.message.update({ where: { id }, data: { isRead: true } });
    }
    return { marked: true };
  }

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------

  /**
   * Reponses visibles dans un fil. Le superadmin voit tout. Les autres ne voient
   * que : leurs propres reponses, celles qui leur sont adressees, et les suites
   * PUBLIQUES du superadmin. Avant, un fil de diffusion renvoyait TOUTES les
   * reponses a TOUS les clients (les reponses privees des autres clients fuitaient).
   */
  private repliesVisibleTo(actor: AuthenticatedUser): Prisma.MessageWhereInput {
    if (actor.role === 'SUPERADMIN') return {};
    return {
      OR: [{ senderId: actor.userId }, { recipientId: actor.userId }, { recipientId: null, sender: { role: UserRole.SUPERADMIN } }],
    };
  }

  private async getRaw(id: string, actor: AuthenticatedUser) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        sender: { select: senderSelect },
        recipient: { select: recipientSelect },
        replies: {
          where: this.repliesVisibleTo(actor),
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: senderSelect } },
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
    const allowed =
      message.senderId === actor.userId || message.recipientId === actor.userId || (message.type === 'BROADCAST' && message.recipientId === null);
    if (!allowed) throw AppException.forbiddenProjectAccess();
  }

  private async assertValidRecipient(recipientId: string) {
    const recipient = await this.prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, role: true } });
    if (!recipient || recipient.role === 'SUPERADMIN') {
      throw AppException.badRequest('INVALID_RECIPIENT', 'Destinataire invalide.');
    }
  }

  /** Un message ne peut referencer qu'un depot/une depense auquel l'expediteur a acces (et les deux champs vont ensemble). */
  private async assertRelatedEntityAccessible(entityType: string | undefined, entityId: string | undefined, actor: AuthenticatedUser) {
    if (!entityType && !entityId) return;
    if (!entityType || !entityId) {
      throw AppException.badRequest('INVALID_RELATED_ENTITY', "Le type et l'identifiant de l'élément concerné vont ensemble.");
    }

    const select = { projectId: true };
    const found =
      entityType === 'Deposit'
        ? await this.prisma.deposit.findUnique({ where: { id: entityId }, select })
        : await this.prisma.expense.findUnique({ where: { id: entityId }, select });

    if (actor.role === 'SUPERADMIN') {
      if (!found) throw AppException.notFound(entityType === 'Deposit' ? 'Dépôt' : 'Dépense');
      return;
    }
    if (!found) throw AppException.forbiddenProjectAccess();
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id: found.projectId }, projectAccessFilter(actor)] },
      select: { id: true },
    });
    if (!project) throw AppException.forbiddenProjectAccess();
  }

  private async notifyRecipients(message: NotifiableMessage, actor: AuthenticatedUser, options: { publicBroadcastFollowUp?: boolean } = {}) {
    const sender = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { clientProfile: { select: { firstName: true, lastName: true } }, supervisorProfile: { select: { firstName: true, lastName: true } } },
    });
    const profile = sender?.clientProfile ?? sender?.supervisorProfile;
    const senderLabel = profile ? `${profile.firstName} ${profile.lastName}` : 'Superadmin';

    const url = `${this.config.get<string>('frontendUrl')}/contact`;
    const inputs: SendNotificationInput[] = [];

    const toBroadcastInput = (userId: string, email: string): SendNotificationInput => ({
      userId,
      type: 'BROADCAST_RECEIVED',
      title: message.subject,
      message: message.body,
      emailHtml: emailTemplates.broadcastMessage(email, message.subject, message.body, url),
      emailSubject: message.subject,
    });

    if (message.recipientId) {
      // Message cible (y compris une diffusion adressee a un seul client).
      const target = await this.prisma.user.findUnique({ where: { id: message.recipientId }, select: { id: true, email: true } });
      if (target) {
        inputs.push(
          message.type === 'BROADCAST'
            ? toBroadcastInput(target.id, target.email)
            : {
                userId: target.id,
                type: 'MESSAGE_RECEIVED',
                title: message.subject,
                message: message.body,
                emailHtml: emailTemplates.newMessage(senderLabel, message.subject, message.body, url),
                emailSubject: `Nouveau message : ${message.subject}`,
              },
        );
      }
    } else if (actor.role === 'SUPERADMIN' && (message.type === 'BROADCAST' || options.publicBroadcastFollowUp)) {
      // Diffusion generale : uniquement les clients ACTIFS (non suspendus). Une seule ecriture groupee, emails en arriere-plan.
      const clients = await this.prisma.user.findMany({
        where: { role: 'CLIENT', status: 'ACTIVE', clientProfile: { is: { isActive: true } } },
        select: { id: true, email: true },
      });
      clients.forEach((client) => inputs.push(toBroadcastInput(client.id, client.email)));
    } else {
      // Demande d'un client/superviseur vers l'equipe : tous les superadmins actifs (sauf l'expediteur).
      const superadmins = await this.prisma.user.findMany({
        where: { role: UserRole.SUPERADMIN, status: 'ACTIVE', id: { not: actor.userId } },
        select: { id: true },
      });
      superadmins.forEach((admin) =>
        inputs.push({
          userId: admin.id,
          type: 'MESSAGE_RECEIVED',
          title: `Nouvelle demande : ${message.subject}`,
          message: message.body,
          emailHtml: emailTemplates.newMessage(senderLabel, message.subject, message.body, url),
          emailSubject: `Nouvelle demande client : ${message.subject}`,
        }),
      );
    }

    await this.notifications.sendMany(inputs);
  }
}
