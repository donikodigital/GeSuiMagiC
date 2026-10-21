//backend/src/meals/meals.service.spec.ts
/**
 * Regles du suivi de l'alimentation :
 *  - l'enveloppe du mois est posee par le client (ou le superadmin) ; le superviseur n'y touche pas ;
 *  - un report de reliquat est plafonne au reliquat reel (moins les depenses en attente) et exige une enveloppe ;
 *  - un report ne vise qu'un mois posterieur ; son annulation est refusee si l'argent a deja ete reporte plus loin ;
 *  - une demande de comptes recoit une seule reponse (mise a jour conditionnelle) ;
 *  - tout est trace dans l'audit.
 */

import { Prisma } from '@prisma/client';
import { MealsService } from './meals.service';

const D = (v: number | string) => new Prisma.Decimal(v);

describe('MealsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { send: jest.Mock; sendMany: jest.Mock };
  let service: MealsService;

  const client = { userId: 'u-client', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const supervisor = { userId: 'u-sup', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 'sp-1', tenantClientId: 'c-1' };
  const PROJECT = 'p-1';

  const envelope = (overrides: Record<string, unknown> = {}) => ({
    id: 'env-1',
    projectId: PROJECT,
    month: '2026-10',
    allocatedAmount: D(1000000),
    mealUnitCost: D(25000),
    categoryId: 'cat-food',
    note: null,
    category: { name: 'Alimentation' },
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00Z'));
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      expenseCategory: { findUnique: jest.fn().mockResolvedValue({ ownerClientId: null, isActive: true }) },
      mealEnvelope: {
        findMany: jest.fn().mockResolvedValue([envelope()]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create }: any) => ({ id: 'env-new', ...create })),
      },
      mealCarryOver: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'co-1', createdAt: new Date(), ...data })),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      workDay: {
        // 20 jours-ouvriers a 25 000 = 500 000 justifies
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-10-05T00:00:00Z'), isWorked: true, workersCount: 10, phaseId: 'ph-1' },
          { date: new Date('2026-10-06T00:00:00Z'), isWorked: true, workersCount: 10, phaseId: 'ph-1' },
        ]),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      mealAccountRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'rq-1', status: 'OPEN', response: null, ...data })),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      projectSupervisor: { findMany: jest.fn().mockResolvedValue([{ supervisor: { userId: 'u-sup' } }]) },
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'u-client' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ clientProfile: { firstName: 'Mamadou', lastName: 'Diallo' }, supervisorProfile: null }) },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { send: jest.fn().mockResolvedValue(undefined), sendMany: jest.fn().mockResolvedValue(undefined) };
    service = new MealsService(prisma, audit as any, notifications as any, { get: () => 'https://app.test' } as any);
  });

  afterEach(() => jest.useRealTimers());

  describe('getMonth', () => {
    it("calcule ce que les presences justifient et le reliquat", async () => {
      prisma.expense.findMany.mockResolvedValue([
        { date: new Date('2026-10-07T00:00:00Z'), total: D(300000), status: 'APPROVED', categoryId: 'cat-food' },
        { date: new Date('2026-10-08T00:00:00Z'), total: D(50000), status: 'PENDING', categoryId: 'cat-food' },
      ]);

      const result = await service.getMonth(PROJECT, '2026-10');

      expect(result.amounts).toMatchObject({ justifiedAmount: '500000.00', spentAmount: '300000.00', pendingAmount: '50000.00', remainingAmount: '700000.00' });
      expect(result.envelope).toMatchObject({ allocatedAmount: '1000000.00', categoryName: 'Alimentation' });
    });

    it("refuse un projet inexistant (le superadmin passe le guard pour n'importe quel identifiant)", async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.getMonth(PROJECT, '2026-10')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('upsertEnvelope', () => {
    const dto = { allocatedAmount: 1000000, mealUnitCost: 25000, categoryId: 'cat-food', note: ' repas ' };

    it("enregistre l'enveloppe et l'ecrit dans l'audit", async () => {
      await service.upsertEnvelope(PROJECT, '2026-10', dto as any, client);

      const args = prisma.mealEnvelope.upsert.mock.calls[0][0];
      expect(args.create).toMatchObject({ projectId: PROJECT, month: '2026-10', createdById: 'u-client', categoryId: 'cat-food', note: 'repas' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'MealEnvelope' }), prisma);
    });

    it("est interdit au superviseur", async () => {
      await expect(service.upsertEnvelope(PROJECT, '2026-10', dto as any, supervisor)).rejects.toMatchObject({ status: 403 });
      expect(prisma.mealEnvelope.upsert).not.toHaveBeenCalled();
    });

    it("refuse une categorie privee d'un autre client", async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: 'c-other', isActive: true });
      await expect(service.upsertEnvelope(PROJECT, '2026-10', dto as any, client)).rejects.toMatchObject({ status: 400 });
    });

    it("refuse de descendre sous ce qui a deja ete reporte vers d'autres mois", async () => {
      prisma.mealCarryOver.aggregate.mockImplementation(({ where }: any) => ({ _sum: { amount: where.fromMonth ? D(400000) : null } }));
      await expect(service.upsertEnvelope(PROJECT, '2026-10', { ...dto, allocatedAmount: 300000 } as any, client)).rejects.toMatchObject({ status: 409 });
      expect(prisma.mealEnvelope.upsert).not.toHaveBeenCalled();
    });

    it("refuse un projet suspendu pour un client", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'SUSPENDED', currency: 'GNF' });
      await expect(service.upsertEnvelope(PROJECT, '2026-10', dto as any, client)).rejects.toBeDefined();
    });
  });

  describe('createCarryOver', () => {
    it("reporte le reliquat sur un mois suivant et l'ecrit dans l'audit", async () => {
      await service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-11', amount: 500000, reason: ' reste ' } as any, client);

      expect(prisma.mealCarryOver.create.mock.calls[0][0].data).toMatchObject({ projectId: PROJECT, fromMonth: '2026-10', toMonth: '2026-11', createdById: 'u-client', reason: 'reste' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'MealCarryOver' }), prisma);
    });

    it("refuse de reporter plus que le reliquat", async () => {
      // reliquat = 1 000 000 - 0 depense = 1 000 000
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-11', amount: 1000001 } as any, client)).rejects.toMatchObject({ status: 409 });
      expect(prisma.mealCarryOver.create).not.toHaveBeenCalled();
    });

    it("deduit les depenses en attente du montant reportable", async () => {
      prisma.expense.findMany.mockResolvedValue([{ date: new Date('2026-10-08T00:00:00Z'), total: D(400000), status: 'PENDING', categoryId: 'cat-food' }]);
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-11', amount: 700000 } as any, client)).rejects.toMatchObject({ status: 409 });
    });

    it("refuse un mois de destination qui ne suit pas le mois d'origine", async () => {
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-10', amount: 1000 } as any, client)).rejects.toMatchObject({ status: 400 });
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-09', amount: 1000 } as any, client)).rejects.toMatchObject({ status: 400 });
    });

    it("exige une enveloppe pour le mois d'origine", async () => {
      prisma.mealEnvelope.findMany.mockResolvedValue([]);
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-11', amount: 1000 } as any, client)).rejects.toMatchObject({ status: 400 });
    });

    it("est interdit au superviseur", async () => {
      await expect(service.createCarryOver(PROJECT, '2026-10', { toMonth: '2026-11', amount: 1000 } as any, supervisor)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('deleteCarryOver', () => {
    const carryOver = { id: 'co-1', projectId: PROJECT, fromMonth: '2026-10', toMonth: '2026-11', amount: D(200000) };

    it("annule un report avec un motif et le trace", async () => {
      prisma.mealCarryOver.findFirst.mockResolvedValue(carryOver);
      // le mois de destination a recu 200 000 (enveloppe 0) : il n'a rien re-reporte
      prisma.mealEnvelope.findMany.mockResolvedValue([envelope({ month: '2026-11', allocatedAmount: D(0) })]);
      prisma.mealCarryOver.findMany.mockResolvedValue([{ ...carryOver }]);

      await service.deleteCarryOver(PROJECT, 'co-1', { reason: 'erreur de saisie' } as any, client);

      expect(prisma.mealCarryOver.delete).toHaveBeenCalledWith({ where: { id: 'co-1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'MealCarryOver', reason: 'erreur de saisie' }), prisma);
    });

    it("refuse si le mois de destination a deja re-reporte cet argent", async () => {
      prisma.mealCarryOver.findFirst.mockResolvedValue(carryOver);
      prisma.mealEnvelope.findMany.mockResolvedValue([envelope({ month: '2026-11', allocatedAmount: D(0) })]);
      prisma.mealCarryOver.findMany.mockResolvedValue([carryOver, { id: 'co-2', fromMonth: '2026-11', toMonth: '2026-12', amount: D(150000) }]);

      await expect(service.deleteCarryOver(PROJECT, 'co-1', { reason: 'erreur' } as any, client)).rejects.toMatchObject({ status: 409 });
      expect(prisma.mealCarryOver.delete).not.toHaveBeenCalled();
    });

    it("repond 404 pour un report d'un autre projet", async () => {
      prisma.mealCarryOver.findFirst.mockResolvedValue(null);
      await expect(service.deleteCarryOver(PROJECT, 'co-x', { reason: 'x' } as any, client)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('demandes de comptes', () => {
    it("cree une demande et previent les superviseurs affectes", async () => {
      await service.createRequest(PROJECT, '2026-10', { message: ' Pourquoi 5 jours seulement ? ' } as any, client);

      expect(prisma.mealAccountRequest.create.mock.calls[0][0].data).toMatchObject({ projectId: PROJECT, month: '2026-10', message: 'Pourquoi 5 jours seulement ?', requestedById: 'u-client' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'MealAccountRequest', action: 'CREATE' }), prisma);
      const inputs = notifications.sendMany.mock.calls[0][0];
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toMatchObject({ userId: 'u-sup', type: 'MEAL_ACCOUNT_REQUESTED' });
    });

    it("limite le nombre de demandes ouvertes pour un meme mois", async () => {
      prisma.mealAccountRequest.count.mockResolvedValue(5);
      await expect(service.createRequest(PROJECT, '2026-10', { message: 'x' } as any, client)).rejects.toMatchObject({ status: 409 });
    });

    it("le superviseur repond et le client est notifie", async () => {
      prisma.mealAccountRequest.findFirst.mockResolvedValue({ id: 'rq-1', projectId: PROJECT, status: 'OPEN' });
      prisma.mealAccountRequest.findUniqueOrThrow.mockResolvedValue({ id: 'rq-1', month: '2026-10', status: 'ANSWERED', response: 'Pluie' });

      await service.answerRequest(PROJECT, 'rq-1', { response: ' Pluie ' } as any, supervisor);

      expect(prisma.mealAccountRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rq-1', status: 'OPEN' } }));
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-client', type: 'MEAL_ACCOUNT_ANSWERED' }));
    });

    it("refuse une seconde reponse concurrente", async () => {
      prisma.mealAccountRequest.findFirst.mockResolvedValue({ id: 'rq-1', projectId: PROJECT, status: 'OPEN' });
      prisma.mealAccountRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.answerRequest(PROJECT, 'rq-1', { response: 'x' } as any, supervisor)).rejects.toMatchObject({ status: 409 });
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it("le client ne peut pas repondre a sa propre demande", async () => {
      await expect(service.answerRequest(PROJECT, 'rq-1', { response: 'x' } as any, client)).rejects.toMatchObject({ status: 403 });
    });

    it("une notification en echec ne fait pas echouer l'operation", async () => {
      notifications.sendMany.mockRejectedValue(new Error('smtp'));
      await expect(service.createRequest(PROJECT, '2026-10', { message: 'x' } as any, client)).resolves.toMatchObject({ id: 'rq-1' });
    });

    it("cloture une demande", async () => {
      prisma.mealAccountRequest.findFirst.mockResolvedValue({ id: 'rq-1', projectId: PROJECT, status: 'ANSWERED' });
      prisma.mealAccountRequest.findUniqueOrThrow.mockResolvedValue({ id: 'rq-1', status: 'CLOSED' });
      await expect(service.closeRequest(PROJECT, 'rq-1', client)).resolves.toMatchObject({ status: 'CLOSED' });
    });

    it("refuse de cloturer une demande deja cloturee", async () => {
      prisma.mealAccountRequest.findFirst.mockResolvedValue({ id: 'rq-1', projectId: PROJECT, status: 'CLOSED' });
      prisma.mealAccountRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.closeRequest(PROJECT, 'rq-1', client)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('listMonths', () => {
    it("inclut toujours le mois courant, du plus recent au plus ancien", async () => {
      prisma.mealEnvelope.findMany.mockResolvedValue([envelope({ month: '2026-08' })]);
      const months = await service.listMonths(PROJECT);
      expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-08']);
    });
  });
});
