//backend/src/purchasing/stock.service.spec.ts
import { Prisma } from '@prisma/client';
import { StockService } from './stock.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('StockService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifier: { toClient: jest.Mock; toReviewers: jest.Mock };
  let service: StockService;

  const PROJECT = 'p-1';
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };
  const item = { id: 'i-1', projectId: PROJECT, name: 'Ciment', unit: 'sac', minQuantity: D(10) };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
      projectPhase: { findFirst: jest.fn().mockResolvedValue({ id: 'ph-1' }) },
      stockItem: { findFirst: jest.fn().mockResolvedValue(item), findMany: jest.fn().mockResolvedValue([item]) },
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ type: 'IN', quantity: D(50) }]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'm-1', ...data })),
        groupBy: jest.fn().mockResolvedValue([{ stockItemId: 'i-1', type: 'IN', _sum: { quantity: D(50) } }]),
      },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifier = { toClient: jest.fn(), toReviewers: jest.fn() };
    service = new StockService(prisma, audit as any, notifier as any);
  });

  it('enregistre une consommation rattachee a une etape', async () => {
    await service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 20, phaseId: 'ph-1' }, supervisor);

    expect(prisma.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'OUT', quantity: D(20), phaseId: 'ph-1', stockItemId: 'i-1' }) });
    expect(notifier.toClient).not.toHaveBeenCalled();
  });

  it("exige l'etape pour une consommation", async () => {
    await expect(service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 5 }, supervisor)).rejects.toMatchObject({ code: 'PHASE_REQUIRED' });
  });

  it('refuse de sortir plus que le stock disponible', async () => {
    await expect(service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 60, phaseId: 'ph-1' }, supervisor)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('exige une cause pour une perte', async () => {
    await expect(service.recordMovement(PROJECT, 'i-1', { type: 'LOSS', quantity: 2 }, supervisor)).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
  });

  it('alerte une seule fois au franchissement du seuil de stock bas', async () => {
    await service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 45, phaseId: 'ph-1' }, supervisor);

    expect(notifier.toClient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'LOW_STOCK_ALERT' }));

    // Deja sous le seuil avant le mouvement : pas de nouvelle alerte.
    notifier.toClient.mockClear();
    prisma.stockMovement.findMany.mockResolvedValue([{ type: 'IN', quantity: D(8) }]);
    await service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 3, phaseId: 'ph-1' }, supervisor);
    expect(notifier.toClient).not.toHaveBeenCalled();
  });

  it('ne rejoue pas un mouvement deja enregistre hors ligne (clientRef)', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue({ id: 'm-old' });

    await service.recordMovement(PROJECT, 'i-1', { type: 'OUT', quantity: 5, phaseId: 'ph-1', clientRef: 'offline-12345' }, supervisor);

    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it("calcule le niveau de stock et le signale bas", async () => {
    prisma.stockMovement.groupBy.mockResolvedValue([
      { stockItemId: 'i-1', type: 'IN', _sum: { quantity: D(50) } },
      { stockItemId: 'i-1', type: 'OUT', _sum: { quantity: D(35) } },
      { stockItemId: 'i-1', type: 'LOSS', _sum: { quantity: D(5) } },
    ]);

    const [row] = await service.listItems(PROJECT);

    expect(row.quantity).toEqual(D(10));
    expect(row.isLow).toBe(true);
    expect(row.totalLost).toEqual(D(5));
  });
});
