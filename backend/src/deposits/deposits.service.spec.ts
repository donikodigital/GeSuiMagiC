//backend/src/deposits/deposits.service.spec.ts
// Verifie que le solde n'est recalcule QUE dans les cas prevus, et que
// l'autorisation (superviseur beneficiaire uniquement) est bien appliquee
// avant toute mutation.

import { Test } from '@nestjs/testing';
import { DepositsService } from './deposits.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

describe('DepositsService', () => {
  let service: DepositsService;
  let prisma: any;
  let wallets: any;

  const supervisorActor = { userId: 'u-sup', role: 'SUPERVISOR', supervisorProfileId: 'sup-1' };
  const otherSupervisorActor = { userId: 'u-sup2', role: 'SUPERVISOR', supervisorProfileId: 'sup-2' };
  const adminActor = { userId: 'u-admin', role: 'SUPERADMIN' };

  beforeEach(async () => {
    prisma = {
      deposit: { findUniqueOrThrow: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      project: { findUniqueOrThrow: jest.fn() },
      clientProfile: { findUniqueOrThrow: jest.fn() },
      runInTransaction: jest.fn((cb: any) => cb(prisma)),
    };
    wallets = { recompute: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DepositsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WalletsService, useValue: wallets },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') } },
      ],
    }).compile();

    service = module.get(DepositsService);
  });

  describe('approve', () => {
    const pendingDeposit = { id: 'd-1', projectId: 'p-1', supervisorId: 'sup-1', status: 'PENDING', amount: '1000000', currency: 'GNF', clientId: 'cli-1' };

    it("refuse si l'acteur n'est pas le superviseur beneficiaire de ce depot", async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue(pendingDeposit);

      await expect(service.approve('d-1', otherSupervisorActor as any)).rejects.toThrow();
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(prisma.deposit.update).not.toHaveBeenCalled();
    });

    it('refuse si le depot a deja ete traite (plus PENDING)', async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue({ ...pendingDeposit, status: 'APPROVED' });

      await expect(service.approve('d-1', supervisorActor as any)).rejects.toThrow();
      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('recalcule le solde une fois le depot valide par le bon superviseur', async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue(pendingDeposit);
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit, status: 'APPROVED', supervisor: {}, client: {}, project: {}, attachments: [] });
      prisma.project.findUniqueOrThrow.mockResolvedValue({ id: 'p-1', name: 'Villa', currency: 'GNF' });
      prisma.clientProfile.findUniqueOrThrow.mockResolvedValue({ userId: 'u-cli', firstName: 'Hamidou' });

      await service.approve('d-1', supervisorActor as any);

      expect(wallets.recompute).toHaveBeenCalledWith('p-1', expect.anything());
      expect(prisma.deposit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', isLocked: true }) }),
      );
    });
  });

  describe('correctAmount', () => {
    it('recalcule le solde si le depot etait deja APPROVED', async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', projectId: 'p-1', status: 'APPROVED', amount: '1000000', clientId: 'cli-1', currency: 'GNF' });
      prisma.deposit.findUnique.mockResolvedValue({ id: 'd-1', status: 'APPROVED', supervisor: {}, client: {}, project: {}, attachments: [] });
      prisma.clientProfile.findUniqueOrThrow.mockResolvedValue({ userId: 'u-cli', firstName: 'Hamidou' });

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      expect(wallets.recompute).toHaveBeenCalledWith('p-1', expect.anything());
    });

    it("ne recalcule PAS le solde si le depot n'a jamais ete APPROVED (ex: PENDING)", async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', projectId: 'p-1', status: 'PENDING', amount: '1000000', clientId: 'cli-1', currency: 'GNF' });
      prisma.deposit.findUnique.mockResolvedValue({ id: 'd-1', status: 'PENDING', supervisor: {}, client: {}, project: {}, attachments: [] });
      prisma.clientProfile.findUniqueOrThrow.mockResolvedValue({ userId: 'u-cli', firstName: 'Hamidou' });

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('conserve la trace de la correction (FinancialCorrection) avec ancienne et nouvelle valeur', async () => {
      prisma.deposit.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', projectId: 'p-1', status: 'APPROVED', amount: '1000000', clientId: 'cli-1', currency: 'GNF' });
      prisma.deposit.findUnique.mockResolvedValue({ id: 'd-1', status: 'APPROVED', supervisor: {}, client: {}, project: {}, attachments: [] });
      prisma.clientProfile.findUniqueOrThrow.mockResolvedValue({ userId: 'u-cli', firstName: 'Hamidou' });
      prisma.financialCorrection = { create: jest.fn() };

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      expect(prisma.financialCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'Deposit', entityId: 'd-1', oldValue: '1000000', newValue: 1_200_000, reason: 'Erreur de saisie' }),
        }),
      );
    });
  });
});