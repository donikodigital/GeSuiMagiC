//backend/src/anomalies/anomalies.service.spec.ts
import { AnomaliesService } from './anomalies.service';

describe('AnomaliesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { send: jest.Mock; sendMany: jest.Mock };
  let service: AnomaliesService;

  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1', tenantClientId: 'c-1' };
  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };

  const dto = (overrides: Record<string, unknown> = {}) => ({ category: 'doublon', description: 'Depense en double', ...overrides });

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Villa', clientId: 'c-1' }) },
      expense: { findFirst: jest.fn().mockResolvedValue({ id: 'e-1' }) },
      anomaly: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'an-1', ...data })),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'an-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-admin', email: 'a@x' }]) },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { send: jest.fn().mockResolvedValue(undefined), sendMany: jest.fn().mockResolvedValue(undefined) };
    service = new AnomaliesService(prisma, audit as any, notifications as any, { get: () => 'https://app.example' } as any);
  });

  describe('create', () => {
    it('est reserve aux clients', async () => {
      await expect(service.create('p-1', dto() as any, supervisor)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.create('p-1', dto() as any, admin)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    });

    it('le projet doit appartenir au client', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.create('p-autre', dto() as any, client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p-autre', clientId: 'c-1' } }));
      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });

    it("la depense liee doit appartenir a CE projet (pas celle d'un autre client)", async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service.create('p-1', dto({ relatedExpenseId: 'e-autre' }) as any, client)).rejects.toMatchObject({
        code: 'INVALID_RELATED_EXPENSE',
      });
      expect(prisma.expense.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e-autre', projectId: 'p-1' } }));
    });

    it("enregistre l'anomalie et son audit dans la meme transaction, puis previent les superadmins en une seule ecriture groupee", async () => {
      await service.create('p-1', dto({ relatedExpenseId: 'e-1' }) as any, client);

      expect(prisma.anomaly.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p-1', clientId: 'c-1', reportedById: 'u-c', status: 'OPEN' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'Anomaly' }), prisma);
      expect(notifications.sendMany).toHaveBeenCalledTimes(1);
      expect(notifications.sendMany.mock.calls[0][0][0]).toMatchObject({ userId: 'u-admin', type: 'ANOMALY_REPORTED' });
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it("un echec de notification ne fait pas echouer le signalement deja enregistre", async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db'));

      await expect(service.create('p-1', dto() as any, client)).resolves.toMatchObject({ id: 'an-1' });
    });
  });

  describe('lecture', () => {
    it("findAllForProject filtre toujours sur le projet (et sur le statut si fourni)", async () => {
      await service.findAllForProject('p-1', { status: 'OPEN' } as any);

      expect(prisma.anomaly.findMany.mock.calls[0][0].where).toEqual({ projectId: 'p-1', status: 'OPEN' });
    });

    it('findAllForSuperadmin pagine et filtre par statut', async () => {
      await service.findAllForSuperadmin({ page: 2, limit: 10, status: 'RESOLVED' } as any);

      const call = prisma.anomaly.findMany.mock.calls[0][0];
      expect(call).toMatchObject({ where: { status: 'RESOLVED' }, skip: 10, take: 10 });
    });
  });

  describe('updateStatus', () => {
    const existing = { id: 'an-1', status: 'OPEN', resolutionNote: null, client: { userId: 'u-c' } };

    it("met a jour, journalise dans la transaction et previent le client apres coup", async () => {
      prisma.anomaly.findUnique.mockResolvedValue(existing);

      await service.updateStatus('an-1', { status: 'RESOLVED', resolutionNote: 'Corrige' } as any, admin);

      expect(prisma.anomaly.update).toHaveBeenCalledWith({ where: { id: 'an-1' }, data: { status: 'RESOLVED', resolutionNote: 'Corrige' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', oldValue: expect.objectContaining({ status: 'OPEN' }) }), prisma);
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-c', type: 'ANOMALY_UPDATED' }));
    });

    it("conserve la note de resolution existante si aucune n'est fournie", async () => {
      prisma.anomaly.findUnique.mockResolvedValue({ ...existing, resolutionNote: 'Note precedente' });

      await service.updateStatus('an-1', { status: 'CLOSED' } as any, admin);

      expect(prisma.anomaly.update.mock.calls[0][0].data.resolutionNote).toBe('Note precedente');
    });

    it('anomalie introuvable -> 404 (et non une erreur 500)', async () => {
      prisma.anomaly.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('inconnue', { status: 'CLOSED' } as any, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
