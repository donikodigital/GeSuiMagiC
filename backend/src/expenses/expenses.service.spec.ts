//backend/src/expenses/expenses.service.spec.ts
/**
 * Tests cibles sur les regles metier les plus sensibles des depenses :
 *  - seuil de validation configurable par projet + regle ANTI-FRACTIONNEMENT (cumul recent d'un meme superviseur) ;
 *  - une depense n'est JAMAIS bloquee par un solde insuffisant (le solde peut devenir negatif) ;
 *  - decisions atomiques (mise a jour conditionnelle sur le statut PENDING) ;
 *  - le solde n'est recalcule que dans les cas prevus ;
 *  - catalogue cloisonne par client (categorie / materiau d'un autre client refuses) ;
 *  - alertes limitees a une par jour, et qui ne font jamais echouer l'operation.
 *
 * Prisma / Wallets / Audit / Notifications / Budgets sont mockes : ces tests verifient le COMPORTEMENT
 * du service, pas l'integration avec la base reelle.
 */

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpensesService } from './expenses.service';

const D = (value: string | number) => new Prisma.Decimal(value);

describe('ExpensesService', () => {
  const baseProject = {
    id: 'project-1',
    name: 'Villa',
    clientId: 'client-1',
    currency: 'GNF',
    status: 'ACTIVE',
    budget: D(500_000_000),
    autoApproveExpenses: true,
    expenseApprovalThreshold: D(5_000_000),
  };

  const supervisor = { userId: 'user-supervisor-1', email: 's@example.com', role: 'SUPERVISOR' as const, supervisorProfileId: 'sup-1' };
  const otherSupervisor = { userId: 'user-supervisor-2', email: 's2@example.com', role: 'SUPERVISOR' as const, supervisorProfileId: 'sup-2' };
  const client = { userId: 'user-client-1', email: 'c@example.com', role: 'CLIENT' as const, clientProfileId: 'client-1' };
  const otherClient = { userId: 'user-client-2', email: 'c2@example.com', role: 'CLIENT' as const, clientProfileId: 'client-2' };
  const admin = { userId: 'user-admin-1', email: 'a@example.com', role: 'SUPERADMIN' as const };

  const expenseRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'expense-1',
    projectId: 'project-1',
    supervisorId: 'sup-1',
    categoryId: 'cat-1',
    materialId: null,
    label: 'Ciment',
    status: 'PENDING',
    quantity: D(10),
    unitPrice: D(1_000_000),
    total: D(10_000_000),
    paymentStatus: 'PAID_FULL',
    amountPaidToSupplier: D(10_000_000),
    isArchived: false,
    project: { ...baseProject },
    supervisor: { userId: 'user-supervisor-1' },
    ...overrides,
  });

  function build(options: { project?: Record<string, unknown>; windowHours?: number } = {}) {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const prisma: any = {
      project: { findUnique: jest.fn().mockResolvedValue({ ...baseProject, ...options.project }) },
      expenseCategory: { findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Ciment', isActive: true, ownerClientId: null }) },
      material: { findUnique: jest.fn() },
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-client-1', firstName: 'Mamadou' }) },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      financialCorrection: { create: jest.fn() },
      expense: {
        findUnique: jest.fn().mockResolvedValue(expenseRow()),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'expense-new', ...data })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    // Le client de transaction est le mock lui-meme.
    prisma.runInTransaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const wallets = {
      recompute: jest.fn().mockResolvedValue(undefined),
      getWallet: jest.fn().mockResolvedValue({ balance: D(100_000_000) }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = { send: jest.fn().mockResolvedValue(undefined), sendMany: jest.fn().mockResolvedValue(undefined) };
    const budgets = { isCategoryOverBudget: jest.fn().mockResolvedValue(false) };
    const settings: Record<string, unknown> = { frontendUrl: 'http://localhost:3000', 'expenses.cumulativeWindowHours': options.windowHours ?? 0 };
    const config = { get: jest.fn((key: string) => settings[key]) };

    const service = new ExpensesService(prisma, wallets as any, audit as any, notifications as any, budgets as any, config as any);
    return { service, prisma, wallets, audit, notifications, budgets };
  }

  const dto = (overrides: Record<string, unknown> = {}) => ({
    categoryId: 'cat-1',
    label: 'Sable',
    quantity: 5,
    unit: 'voyage',
    unitPrice: 1_000_000,
    ...overrides,
  });

  // ---------------------------------------------------------------------
  describe('create', () => {
    it('valide automatiquement une depense sous le seuil et recalcule le solde dans la meme transaction', async () => {
      const { service, prisma, wallets } = build();

      await service.create('project-1', dto() as any, supervisor);

      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.total.toString()).toBe('5000000'); // egal au seuil : pas SUPERIEUR, donc pas de confirmation requise
      expect(data.status).toBe('APPROVED');
      expect(data.isLocked).toBe(true);
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', prisma);
    });

    it('exige la confirmation du client au-dessus du seuil, sans toucher au solde', async () => {
      const { service, prisma, wallets, notifications } = build();

      await service.create('project-1', dto({ unitPrice: 1_000_001 }) as any, supervisor);

      expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('PENDING');
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-client-1', type: 'EXPENSE_PENDING_APPROVAL', meta: expect.objectContaining({ projectId: 'project-1' }) }),
      );
    });

    it("exige la confirmation du client quand la validation automatique est desactivee sur le projet", async () => {
      const { service, prisma } = build({ project: { autoApproveExpenses: false } });

      await service.create('project-1', dto({ quantity: 1, unitPrice: 100 }) as any, supervisor);

      expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('PENDING');
    });

    it('ne bloque JAMAIS une depense superieure au solde disponible - le solde peut devenir negatif', async () => {
      const { service, prisma, wallets } = build();
      wallets.getWallet.mockResolvedValue({ balance: D(-2_000_000) });

      await service.create('project-1', dto() as any, supervisor);

      expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('APPROVED');
    });

    it('arrondit le total a 2 decimales (3 x 0,335 = 1,005 -> 1,01)', async () => {
      const { service, prisma } = build();

      await service.create('project-1', dto({ quantity: 3, unitPrice: 0.335 }) as any, supervisor);

      expect(prisma.expense.create.mock.calls[0][0].data.total.toString()).toBe('1.01');
    });

    describe('anti-fractionnement', () => {
      it("soumet au client une depense sous le seuil dont le cumul recent du superviseur depasse le seuil", async () => {
        const { service, prisma, wallets, audit } = build({ windowHours: 24 });
        prisma.expense.aggregate.mockResolvedValue({ _sum: { total: D(4_000_000) } });

        await service.create('project-1', dto({ quantity: 1, unitPrice: 2_000_000 }) as any, supervisor);

        expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('PENDING');
        expect(wallets.recompute).not.toHaveBeenCalled();
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({ newValue: expect.objectContaining({ reason: expect.stringContaining('Cumul') }) }),
          prisma,
        );
        // Le cumul est calcule pour CE superviseur et CE projet, sur les depenses valides ou en attente.
        expect(prisma.expense.aggregate.mock.calls[0][0].where).toMatchObject({
          projectId: 'project-1',
          supervisorId: 'sup-1',
          status: { in: ['APPROVED', 'PENDING'] },
        });
      });

      it('valide normalement si le cumul reste sous le seuil', async () => {
        const { service, prisma } = build({ windowHours: 24 });
        prisma.expense.aggregate.mockResolvedValue({ _sum: { total: D(1_000_000) } });

        await service.create('project-1', dto({ quantity: 1, unitPrice: 2_000_000 }) as any, supervisor);

        expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('APPROVED');
      });

      it('est desactivee quand la fenetre vaut 0 (aucune requete de cumul)', async () => {
        const { service, prisma } = build({ windowHours: 0 });

        await service.create('project-1', dto({ quantity: 1, unitPrice: 2_000_000 }) as any, supervisor);

        expect(prisma.expense.aggregate).not.toHaveBeenCalled();
      });
    });

    it.each(['SUSPENDED', 'COMPLETED', 'ARCHIVED'])('refuse une depense sur un projet %s', async (status) => {
      const { service, prisma } = build({ project: { status } });

      await expect(service.create('project-1', dto() as any, supervisor)).rejects.toMatchObject({ code: 'PROJECT_NOT_ACTIVE' });
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('est reservee aux superviseurs ayant un profil', async () => {
      const { service } = build();

      await expect(service.create('project-1', dto() as any, client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.create('project-1', dto() as any, { ...supervisor, supervisorProfileId: undefined })).rejects.toMatchObject({
        code: 'PROJECT_ACCESS_DENIED',
      });
    });

    it('refuse un total qui depasse la capacite de la colonne (erreur claire au lieu d\'un 500)', async () => {
      const { service } = build();

      await expect(service.create('project-1', dto({ quantity: 999_999_999, unitPrice: 9_999_999_999_999 }) as any, supervisor)).rejects.toMatchObject({
        code: 'AMOUNT_OUT_OF_RANGE',
      });
    });

    it('refuse un paiement partiel incoherent (montant verse >= total)', async () => {
      const { service } = build();

      await expect(
        service.create('project-1', dto({ paymentStatus: 'PARTIAL', amountPaidToSupplier: 5_000_000 }) as any, supervisor),
      ).rejects.toMatchObject({ code: 'INVALID_PARTIAL_PAYMENT' });
    });

    it("n'echoue pas si la notification au client echoue", async () => {
      const { service, notifications } = build();
      notifications.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.create('project-1', dto({ unitPrice: 1_000_001 }) as any, supervisor)).resolves.toBeDefined();
    });

    describe('catalogue cloisonne par client', () => {
      it('accepte une categorie globale et une categorie privee du client du projet', async () => {
        const { service, prisma } = build();

        await expect(service.create('project-1', dto() as any, supervisor)).resolves.toBeDefined();

        prisma.expenseCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Perso', isActive: true, ownerClientId: 'client-1' });
        await expect(service.create('project-1', dto() as any, supervisor)).resolves.toBeDefined();
      });

      it("refuse la categorie privee d'un AUTRE client", async () => {
        const { service, prisma } = build();
        prisma.expenseCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Autre', isActive: true, ownerClientId: 'client-2' });

        await expect(service.create('project-1', dto() as any, supervisor)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
        expect(prisma.expense.create).not.toHaveBeenCalled();
      });

      it('refuse une categorie inactive ou inexistante', async () => {
        const { service, prisma } = build();
        prisma.expenseCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Ciment', isActive: false, ownerClientId: null });
        await expect(service.create('project-1', dto() as any, supervisor)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });

        prisma.expenseCategory.findUnique.mockResolvedValue(null);
        await expect(service.create('project-1', dto() as any, supervisor)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
      });

      it("refuse le materiau d'un autre client, un materiau inactif ou d'une autre categorie", async () => {
        const { service, prisma } = build();
        const material = { id: 'mat-1', isActive: true, categoryId: 'cat-1', ownerClientId: null };

        prisma.material.findUnique.mockResolvedValue({ ...material, ownerClientId: 'client-2' });
        await expect(service.create('project-1', dto({ materialId: 'mat-1' }) as any, supervisor)).rejects.toMatchObject({ code: 'INVALID_MATERIAL' });

        prisma.material.findUnique.mockResolvedValue({ ...material, isActive: false });
        await expect(service.create('project-1', dto({ materialId: 'mat-1' }) as any, supervisor)).rejects.toMatchObject({ code: 'INVALID_MATERIAL' });

        prisma.material.findUnique.mockResolvedValue({ ...material, categoryId: 'cat-autre' });
        await expect(service.create('project-1', dto({ materialId: 'mat-1' }) as any, supervisor)).rejects.toMatchObject({
          code: 'MATERIAL_CATEGORY_MISMATCH',
        });

        prisma.material.findUnique.mockResolvedValue(material);
        await expect(service.create('project-1', dto({ materialId: 'mat-1' }) as any, supervisor)).resolves.toBeDefined();
      });
    });
  });

  // ---------------------------------------------------------------------
  describe('approve (decision du client)', () => {
    it('valide de facon conditionnelle, recalcule le solde et journalise dans la meme transaction', async () => {
      const { service, prisma, wallets, audit } = build();

      await service.approve('expense-1', client);

      expect(prisma.expense.updateMany).toHaveBeenCalledWith({
        where: { id: 'expense-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', isLocked: true, approvedById: 'user-client-1' }),
      });
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', prisma);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }), prisma);
    });

    it("refuse un autre client, un superviseur ou le superadmin", async () => {
      const { service, prisma } = build();

      for (const actor of [otherClient, supervisor, admin]) {
        await expect(service.approve('expense-1', actor as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      }
      expect(prisma.expense.updateMany).not.toHaveBeenCalled();
    });

    it('refuse une depense deja traitee', async () => {
      const { service, prisma } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'APPROVED' }));

      await expect(service.approve('expense-1', client)).rejects.toMatchObject({ code: 'EXPENSE_NOT_PENDING' });
    });

    it("signale un conflit si une autre decision est passee entre-temps (0 ligne modifiee) sans recalcul", async () => {
      const { service, prisma, wallets, audit } = build();
      prisma.expense.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('expense-1', client)).rejects.toMatchObject({ code: 'EXPENSE_NOT_PENDING' });
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('reject (decision du client)', () => {
    it('refuse sans toucher au solde et previent le superviseur', async () => {
      const { service, prisma, wallets, notifications } = build();

      await service.reject('expense-1', 'Prix trop eleve', client);

      expect(prisma.expense.updateMany).toHaveBeenCalledWith({
        where: { id: 'expense-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Prix trop eleve' }),
      });
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-supervisor-1', type: 'EXPENSE_REJECTED' }));
    });

    it('ne peut pas ecraser une validation concurrente', async () => {
      const { service, prisma } = build();
      prisma.expense.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject('expense-1', 'Motif', client)).rejects.toMatchObject({ code: 'EXPENSE_NOT_PENDING' });
    });
  });

  // ---------------------------------------------------------------------
  describe('cancel (superadmin)', () => {
    it('recalcule le solde apres annulation - il augmente puisque la depense ne compte plus', async () => {
      const { service, prisma, wallets } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'APPROVED' }));

      await service.cancel('expense-1', 'Erreur', admin);

      expect(prisma.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
      expect(wallets.recompute).toHaveBeenCalledWith('project-1', prisma);
    });

    it('refuse d\'annuler une depense non validee', async () => {
      const { service, prisma } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'PENDING' }));

      await expect(service.cancel('expense-1', 'Erreur', admin)).rejects.toMatchObject({ code: 'EXPENSE_NOT_APPROVED' });
    });
  });

  describe('remove (suppression logique)', () => {
    it("ne recalcule pas le solde pour une depense jamais validee", async () => {
      const { service, wallets } = build();

      await service.remove('expense-1', 'Doublon', admin);

      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('recalcule le solde pour une depense validee et refuse une double suppression', async () => {
      const { service, prisma, wallets } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'APPROVED' }));
      await service.remove('expense-1', 'Doublon', admin);
      expect(wallets.recompute).toHaveBeenCalledTimes(1);

      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'CANCELLED' }));
      await expect(service.remove('expense-1', 'Doublon', admin)).rejects.toMatchObject({ code: 'EXPENSE_ALREADY_CANCELLED' });
    });
  });

  // ---------------------------------------------------------------------
  describe('correctAmount (superadmin)', () => {
    it('recalcule le solde si la depense etait deja APPROVED', async () => {
      const { service, prisma, wallets } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status: 'APPROVED' }));

      await service.correctAmount('expense-1', 12_000_000, 'Erreur de saisie', admin);

      expect(wallets.recompute).toHaveBeenCalledWith('project-1', prisma);
    });

    it("ne recalcule PAS le solde si la depense n'a jamais ete APPROVED (PENDING)", async () => {
      const { service, wallets } = build();

      await service.correctAmount('expense-1', 12_000_000, 'Erreur de saisie', admin);

      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('historise ancienne et nouvelle valeur et garde la ligne coherente (prix unitaire ajuste)', async () => {
      const { service, prisma } = build();

      await service.correctAmount('expense-1', 12_000_000, 'Erreur de saisie', admin);

      const correction = prisma.financialCorrection.create.mock.calls[0][0].data;
      expect(correction).toMatchObject({ entityType: 'Expense', entityId: 'expense-1', reason: 'Erreur de saisie', correctedById: 'user-admin-1' });
      expect(correction.oldValue.toString()).toBe('10000000');
      expect(correction.newValue.toString()).toBe('12000000');

      const update = prisma.expense.update.mock.calls[0][0].data;
      expect(update.total.toString()).toBe('12000000');
      expect(update.unitPrice.toString()).toBe('1200000'); // 12 000 000 / quantite 10
    });

    it('fait suivre le montant verse au fournisseur pour une depense payee integralement', async () => {
      const { service, prisma } = build();

      await service.correctAmount('expense-1', 12_000_000, 'Erreur', admin);

      expect(prisma.expense.update.mock.calls[0][0].data.amountPaidToSupplier.toString()).toBe('12000000');
    });

    it('requalifie un paiement partiel en paiement integral quand le nouveau total passe sous le montant verse', async () => {
      const { service, prisma } = build();
      prisma.expense.findUnique.mockResolvedValue(
        expenseRow({ status: 'APPROVED', paymentStatus: 'PARTIAL', amountPaidToSupplier: D(6_000_000) }),
      );

      await service.correctAmount('expense-1', 5_000_000, 'Erreur', admin);

      const update = prisma.expense.update.mock.calls[0][0].data;
      expect(update.paymentStatus).toBe('PAID_FULL');
      expect(update.amountPaidToSupplier.toString()).toBe('5000000');
    });

    it.each(['CANCELLED', 'REJECTED'])('refuse de corriger une depense %s', async (status) => {
      const { service, prisma } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ status }));

      await expect(service.correctAmount('expense-1', 1, 'Motif', admin)).rejects.toMatchObject({ code: 'EXPENSE_NOT_CORRECTABLE' });
    });

    it('refuse un montant identique ou hors capacite', async () => {
      const { service } = build();

      await expect(service.correctAmount('expense-1', 10_000_000, 'Motif', admin)).rejects.toMatchObject({ code: 'NO_CHANGE' });
      await expect(service.correctAmount('expense-1', 1e17, 'Motif', admin)).rejects.toMatchObject({ code: 'AMOUNT_OUT_OF_RANGE' });
    });
  });

  // ---------------------------------------------------------------------
  describe('alertes apres validation', () => {
    const lowBalanceTypes = (notifications: { sendMany: jest.Mock }) =>
      (notifications.sendMany.mock.calls[0]?.[0] ?? []).map((a: { type: string }) => a.type);

    it('envoie une alerte de solde faible (< 10 % du budget)', async () => {
      const { service, wallets, notifications } = build();
      wallets.getWallet.mockResolvedValue({ balance: D(10_000_000) }); // 2 % de 500 M

      await service.approve('expense-1', client);

      expect(lowBalanceTypes(notifications)).toContain('LOW_BALANCE_ALERT');
    });

    it("n'envoie pas deux fois la meme alerte de solde faible dans les 24 h", async () => {
      const { service, prisma, wallets, notifications } = build();
      wallets.getWallet.mockResolvedValue({ balance: D(10_000_000) });
      prisma.notification.findFirst.mockResolvedValue({ id: 'deja-envoyee' });

      await service.approve('expense-1', client);

      expect(lowBalanceTypes(notifications)).not.toContain('LOW_BALANCE_ALERT');
    });

    it('signale le depassement de budget de la categorie', async () => {
      const { service, budgets, notifications } = build();
      budgets.isCategoryOverBudget.mockResolvedValue(true);

      await service.approve('expense-1', client);

      expect(lowBalanceTypes(notifications)).toContain('BUDGET_EXCEEDED_ALERT');
    });

    it("un echec du calcul des alertes ne fait pas echouer la validation", async () => {
      const { service, wallets } = build();
      wallets.getWallet.mockRejectedValue(new Error('boom'));

      await expect(service.approve('expense-1', client)).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------
  describe('lecture', () => {
    it('findOne : le client proprietaire, le superviseur auteur et le superadmin peuvent lire', async () => {
      const { service } = build();

      await expect(service.findOne('expense-1', client)).resolves.toBeDefined();
      await expect(service.findOne('expense-1', supervisor)).resolves.toBeDefined();
      await expect(service.findOne('expense-1', admin)).resolves.toBeDefined();
    });

    it("findOne : refuse un autre client, un autre superviseur et un profil manquant", async () => {
      const { service } = build();

      await expect(service.findOne('expense-1', otherClient)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.findOne('expense-1', otherSupervisor)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.findOne('expense-1', { ...client, clientProfileId: undefined })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    });

    it('findAllForProject : un superviseur est force sur ses propres depenses', async () => {
      const { service, prisma } = build();

      await service.findAllForProject('project-1', { supervisorId: 'sup-2' } as any, supervisor);

      expect(prisma.expense.findMany.mock.calls[0][0].where.supervisorId).toBe('sup-1');
    });

    it('findAllForProject : un superviseur sans profil est refuse (fail-closed)', async () => {
      const { service } = build();

      await expect(service.findAllForProject('project-1', {} as any, { ...supervisor, supervisorProfileId: undefined })).rejects.toMatchObject({
        code: 'PROJECT_ACCESS_DENIED',
      });
    });

    it('expose le reste a payer au fournisseur (total - montant verse)', async () => {
      const { service, prisma } = build();
      prisma.expense.findUnique.mockResolvedValue(expenseRow({ paymentStatus: 'PARTIAL', amountPaidToSupplier: D(4_000_000) }));

      const result: any = await service.findOne('expense-1', admin);

      expect(result.balanceDueToSupplier.toString()).toBe('6000000');
    });
  });
});
