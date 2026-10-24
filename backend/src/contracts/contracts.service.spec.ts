//backend/src/contracts/contracts.service.spec.ts
import { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('ContractsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let expenses: { createInTx: jest.Mock; afterCreate: jest.Mock };
  let attachments: { listForEntities: jest.Mock };
  let notifier: { toClient: jest.Mock; toReviewers: jest.Mock; toUser: jest.Mock };
  let service: ContractsService;

  const PROJECT = 'p-1';
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };

  const contract = (overrides: Record<string, unknown> = {}) => ({
    id: 'k-1', projectId: PROJECT, number: 1, supplierId: 'f-1', phaseId: null, title: 'Plomberie', amount: D(1_000_000), retentionPercent: D(5), status: 'ACTIVE',
    supplier: { id: 'f-1', name: 'Diallo SARL' }, statements: [], payments: [], ...overrides,
  });

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
      contract: { findFirst: jest.fn().mockResolvedValue(contract()), findMany: jest.fn().mockResolvedValue([]) },
      progressStatement: { findFirst: jest.fn(), create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'st-1', ...data })), aggregate: jest.fn().mockResolvedValue({ _max: { number: 0 } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      contractPayment: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'pay-1', ...data })) },
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    expenses = { createInTx: jest.fn().mockResolvedValue({ expense: { id: 'e-1' }, status: 'PENDING' }), afterCreate: jest.fn().mockResolvedValue(undefined) };
    attachments = { listForEntities: jest.fn().mockResolvedValue(new Map()) };
    notifier = { toClient: jest.fn(), toReviewers: jest.fn(), toUser: jest.fn() };
    service = new ContractsService(prisma, audit as any, expenses as any, attachments as any, notifier as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'k-1' } as any);
  });

  describe('situations de travaux', () => {
    it('calcule la retenue et le net a payer', async () => {
      await service.submitStatement(PROJECT, 'k-1', { periodEnd: '2026-10-01', cumulativeAmount: 400_000 }, supervisor);

      expect(prisma.progressStatement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ number: 1, amountThisPeriod: D(400_000), retentionAmount: D(20_000), netPayable: D(380_000) }),
      });
      expect(notifier.toReviewers).toHaveBeenCalled();
    });

    it('refuse un cumul qui ne progresse pas', async () => {
      prisma.contract.findFirst.mockResolvedValue(
        contract({ statements: [{ id: 'st-0', status: 'VALIDATED', cumulativeAmount: D(500_000), retentionAmount: D(25_000), advanceRecovered: D(0), netPayable: D(475_000) }] }),
      );

      await expect(service.submitStatement(PROJECT, 'k-1', { periodEnd: '2026-10-01', cumulativeAmount: 500_000 }, supervisor)).rejects.toMatchObject({ code: 'CUMULATIVE_NOT_INCREASING' });
    });

    it('refuse un cumul superieur au montant du marche', async () => {
      await expect(service.submitStatement(PROJECT, 'k-1', { periodEnd: '2026-10-01', cumulativeAmount: 1_200_000 }, supervisor)).rejects.toMatchObject({ code: 'EXCEEDS_CONTRACT' });
    });

    it('refuse une seconde situation tant que la premiere attend une decision', async () => {
      prisma.contract.findFirst.mockResolvedValue(contract({ statements: [{ id: 'st-0', status: 'SUBMITTED', cumulativeAmount: D(100_000), retentionAmount: D(5_000), advanceRecovered: D(0), netPayable: D(95_000) }] }));

      await expect(service.submitStatement(PROJECT, 'k-1', { periodEnd: '2026-10-01', cumulativeAmount: 300_000 }, supervisor)).rejects.toMatchObject({ code: 'STATEMENT_PENDING' });
    });

    it('refuse de valider sa propre situation (hors client)', async () => {
      prisma.progressStatement.findFirst.mockResolvedValue({ id: 'st-1', number: 1, status: 'SUBMITTED', submittedById: 'u-s' });
      prisma.projectSupervisor.findFirst.mockResolvedValue({ position: 'SITE_MANAGER' });

      await expect(service.decideStatement(PROJECT, 'k-1', 'st-1', { decision: 'VALIDATED' }, supervisor)).rejects.toMatchObject({ code: 'SELF_REVIEW' });
    });

    it('exige un motif pour refuser', async () => {
      await expect(service.decideStatement(PROJECT, 'k-1', 'st-1', { decision: 'REJECTED' }, client)).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
    });
  });

  describe('paiements', () => {
    const payment = { type: 'ADVANCE' as const, amount: 200_000, categoryId: 'cat-1' };

    it("cree une depense pour un acompte et l'enregistre sur le marche", async () => {
      await service.recordPayment(PROJECT, 'k-1', payment, supervisor);

      expect(expenses.createInTx).toHaveBeenCalledWith(prisma, expect.anything(), supervisor, 's-1', expect.objectContaining({ categoryId: 'cat-1', contractId: 'k-1', supplierId: 'f-1', unitPrice: D(200_000) }));
      expect(prisma.contractPayment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ expenseId: 'e-1', type: 'ADVANCE' }) });
      expect(expenses.afterCreate).toHaveBeenCalled();
    });

    it('plafonne les acomptes a 30 % du marche', async () => {
      await expect(service.recordPayment(PROJECT, 'k-1', { ...payment, amount: 400_000 }, supervisor)).rejects.toMatchObject({ code: 'ADVANCE_TOO_HIGH' });
      expect(expenses.createInTx).not.toHaveBeenCalled();
    });

    it("reserve les paiements au superviseur (le client n'enregistre pas de depense)", async () => {
      await expect(service.recordPayment(PROJECT, 'k-1', payment, client)).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
    });

    it('exige une situation validee pour un paiement de situation', async () => {
      prisma.contract.findFirst.mockResolvedValue(
        contract({ statements: [{ id: 'st-1', status: 'SUBMITTED', cumulativeAmount: D(100_000), retentionAmount: D(5_000), advanceRecovered: D(0), netPayable: D(95_000) }] }),
      );

      await expect(service.recordPayment(PROJECT, 'k-1', { type: 'STATEMENT', amount: 95_000, categoryId: 'cat-1', statementId: 'st-1' }, supervisor)).rejects.toMatchObject({ code: 'STATEMENT_NOT_VALIDATED' });
    });

    it("ne rejoue pas un paiement deja enregistre hors ligne (clientRef)", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e-old' });

      await service.recordPayment(PROJECT, 'k-1', { ...payment, clientRef: 'offline-12345' }, supervisor);

      expect(expenses.createInTx).not.toHaveBeenCalled();
    });
  });
});
