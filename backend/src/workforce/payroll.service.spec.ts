//backend/src/workforce/payroll.service.spec.ts
import { Prisma } from '@prisma/client';
import { PayrollService } from './payroll.service';
import { WorkforceService } from './workforce.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('PayrollService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let expenses: { createInTx: jest.Mock; afterCreate: jest.Mock };
  let service: PayrollService;

  const PROJECT = 'p-1';
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };

  const run = (overrides: Record<string, unknown> = {}) => ({
    id: 'r-1', projectId: PROJECT, number: 1, label: 'Quinzaine 1', status: 'DRAFT', periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-15T00:00:00Z'),
    lines: [{ workerId: 'w-1', grossAmount: D(50_000), advanceDeducted: D(10_000), netAmount: D(40_000), worker: { fullName: 'Mamadou' } }], ...overrides,
  });

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
      payRun: { findFirst: jest.fn().mockResolvedValue(run()), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(), create: jest.fn() },
      payRunLine: { groupBy: jest.fn().mockResolvedValue([{ workerId: 'w-1', _sum: { advanceDeducted: D(0) } }]), deleteMany: jest.fn(), createMany: jest.fn() },
      workerAdvance: { groupBy: jest.fn().mockResolvedValue([{ workerId: 'w-1', _sum: { amount: D(10_000) } }]) },
      workerPresence: { groupBy: jest.fn().mockResolvedValue([{ workerId: 'w-1', _sum: { fraction: D(10) } }]) },
      worker: { findMany: jest.fn().mockResolvedValue([{ id: 'w-1', fullName: 'Mamadou', dailyRate: D(5_000) }]) },
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    expenses = { createInTx: jest.fn().mockResolvedValue({ expense: { id: 'e-1' } }), afterCreate: jest.fn().mockResolvedValue(undefined) };
    const workforce = new WorkforceService(prisma, audit as any);
    service = new PayrollService(prisma, audit as any, workforce, expenses as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'r-1' } as any);
  });

  it('valide la paie en creant UNE depense du montant brut', async () => {
    await service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, supervisor);

    expect(expenses.createInTx).toHaveBeenCalledTimes(1);
    expect(expenses.createInTx).toHaveBeenCalledWith(prisma, expect.anything(), supervisor, 's-1', expect.objectContaining({ categoryId: 'cat-1', unitPrice: D(50_000), quantity: 1 }));
    expect(prisma.payRun.updateMany).toHaveBeenCalledWith({ where: { id: 'r-1', status: 'DRAFT' }, data: expect.objectContaining({ status: 'SUBMITTED', expenseId: 'e-1' }) });
    expect(expenses.afterCreate).toHaveBeenCalled();
  });

  it("reserve la validation au superviseur", async () => {
    await expect(service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, client)).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });

  it('refuse une paie deja validee', async () => {
    prisma.payRun.findFirst.mockResolvedValue(run({ status: 'SUBMITTED' }));

    await expect(service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, supervisor)).rejects.toMatchObject({ code: 'PAYRUN_LOCKED' });
  });

  it("refuse une ligne sans montant (taux journalier manquant)", async () => {
    prisma.payRun.findFirst.mockResolvedValue(run({ lines: [{ workerId: 'w-1', grossAmount: D(0), advanceDeducted: D(0), netAmount: D(0), worker: { fullName: 'Mamadou' } }] }));

    await expect(service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, supervisor)).rejects.toMatchObject({ code: 'MISSING_AMOUNT' });
    expect(expenses.createInTx).not.toHaveBeenCalled();
  });

  it("refuse la validation si l'avance deduite n'est plus valable", async () => {
    prisma.workerAdvance.groupBy.mockResolvedValue([{ workerId: 'w-1', _sum: { amount: D(2_000) } }]);

    await expect(service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, supervisor)).rejects.toMatchObject({ code: 'ADVANCE_CHANGED' });
  });

  it('refuse une paie dont la periode chevauche une paie deja validee', async () => {
    prisma.payRun.findMany.mockResolvedValue([{ number: 3, periodStart: new Date('2026-10-10T00:00:00Z'), periodEnd: new Date('2026-10-20T00:00:00Z') }]);

    await expect(service.submit(PROJECT, 'r-1', { categoryId: 'cat-1' }, supervisor)).rejects.toMatchObject({ code: 'PERIOD_OVERLAP' });
  });

  it("refuse de retenir plus d'avance que ce qui est du", async () => {
    await expect(
      service.editLines(PROJECT, 'r-1', { lines: [{ workerId: 'w-1', advanceDeducted: 99_000 }] }, supervisor),
    ).rejects.toMatchObject({ code: 'ADVANCE_TOO_HIGH' });
  });

  it("recalcule les totaux d'un brouillon avec un marche a la tache", async () => {
    await service.editLines(PROJECT, 'r-1', { lines: [{ workerId: 'w-1', taskAmount: 120_000 }] }, supervisor);

    expect(prisma.payRunLine.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ grossAmount: D(120_000), advanceDeducted: D(10_000), netAmount: D(110_000) })] });
  });
});
