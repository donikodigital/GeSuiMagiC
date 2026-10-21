//backend/src/messages/messages.service.spec.ts
/**
 * Regles de confidentialite de la messagerie :
 *  - seul le superadmin diffuse, et il ne peut ecrire qu'a un client/superviseur existant ;
 *  - un client/superviseur ecrit toujours a l'EQUIPE (jamais a un autre client) ;
 *  - la reponse d'un client a une diffusion reste PRIVEE (ni visible ni envoyee aux autres clients) ;
 *  - un message ne peut referencer qu'un depot/une depense accessible a son auteur.
 */

import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let prisma: any;
  let notifications: { sendMany: jest.Mock };
  let service: MessagesService;

  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };
  const clientA = { userId: 'u-a', email: 'a@c', role: 'CLIENT' as const, clientProfileId: 'c-a', tenantClientId: 'c-a' };
  const clientB = { userId: 'u-b', email: 'b@c', role: 'CLIENT' as const, clientProfileId: 'c-b', tenantClientId: 'c-b' };

  const message = (overrides: Record<string, unknown> = {}) => ({
    id: 'm-1',
    type: 'OTHER',
    subject: 'Question',
    body: 'Bonjour',
    status: 'OPEN',
    senderId: 'u-a',
    recipientId: null,
    parentId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    sender: { role: 'CLIENT' },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      message: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'm-new', ...data })),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u-x', email: 'x@c', role: 'CLIENT', clientProfile: null, supervisorProfile: null }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      deposit: { findUnique: jest.fn() },
      expense: { findUnique: jest.fn() },
      project: { findFirst: jest.fn() },
    };
    notifications = { sendMany: jest.fn().mockResolvedValue(undefined) };
    service = new MessagesService(prisma, notifications as any, { get: () => 'https://app.example' } as any);
  });

  /** Apres creation, getRaw relit le message : on renvoie toujours la ligne demandee. */
  const stubReadBack = (row: Record<string, unknown>) => prisma.message.findUnique.mockImplementation(({ where }: any) => (where.id === row.id ? row : null));

  describe('create', () => {
    it("un non-superadmin ne peut pas faire de diffusion", async () => {
      await expect(service.create({ type: 'BROADCAST', subject: 'S', body: 'B' } as any, clientA)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("un client ne choisit jamais le destinataire : sa demande va a l'equipe (recipientId = null)", async () => {
      stubReadBack({ ...message({ id: 'm-new' }) });
      prisma.user.findMany.mockResolvedValue([{ id: 'u-admin2' }]);

      await service.create({ type: 'OTHER', subject: 'S', body: 'B', recipientId: 'u-b' } as any, clientA);

      expect(prisma.message.create.mock.calls[0][0].data.recipientId).toBeNull();
      // Notifie les superadmins actifs (hors expediteur), PAS les autres clients.
      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ role: 'SUPERADMIN', status: 'ACTIVE' });
      expect(notifications.sendMany.mock.calls[0][0].map((n: any) => n.userId)).toEqual(['u-admin2']);
    });

    it("le superadmin ne peut ecrire qu'a un utilisateur existant qui n'est pas superadmin - verifie AVANT d'ecrire", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.create({ type: 'OTHER', subject: 'S', body: 'B', recipientId: 'inconnu' } as any, admin)).rejects.toMatchObject({
        code: 'INVALID_RECIPIENT',
      });

      prisma.user.findUnique.mockResolvedValue({ id: 'u-admin2', role: 'SUPERADMIN' });
      await expect(service.create({ type: 'OTHER', subject: 'S', body: 'B', recipientId: 'u-admin2' } as any, admin)).rejects.toMatchObject({
        code: 'INVALID_RECIPIENT',
      });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('une diffusion generale notifie uniquement les clients ACTIFS non suspendus', async () => {
      stubReadBack({ ...message({ id: 'm-new', type: 'BROADCAST', senderId: 'u-admin', sender: { role: 'SUPERADMIN' } }) });
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-a', email: 'a@c' },
        { id: 'u-b', email: 'b@c' },
      ]);

      await service.create({ type: 'BROADCAST', subject: 'Maintenance', body: 'Ce soir' } as any, admin);

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        role: 'CLIENT',
        status: 'ACTIVE',
        clientProfile: { is: { isActive: true } },
      });
      expect(notifications.sendMany.mock.calls[0][0]).toHaveLength(2);
      expect(notifications.sendMany.mock.calls[0][0][0]).toMatchObject({ type: 'BROADCAST_RECEIVED' });
    });

    describe('element concerne (depot / depense)', () => {
      it('le type et l\'identifiant vont ensemble', async () => {
        await expect(
          service.create({ type: 'OTHER', subject: 'S', body: 'B', relatedEntityType: 'Deposit' } as any, clientA),
        ).rejects.toMatchObject({ code: 'INVALID_RELATED_ENTITY' });
      });

      it("refuse un depot qui n'existe pas ou auquel le client n'a pas acces (sans reveler lequel)", async () => {
        prisma.deposit.findUnique.mockResolvedValue(null);
        await expect(
          service.create({ type: 'OTHER', subject: 'S', body: 'B', relatedEntityType: 'Deposit', relatedEntityId: 'd-1' } as any, clientA),
        ).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });

        prisma.deposit.findUnique.mockResolvedValue({ projectId: 'p-autre' });
        prisma.project.findFirst.mockResolvedValue(null);
        await expect(
          service.create({ type: 'OTHER', subject: 'S', body: 'B', relatedEntityType: 'Deposit', relatedEntityId: 'd-1' } as any, clientA),
        ).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });

        // Le filtre d'acces projet du client est bien applique.
        expect(prisma.project.findFirst.mock.calls[0][0].where.AND[1]).toEqual({ clientId: 'c-a' });
        expect(prisma.message.create).not.toHaveBeenCalled();
      });

      it('accepte une depense d\'un projet du client', async () => {
        prisma.expense.findUnique.mockResolvedValue({ projectId: 'p-1' });
        prisma.project.findFirst.mockResolvedValue({ id: 'p-1' });
        stubReadBack({ ...message({ id: 'm-new' }) });

        await expect(
          service.create({ type: 'OTHER', subject: 'S', body: 'B', relatedEntityType: 'Expense', relatedEntityId: 'e-1' } as any, clientA),
        ).resolves.toBeDefined();
      });
    });
  });

  describe('reply', () => {
    it("la reponse d'un client a une diffusion devient un message PRIVE (type OTHER, destinataire null) envoye a l'equipe", async () => {
      const broadcast = message({ id: 'm-b', type: 'BROADCAST', senderId: 'u-admin', recipientId: null, sender: { role: 'SUPERADMIN' } });
      stubReadBack(broadcast);
      prisma.user.findMany.mockResolvedValue([{ id: 'u-admin' }]);

      await service.reply('m-b', { body: 'Merci mais...' } as any, clientA);

      const data = prisma.message.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ type: 'OTHER', recipientId: null, parentId: 'm-b', senderId: 'u-a' });
      // Aucune notification vers les autres clients : on ne cherche que les superadmins.
      expect(prisma.user.findMany.mock.calls[0][0].where.role).toBe('SUPERADMIN');
      expect(notifications.sendMany.mock.calls[0][0].every((n: any) => n.type === 'MESSAGE_RECEIVED')).toBe(true);
    });

    it('une reponse a une reponse reste dans le meme fil (parentId = message racine)', async () => {
      const root = message({ id: 'm-root', type: 'OTHER', senderId: 'u-a' });
      const child = message({ id: 'm-child', parentId: 'm-root', senderId: 'u-admin', recipientId: 'u-a', sender: { role: 'SUPERADMIN' } });
      prisma.message.findUnique.mockImplementation(({ where }: any) => ({ 'm-root': root, 'm-child': child })[where.id as string] ?? null);

      await service.reply('m-child', { body: 'Suite' } as any, clientA);

      expect(prisma.message.create.mock.calls[0][0].data.parentId).toBe('m-root');
      expect(prisma.message.create.mock.calls[0][0].data.subject).toBe('Re: Question');
    });

    it("n'accumule pas les 'Re:' dans le sujet", async () => {
      stubReadBack(message({ id: 'm-1', subject: 'Re: Re: Question' }));

      await service.reply('m-1', { body: 'x' } as any, clientA);

      expect(prisma.message.create.mock.calls[0][0].data.subject).toBe('Re: Question');
    });

    it("un client ne peut pas repondre dans un fil qui ne le concerne pas", async () => {
      stubReadBack(message({ id: 'm-1', senderId: 'u-a', recipientId: null, type: 'OTHER' }));

      await expect(service.reply('m-1', { body: 'x' } as any, clientB)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("le superadmin repond au client qui a ecrit (destinataire = l'expediteur) et passe le fil EN COURS", async () => {
      stubReadBack(message({ id: 'm-1', senderId: 'u-a', sender: { role: 'CLIENT' } }));

      await service.reply('m-1', { body: 'Bien recu' } as any, admin);

      expect(prisma.message.create.mock.calls[0][0].data.recipientId).toBe('u-a');
      expect(prisma.message.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { status: 'IN_PROGRESS' } });
    });

    it('suite publique du superadmin a une diffusion generale : visible de tous les clients actifs', async () => {
      stubReadBack(message({ id: 'm-b', type: 'BROADCAST', senderId: 'u-admin', recipientId: null, sender: { role: 'SUPERADMIN' } }));
      prisma.user.findMany.mockResolvedValue([{ id: 'u-a', email: 'a@c' }]);

      await service.reply('m-b', { body: 'Precision' } as any, admin);

      expect(prisma.message.create.mock.calls[0][0].data.recipientId).toBeNull();
      expect(prisma.user.findMany.mock.calls[0][0].where.role).toBe('CLIENT');
    });

    it('message introuvable', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.reply('inconnu', { body: 'x' } as any, clientA)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('lecture', () => {
    it('findAll (client) : uniquement ses messages, ceux qui lui sont adresses et les diffusions generales', async () => {
      await service.findAll({} as any, clientA);

      const where = prisma.message.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ senderId: 'u-a' }, { recipientId: 'u-a' }, { type: 'BROADCAST', recipientId: null }]);
    });

    it("findAll (client) : dans un fil, il ne voit pas les reponses privees des AUTRES clients", async () => {
      await service.findAll({} as any, clientA);

      const repliesWhere = prisma.message.findMany.mock.calls[0][0].include.replies.where;
      expect(repliesWhere.OR).toEqual([
        { senderId: 'u-a' },
        { recipientId: 'u-a' },
        { recipientId: null, sender: { role: 'SUPERADMIN' } },
      ]);
    });

    it('findAll (superadmin) : voit toutes les reponses des fils qu\'il traite', async () => {
      await service.findAll({} as any, admin);

      expect(prisma.message.findMany.mock.calls[0][0].include.replies.where).toEqual({});
    });

    it("findOne : refuse un message prive d'un autre client, autorise une diffusion generale", async () => {
      stubReadBack({ ...message({ id: 'm-1', senderId: 'u-a' }), sender: {}, recipient: null, replies: [] });
      await expect(service.findOne('m-1', clientB)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });

      stubReadBack({ ...message({ id: 'm-2', type: 'BROADCAST', senderId: 'u-admin', recipientId: null }), sender: {}, recipient: null, replies: [] });
      await expect(service.findOne('m-2', clientB)).resolves.toBeDefined();
    });
  });

  describe('statut et lecture', () => {
    it('seul le superadmin change le statut', async () => {
      await expect(service.updateStatus('m-1', 'CLOSED', clientA)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('markAsRead : refuse sans acces, sinon marque uniquement si on est le destinataire', async () => {
      prisma.message.findUnique.mockResolvedValue(message({ id: 'm-1', senderId: 'u-a', recipientId: null }));
      await expect(service.markAsRead('m-1', clientB)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });

      prisma.message.findUnique.mockResolvedValue(message({ id: 'm-2', type: 'OTHER', senderId: 'u-admin', recipientId: 'u-a' }));
      await service.markAsRead('m-2', clientA);
      expect(prisma.message.update).toHaveBeenCalledWith({ where: { id: 'm-2' }, data: { isRead: true } });
    });
  });
});
