//backend/src/clients/clients.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { invalidateIdentitiesWhere, invalidateIdentity } from '../auth/auth-cache';
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
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw AppException.conflict('EMAIL_ALREADY_USED', 'Cet email est déjà utilisé par un compte existant.');

    // Client + (premier projet) + audit dans UNE transaction : avant, un echec de creation du projet
    // laissait un client cree, sans projet ni invitation, et l'email "deja utilise".
    const { user, clientProfile } = await this.prisma.runInTransaction(async (tx) => {
      const createdUser = await tx.user.create({ data: { email, role: 'CLIENT', status: 'INVITED' } });

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

      if (dto.firstProject) {
        // clientId ne peut venir que de l'interieur : on ignore celui eventuellement present dans la charge utile.
        await this.projectsService.createWithin(tx, { ...dto.firstProject, clientId: undefined }, createdProfile.id, actor);
      }

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
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.clientProfile.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Client');
      const updated = await tx.clientProfile.update({ where: { id }, data: dto });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Client', entityId: id, oldValue: existing, newValue: updated },
        tx,
      );
      return updated;
    });
  }

  /** Section 5 : le client ne peut modifier que certaines informations personnelles. */
  async updateOwnProfile(clientProfileId: string, dto: UpdateOwnClientProfileDto, actor: AuthenticatedUser) {
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.clientProfile.findUnique({ where: { id: clientProfileId } });
      if (!existing) throw AppException.notFound('Client');
      const updated = await tx.clientProfile.update({ where: { id: clientProfileId }, data: dto });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Client',
          entityId: clientProfileId,
          oldValue: { phone: existing.phone, address: existing.address, city: existing.city, profession: existing.profession },
          newValue: dto,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Suspension / reactivation par le superadmin. La suspension coupe aussi l'acces des SUPERVISEURS de ce client
   * (voir isAccountUsable) ; les identites en cache sont invalidees pour que l'effet soit immediat.
   */
  async setSuspended(id: string, suspended: boolean, actor: AuthenticatedUser) {
    const updated = await this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.clientProfile.findUnique({ where: { id } });
      if (!existing) throw AppException.notFound('Client');
      const result = await tx.clientProfile.update({ where: { id }, data: { isActive: !suspended } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'UPDATE',
          entityType: 'Client',
          entityId: id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive: !suspended },
          reason: suspended ? 'Suspension du client par le superadmin' : 'Reactivation du client par le superadmin',
        },
        tx,
      );
      return result;
    });

    invalidateIdentity(updated.userId);
    invalidateIdentitiesWhere((u) => u.tenantClientId === id);

    return updated;
  }

  /**
   * Suppression definitive d'un client (bouton superadmin - visible cote
   * front uniquement quand 0 projet). Verification refaite ici cote
   * serveur, dans la transaction : ne jamais se fier au seul masquage du
   * bouton. Supprime aussi les User associes (le client ET ses superviseurs) :
   * sinon des comptes orphelins bloqueraient toute recreation future avec le
   * meme email (cf. verification d'unicite dans create()).
   */
  async remove(id: string, actor: AuthenticatedUser) {
    const removedUserIds = await this.prisma.runInTransaction(async (tx) => {
      const client = await tx.clientProfile.findUnique({
        where: { id },
        include: { _count: { select: { projects: true } }, supervisors: { select: { userId: true } } },
      });
      if (!client) throw AppException.notFound('Client');

      if (client._count.projects > 0) {
        throw AppException.badRequest('CLIENT_HAS_PROJECTS', 'Ce client a des projets associés et ne peut pas être supprimé.');
      }

      const supervisorUserIds = client.supervisors.map((s) => s.userId);
      // Catalogue prive du client : materiaux d'abord (FK RESTRICT vers les categories), puis categories et unites.
      // (Aucun projet => aucune depense ni budget ne les reference.)
      await tx.material.deleteMany({ where: { ownerClientId: id } });
      await tx.expenseCategory.deleteMany({ where: { ownerClientId: id } });
      await tx.unit.deleteMany({ where: { ownerClientId: id } });

      // Supprimer le User supprime en cascade son profil (client ou superviseur).
      await tx.user.deleteMany({ where: { id: { in: [...supervisorUserIds, client.userId] } } });

      await this.audit.log(
        {
          userId: actor.userId,
          userRole: actor.role,
          action: 'DELETE_SOFT',
          entityType: 'Client',
          entityId: id,
          oldValue: { firstName: client.firstName, lastName: client.lastName, supervisors: supervisorUserIds.length },
          reason: 'Suppression du client par le superadmin (aucun projet associé)',
        },
        tx,
      );
      return [...supervisorUserIds, client.userId];
    });

    invalidateIdentity(...removedUserIds);
    return { removed: true };
  }

  /**
   * Renvoie le lien d'invitation (bouton visible uniquement pendant que le
   * compte est toujours au statut INVITED, typiquement suite a une
   * reclamation client apres expiration du premier lien). createInvitation
   * genere un NOUVEAU jeton qui remplace l'ancien (l'ancien lien cesse de
   * fonctionner).
   */
  async resendInvitation(id: string, actor: AuthenticatedUser) {
    const client = await this.prisma.clientProfile.findUnique({
      where: { id },
      include: { user: { select: { id: true, status: true } } },
    });
    if (!client) throw AppException.notFound('Client');

    if (client.user.status !== 'INVITED') {
      throw AppException.badRequest('CLIENT_ALREADY_ACTIVE', 'Ce client a déjà activé son compte.');
    }

    await this.authService.createInvitation(client.user.id);

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'UPDATE',
      entityType: 'Client',
      entityId: id,
      reason: "Renvoi du lien d'invitation par le superadmin (compte toujours au statut INVITED)",
    });

    return { sent: true };
  }
}
