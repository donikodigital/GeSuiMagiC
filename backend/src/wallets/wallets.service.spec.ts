//backend/src/wallets/wallets.service.spec.ts
// Filet de securite sur le calcul le plus critique de l'app : le solde.
// Regle testee : SOLDE = DEPOTS VALIDES - DEPENSES VALIDEES, en Decimal,
// jamais bloque meme negatif, jamais en float JS.

import { Test } from '@nestjs/testing';
import { WalletsService } from './wallets.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      wallet: {
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      deposit: { aggregate: jest.fn() },
      expense: { aggregate: jest.fn() },
      project: { findUniqueOrThrow: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [WalletsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(WalletsService);
  });

  describe('recompute', () => {
    it('calcule le solde = depots valides - depenses validees', async () => {
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: 15_000_000 } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: 1_500_000 } });
      prisma.wallet.update.mockImplementation(({ data }: any) => data);

      const result = await service.recompute('project-1');

      expect(prisma.deposit.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-1', status: 'APPROVED' } }),
      );
      expect(prisma.expense.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-1', status: 'APPROVED' } }),
      );
      expect(result.balance.toString()).toBe('13500000');
      expect(result.totalDeposited.toString()).toBe('15000000');
      expect(result.totalSpent.toString()).toBe('1500000');
    });

    it('autorise un solde negatif (regle metier explicite : jamais de blocage sur solde insuffisant)', async () => {
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: 1_000_000 } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: 5_000_000 } });
      prisma.wallet.update.mockImplementation(({ data }: any) => data);

      const result = await service.recompute('project-1');

      expect(result.balance.toString()).toBe('-4000000');
    });

    it('ne prend en compte que les operations APPROVED (filtre passe a Prisma)', async () => {
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: 0 } });
      prisma.wallet.update.mockImplementation(({ data }: any) => data);

      await service.recompute('project-1');

      expect(prisma.deposit.aggregate.mock.calls[0][0].where.status).toBe('APPROVED');
      expect(prisma.expense.aggregate.mock.calls[0][0].where.status).toBe('APPROVED');
    });

    it("gere le cas ou aucun depot/depense n'existe encore (agregat null -> 0, pas d'erreur)", async () => {
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: null } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: null } });
      prisma.wallet.update.mockImplementation(({ data }: any) => data);

      const result = await service.recompute('project-1');

      expect(result.balance.toString()).toBe('0');
    });

    it('ne perd aucune precision decimale (le piege classique du flottant JS : 0.1 + 0.2 !== 0.3)', async () => {
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: '10000000.10' } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: '3333333.33' } });
      prisma.wallet.update.mockImplementation(({ data }: any) => data);

      const result = await service.recompute('project-1');

      expect(result.balance.toString()).toBe('6666666.77');
    });

    it('utilise le client de transaction (tx) fourni plutot que this.prisma - garantit l\'atomicite', async () => {
      const tx = {
        deposit: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }) },
        expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 40 } }) },
        wallet: { update: jest.fn().mockImplementation(({ data }: any) => data) },
      };

      await service.recompute('project-1', tx as any);

      expect(tx.deposit.aggregate).toHaveBeenCalled();
      expect(tx.wallet.update).toHaveBeenCalled();
      expect(prisma.deposit.aggregate).not.toHaveBeenCalled();
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialSummary', () => {
    it('calcule budgetUsedPercent correctement, arrondi a 2 decimales', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({ budget: '10000000', currency: 'GNF', name: 'Villa' });
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({ totalDeposited: '5000000', totalSpent: '3333333', balance: '1666667' });
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });

      const result = await service.getFinancialSummary('project-1');

      expect(result.budgetUsedPercent).toBeCloseTo(33.33, 2);
    });

    it('retourne 0% si le budget est a 0 (evite une division par zero)', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({ budget: '0', currency: 'GNF', name: 'Villa' });
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({ totalDeposited: '0', totalSpent: '0', balance: '0' });
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });

      const result = await service.getFinancialSummary('project-1');

      expect(result.budgetUsedPercent).toBe(0);
    });

    it('remonte le nombre et le montant des operations en attente', async () => {
      prisma.project.findUniqueOrThrow.mockResolvedValue({ budget: '10000000', currency: 'GNF', name: 'Villa' });
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({ totalDeposited: '0', totalSpent: '0', balance: '0' });
      prisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: '2000000' }, _count: 2 });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { total: '750000' }, _count: 1 });

      const result = await service.getFinancialSummary('project-1');

      expect(result.pendingDepositsCount).toBe(2);
      expect(result.pendingExpensesCount).toBe(1);
    });
  });
});