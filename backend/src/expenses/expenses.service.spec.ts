//backend/src/expenses/expenses.service.spec.ts
import { ExpensesService } from './expenses.service';

/**
 * Tests unitaires cibles sur la regle metier la plus sensible du module :
 * - section 19 : seuil de validation configurable par projet
 * - regle explicite du client (remplace la section 20 du cahier des
 *   charges d'origine) : une depense n'est JAMAIS bloquee par un solde
 *   insuffisant, le solde peut devenir negatif.
 * - correction administrative et annulation : le solde ne doit etre
 *   recalcule que dans les cas prevus (jamais sur une depense encore en
 *   attente, toujours apres une annulation validee).
 *
 * Les dependances Prisma/Wallets/Audit/Notifications/Budgets sont mockees :
 * ce test verifie le COMPORTEMENT du service, pas l'integration DB reelle
 * (voir test/ pour des tests e2e sur une base de test).
 */
describe('ExpensesService', () => {
  const baseProject = {
    id: 'project-1',
    clientId: 'client-1',
    currency: 'GNF',
    budget: 500000000,
    autoApproveExpenses: true,
    expenseApprovalThreshold: 5000000,
  };

  function buildService(projectOverrides: Partial<typeof baseProject> = {}) {
    const project = { ...baseProject, ...projectOverrides };

    const createdExpense = { id: 'expense-1' };

    const txMock = {
      expense: { create: jest.fn().mockResolvedValue(createdExpense) },
    };

    const prisma = {
      project: { findUniqueOrThrow: jest.fn().mockResolvedValue(project) },
      expenseCategory: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Ciment' }) },
      clientProfile: { findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'user-client-1', firstName: 'Mamadou' }) },
      expense: { findUnique: jest.fn().mockResolvedValue({ ...createdExpense, total: 0, amountPaidToSupplier: 0 }) },
      runInTransaction: jest.fn(async (fn: any) => fn(txMock)),
    } as any;

    const wallets = {
      recompute: jest.fn().mockResolvedValue(undefined),
      getWallet: jest.fn().mockResolvedValue({ balance: 10000000 }),
    } as any;

    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;
    const budgets = { isCategoryOverBudget: jest.fn().mockResolvedValue(false) } as any;
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000') } as any;

    const service = new ExpensesService(prisma, wallets, audit, notifications, budgets, config);
    return { service, prisma, wallets, audit, notifications, txMock };
  }

  const actor = { userId: 'user-supervisor-1', email: 'supervisor@example.com', role: 'SUPERVISOR' as const, supervisorProfileId: 'sup-1' };
  const adminActor = { userId: 'user-admin-1', email: 'admin@example.com', role: 'SUPERADMIN' as const };

  describe('create', () => {
    it('valide automatiquement une depense sous le seuil configure et met a jour le solde', async () => {
      const { service, txMock, wallets } = buildService();

      await service.create(
        'project-1',
        { categoryId: 'cat-1', label: 'Sable', quantity: 5, unit: 'voyage', unitPrice: 1000000 } as any,
        actor,
      );

      const createCall = txMock.expense.create.mock.calls[0][0];
      expect(createCall.data.total.toString()).toBe('5000000'); // 5 * 1 000 000, egal au seuil -> pas superieur, donc pas de confirmation requise
      expect(createCall.data.status).toBe('APPROVED');
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', txMock);
    });

    it('exige la confirmation du client pour une depense qui depasse le seuil, sans toucher au solde', async () => {
      const { service, txMock, wallets, notifications } = buildService();

      await service.create(
        'project-1',
        { categoryId: 'cat-1', label: 'Ciment', quantity: 100, unit: 'sac', unitPrice: 150000 } as any, // total = 15 000 000 > seuil 5 000 000
        actor,
      );

      const createCall = txMock.expense.create.mock.calls[0][0];
      expect(createCall.data.total.toString()).toBe('15000000');
      expect(createCall.data.status).toBe('PENDING');
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPENSE_PENDING_APPROVAL' }));
    });

    it('ne bloque JAMAIS une depense superieure au solde disponible - le solde peut devenir negatif', async () => {
      // Le wallet simule un solde tres faible (2 000 000), et le seuil de validation
      // est desactive (autoApproveExpenses=false) pour forcer un passage par approve().
      const { service, txMock, wallets } = buildService({ autoApproveExpenses: false });
      wallets.getWallet.mockResolvedValue({ balance: 2000000 });

      // Une depense de 5 000 000 alors que le solde ne vaut que 2 000 000 : doit
      // etre acceptee sans lever d'exception (contrairement a la section 20 du
      // cahier des charges d'origine, explicitement remplacee par le client).
      await expect(
        service.create(
          'project-1',
          { categoryId: 'cat-1', label: 'Fer 12', quantity: 10, unit: 'barre', unitPrice: 500000 } as any, // total = 5 000 000
          actor,
        ),
      ).resolves.toBeDefined();

      const createCall = txMock.expense.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('PENDING'); // autoApproveExpenses=false -> confirmation client requise, mais AUCUN blocage
    });
  });

  describe('correctAmount', () => {
    function buildCorrectionService(expenseOverrides: Record<string, any> = {}) {
      const expense = {
        id: 'expense-1',
        projectId: 'project-1',
        status: 'APPROVED',
        total: 5000000,
        project: { clientId: 'client-1', currency: 'GNF' },
        ...expenseOverrides,
      };

      const txMock = {
        expense: { update: jest.fn().mockResolvedValue(undefined) },
        financialCorrection: { create: jest.fn().mockResolvedValue(undefined) },
      };

      const prisma = {
        expense: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(expense),
          findUnique: jest.fn().mockResolvedValue({ ...expense, amountPaidToSupplier: 0 }),
        },
        clientProfile: { findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'user-client-1', firstName: 'Mamadou' }) },
        runInTransaction: jest.fn(async (fn: any) => fn(txMock)),
      } as any;

      const wallets = { recompute: jest.fn().mockResolvedValue(undefined) } as any;
      const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
      const notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;
      const budgets = { isCategoryOverBudget: jest.fn().mockResolvedValue(false) } as any;
      const config = { get: jest.fn().mockReturnValue('http://localhost:3000') } as any;

      const service = new ExpensesService(prisma, wallets, audit, notifications, budgets, config);
      return { service, txMock, wallets };
    }

    it('recalcule le solde si la depense etait deja APPROVED', async () => {
      const { service, txMock, wallets } = buildCorrectionService({ status: 'APPROVED' });

      await service.correctAmount('expense-1', 6000000, 'Erreur de quantite', adminActor);

      expect(txMock.financialCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entityType: 'Expense', entityId: 'expense-1', oldValue: 5000000, newValue: 6000000 }) }),
      );
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', txMock);
    });

    it("ne recalcule PAS le solde si la depense n'a jamais ete APPROVED (encore PENDING)", async () => {
      const { service, txMock, wallets } = buildCorrectionService({ status: 'PENDING' });

      await service.correctAmount('expense-1', 6000000, 'Erreur de quantite', adminActor);

      expect(txMock.financialCorrection.create).toHaveBeenCalled(); // la trace de correction est toujours conservee
      expect(wallets.recompute).not.toHaveBeenCalled(); // mais le solde n'a pas a bouger, la depense ne comptait deja pas dedans
    });
  });

  describe('cancel', () => {
    function buildCancelService(status: string) {
      const expense = { id: 'expense-1', projectId: 'project-1', status, total: 5000000 };

      const txMock = { expense: { update: jest.fn().mockResolvedValue(undefined) } };

      const prisma = {
        expense: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(expense),
          findUnique: jest.fn().mockResolvedValue({ ...expense, status: 'CANCELLED', amountPaidToSupplier: 0 }),
        },
        runInTransaction: jest.fn(async (fn: any) => fn(txMock)),
      } as any;

      const wallets = { recompute: jest.fn().mockResolvedValue(undefined) } as any;
      const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
      const notifications = { send: jest.fn().mockResolvedValue(undefined) } as any;
      const budgets = { isCategoryOverBudget: jest.fn().mockResolvedValue(false) } as any;
      const config = { get: jest.fn().mockReturnValue('http://localhost:3000') } as any;

      const service = new ExpensesService(prisma, wallets, audit, notifications, budgets, config);
      return { service, txMock, wallets };
    }

    it("refuse d'annuler une depense qui n'est pas APPROVED", async () => {
      const { service, wallets } = buildCancelService('PENDING');

      await expect(service.cancel('expense-1', 'Doublon', adminActor)).rejects.toThrow();
      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('recalcule le solde apres annulation - le solde doit augmenter puisque la depense ne compte plus', async () => {
      const { service, txMock, wallets } = buildCancelService('APPROVED');

      await service.cancel('expense-1', 'Doublon', adminActor);

      expect(txMock.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
      );
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', txMock);
    });
  });
});