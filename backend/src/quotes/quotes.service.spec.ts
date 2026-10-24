//backend/src/quotes/quotes.service.spec.ts
import { Prisma } from '@prisma/client';
import { QuotesService } from './quotes.service';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('QuotesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let contracts: { createInTx: jest.Mock };
  let service: QuotesService;

  const PROJECT = 'p-1';
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };
  const lot = (overrides: Record<string, unknown> = {}) => ({
    id: 'l-1', projectId: PROJECT, title: 'Carrelage', description: null, phaseId: 'ph-1', status: 'OPEN',
    items: [{ id: 'it-1', label: 'Carreaux', unit: 'm2', quantity: D(100) }, { id: 'it-2', label: 'Colle', unit: 'sac', quantity: D(20) }], ...overrides,
  });

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
      quoteLot: { findFirst: jest.fn().mockResolvedValue(lot()), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'f-1' }) },
      supplierQuote: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1', lotId: 'l-1', supplierId: 'f-1', totalAmount: D(900_000), validUntil: null }),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'q-new', ...data })),
        update: jest.fn().mockResolvedValue({ id: 'q-old' }), updateMany: jest.fn(), delete: jest.fn(),
      },
      supplierQuoteLine: { deleteMany: jest.fn() },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    contracts = { createInTx: jest.fn().mockResolvedValue({ id: 'k-1' }) };
    service = new QuotesService(prisma, audit as any, contracts as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'l-1' } as any);
  });

  const quoteDto = { supplierId: 'f-1', lines: [{ itemId: 'it-1', unitPrice: 6_000 }, { itemId: 'it-2', unitPrice: 12_500 }] };

  it('calcule le total du devis depuis le metre du lot', async () => {
    await service.upsertQuote(PROJECT, 'l-1', quoteDto, client);

    expect(prisma.supplierQuote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lotId: 'l-1', supplierId: 'f-1', totalAmount: D(850_000), status: 'SUBMITTED' }),
    });
  });

  it('remplace le devis existant du meme fournisseur', async () => {
    prisma.supplierQuote.findUnique.mockResolvedValue({ id: 'q-old' });

    await service.upsertQuote(PROJECT, 'l-1', quoteDto, client);

    expect(prisma.supplierQuoteLine.deleteMany).toHaveBeenCalledWith({ where: { quoteId: 'q-old' } });
    expect(prisma.supplierQuote.update).toHaveBeenCalled();
    expect(prisma.supplierQuote.create).not.toHaveBeenCalled();
  });

  it('refuse un poste etranger au lot et un poste chiffre deux fois', async () => {
    await expect(service.upsertQuote(PROJECT, 'l-1', { supplierId: 'f-1', lines: [{ itemId: 'zz', unitPrice: 1 }] }, client)).rejects.toMatchObject({ code: 'INVALID_ITEM' });
    await expect(service.upsertQuote(PROJECT, 'l-1', { supplierId: 'f-1', lines: [{ itemId: 'it-1', unitPrice: 1 }, { itemId: 'it-1', unitPrice: 2 }] }, client)).rejects.toMatchObject({ code: 'DUPLICATE_ITEM' });
  });

  it("refuse un devis sur un lot deja attribue", async () => {
    prisma.quoteLot.findFirst.mockResolvedValue(lot({ status: 'AWARDED' }));

    await expect(service.upsertQuote(PROJECT, 'l-1', quoteDto, client)).rejects.toMatchObject({ code: 'LOT_NOT_OPEN' });
  });

  it("l'attribution retient le devis, ecarte les autres et cree le marche", async () => {
    await service.award(PROJECT, 'l-1', { quoteId: 'q-1', createContract: { retentionPercent: 5 } }, client);

    expect(prisma.quoteLot.updateMany).toHaveBeenCalledWith({ where: { id: 'l-1', status: 'OPEN' }, data: { status: 'AWARDED', awardedQuoteId: 'q-1' } });
    expect(prisma.supplierQuote.updateMany).toHaveBeenCalledWith({ where: { lotId: 'l-1', id: { not: 'q-1' } }, data: { status: 'REJECTED' } });
    expect(contracts.createInTx).toHaveBeenCalledWith(prisma, PROJECT, 'c-1', expect.objectContaining({ supplierId: 'f-1', amount: D(900_000), quoteId: 'q-1', retentionPercent: 5 }), client);
  });

  it("n'attribue pas un devis expire", async () => {
    prisma.supplierQuote.findFirst.mockResolvedValue({ id: 'q-1', lotId: 'l-1', supplierId: 'f-1', totalAmount: D(1), validUntil: new Date('2020-01-01T00:00:00Z') });

    await expect(service.award(PROJECT, 'l-1', { quoteId: 'q-1' }, client)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
  });

  it("l'attribution est reservee au client", async () => {
    await expect(service.award(PROJECT, 'l-1', { quoteId: 'q-1' }, supervisor)).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});
