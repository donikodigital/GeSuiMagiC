//backend/src/deposits/deposits.service.spec.ts
// Verifie les garanties du service des depots :
//  - seul le superviseur beneficiaire (toujours affecte au projet) decide d'un depot ;
//  - la decision est ATOMIQUE (mise a jour conditionnelle sur le statut PENDING) ;
//  - le solde n'est recalcule QUE quand un depot valide change ;
//  - un projet suspendu/termine/archive n'accepte plus de depot, la devise est verrouillee ;
//  - une notification qui echoue ne fait jamais echouer l'operation.

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DepositsService } from './deposits.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const D = (value: string | number) => new Prisma.Decimal(value);

describe('DepositsService', () => {
  let service: DepositsService;
  let prisma: any;
  let wallets: { recompute: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { send: jest.Mock };

  const supervisorActor = { userId: 'u-sup', role: 'SUPERVISOR', supervisorProfileId: 'sup-1' };
  const otherSupervisorActor = { userId: 'u-sup2', role: 'SUPERVISOR', supervisorProfileId: 'sup-2' };
  const adminActor = { userId: 'u-admin', role: 'SUPERADMIN' };

  const pendingDeposit = () => ({
    id: 'd-1',
    projectId: 'p-1',
    clientId: 'cli-1',
    supervisorId: 'sup-1',
    status: 'PENDING',
    amount: D('1000000'),
    currency: 'GNF',
  });

  beforeEach(async () => {
    // Les echecs de notification sont journalises volontairement : on silence le bruit dans les tests.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      deposit: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      project: { findUnique: jest.fn() },
      projectSupervisor: { findFirst: jest.fn() },
      clientProfile: { findUnique: jest.fn() },
      financialCorrection: { create: jest.fn() },
      // Le "client de transaction" est le mock lui-meme.
      runInTransaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    wallets = { recompute: jest.fn() };
    audit = { log: jest.fn() };
    notifications = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DepositsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WalletsService, useValue: wallets },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') } },
      ],
    }).compile();

    service = module.get(DepositsService);

    // Valeurs par defaut communes (post-commit : notification client + relecture)
    prisma.clientProfile.findUnique.mockResolvedValue({ userId: 'u-cli', firstName: 'Hamidou' });
    prisma.project.findUnique.mockResolvedValue({ id: 'p-1', name: 'Villa', currency: 'GNF', status: 'ACTIVE', clientId: 'cli-1' });
    prisma.projectSupervisor.findFirst.mockResolvedValue({ id: 'ps-1' });
  });

  describe('approve', () => {
    it("refuse si l'acteur n'est pas le superviseur beneficiaire de ce depot", async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await expect(service.approve('d-1', otherSupervisorActor as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('refuse un superadmin ou un client (seul le superviseur valide un depot)', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await expect(service.approve('d-1', adminActor as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.approve('d-1', { userId: 'u', role: 'CLIENT', clientProfileId: 'cli-1' } as any)).rejects.toMatchObject({
        code: 'PROJECT_ACCESS_DENIED',
      });
    });

    it('refuse si le depot a deja ete traite (plus PENDING)', async () => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status: 'APPROVED' });

      await expect(service.approve('d-1', supervisorActor as any)).rejects.toMatchObject({ code: 'DEPOSIT_NOT_PENDING' });
      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('refuse si le superviseur a ete revoque du projet entre-temps', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.projectSupervisor.findFirst.mockResolvedValue(null);

      await expect(service.approve('d-1', supervisorActor as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
    });

    it('valide de facon conditionnelle (WHERE status = PENDING), recalcule le solde et journalise dans la meme transaction', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.deposit.updateMany.mockResolvedValue({ count: 1 });

      await service.approve('d-1', supervisorActor as any);

      expect(prisma.deposit.updateMany).toHaveBeenCalledWith({
        where: { id: 'd-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', isLocked: true, approvedById: 'u-sup' }),
      });
      expect(wallets.recompute).toHaveBeenCalledWith('p-1', prisma);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE', entityId: 'd-1' }), prisma);
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-cli', type: 'DEPOSIT_APPROVED' }));
    });

    it("si une autre decision est passee entre-temps (0 ligne modifiee), rien n'est recalcule ni notifie", async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.deposit.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('d-1', supervisorActor as any)).rejects.toMatchObject({ code: 'DEPOSIT_NOT_PENDING' });
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it("n'echoue pas si l'envoi de la notification echoue (le depot reste valide)", async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.deposit.updateMany.mockResolvedValue({ count: 1 });
      notifications.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.approve('d-1', supervisorActor as any)).resolves.toBeDefined();
      expect(wallets.recompute).toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('refuse de facon conditionnelle, sans toucher au solde (un depot refuse ne compte jamais)', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.deposit.updateMany.mockResolvedValue({ count: 1 });

      await service.reject('d-1', 'Montant non recu', supervisorActor as any);

      expect(prisma.deposit.updateMany).toHaveBeenCalledWith({
        where: { id: 'd-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Montant non recu' }),
      });
      expect(wallets.recompute).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT', reason: 'Montant non recu' }), prisma);
    });

    it('ne peut pas ecraser une validation concurrente (0 ligne modifiee -> conflit)', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());
      prisma.deposit.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject('d-1', 'Motif', supervisorActor as any)).rejects.toMatchObject({ code: 'DEPOSIT_NOT_PENDING' });
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it("refuse si l'acteur n'est pas le superviseur beneficiaire", async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await expect(service.reject('d-1', 'Motif', otherSupervisorActor as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('correctAmount', () => {
    it('recalcule le solde si le depot etait deja APPROVED', async () => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status: 'APPROVED' });

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      expect(wallets.recompute).toHaveBeenCalledWith('p-1', prisma);
    });

    it("ne recalcule PAS le solde si le depot n'a jamais ete APPROVED (ex: PENDING)", async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      expect(wallets.recompute).not.toHaveBeenCalled();
    });

    it('conserve la trace de la correction (FinancialCorrection) avec ancienne et nouvelle valeur', async () => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status: 'APPROVED' });

      await service.correctAmount('d-1', 1_200_000, 'Erreur de saisie', adminActor as any);

      const call = prisma.financialCorrection.create.mock.calls[0][0];
      expect(call.data).toMatchObject({ entityType: 'Deposit', entityId: 'd-1', reason: 'Erreur de saisie', correctedById: 'u-admin' });
      expect(call.data.oldValue.toString()).toBe('1000000');
      expect(call.data.newValue.toString()).toBe('1200000');
    });

    it('arrondit le nouveau montant a 2 decimales', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await service.correctAmount('d-1', 1_000_000.456, 'Arrondi', adminActor as any);

      expect(prisma.deposit.update.mock.calls[0][0].data.amount.toString()).toBe('1000000.46');
    });

    it.each(['CANCELLED', 'REJECTED'])('refuse de corriger un depot %s', async (status) => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status });

      await expect(service.correctAmount('d-1', 1, 'Motif', adminActor as any)).rejects.toMatchObject({ code: 'DEPOSIT_NOT_CORRECTABLE' });
      expect(prisma.financialCorrection.create).not.toHaveBeenCalled();
    });

    it('refuse une correction vers le meme montant', async () => {
      prisma.deposit.findUnique.mockResolvedValue(pendingDeposit());

      await expect(service.correctAmount('d-1', 1_000_000, 'Motif', adminActor as any)).rejects.toMatchObject({ code: 'NO_CHANGE' });
    });
  });

  describe('remove (suppression logique)', () => {
    it("recalcule le solde si le depot supprime etait APPROVED, jamais de suppression physique", async () => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status: 'APPROVED' });

      await service.remove('d-1', 'Doublon', adminActor as any);

      expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
      expect(wallets.recompute).toHaveBeenCalledWith('p-1', prisma);
    });

    it('refuse de supprimer deux fois', async () => {
      prisma.deposit.findUnique.mockResolvedValue({ ...pendingDeposit(), status: 'CANCELLED' });

      await expect(service.remove('d-1', 'Doublon', adminActor as any)).rejects.toMatchObject({ code: 'DEPOSIT_ALREADY_CANCELLED' });
    });
  });

  describe('create', () => {
    const dto = { supervisorId: 'sup-1', amount: 500_000, motif: 'Avance', paymentMethod: 'CASH' };
    const clientActor = { userId: 'u-cli', role: 'CLIENT', clientProfileId: 'cli-1' };

    beforeEach(() => {
      prisma.projectSupervisor.findFirst.mockResolvedValue({ id: 'ps-1', supervisor: { userId: 'u-sup', firstName: 'Mamadou' } });
      prisma.deposit.create.mockImplementation(({ data }: any) => ({ id: 'd-new', ...data }));
    });

    it('cree un depot PENDING dans la devise du projet', async () => {
      const result: any = await service.create('p-1', dto as any, clientActor as any);

      expect(prisma.deposit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'PENDING', currency: 'GNF', clientId: 'cli-1', createdById: 'u-cli' }),
      });
      expect(result.id).toBe('d-new');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }), prisma);
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-sup', type: 'DEPOSIT_CREATED' }));
    });

    it.each(['SUSPENDED', 'COMPLETED', 'ARCHIVED'])('refuse un depot sur un projet %s', async (status) => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p-1', name: 'Villa', currency: 'GNF', status, clientId: 'cli-1' });

      await expect(service.create('p-1', dto as any, clientActor as any)).rejects.toMatchObject({ code: 'PROJECT_NOT_ACTIVE' });
      expect(prisma.deposit.create).not.toHaveBeenCalled();
    });

    it('verrouille la devise sur celle du projet', async () => {
      await expect(service.create('p-1', { ...dto, currency: 'EUR' } as any, clientActor as any)).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH' });
      expect(prisma.deposit.create).not.toHaveBeenCalled();
    });

    it("refuse un superviseur qui n'est pas affecte au projet", async () => {
      prisma.projectSupervisor.findFirst.mockResolvedValue(null);

      await expect(service.create('p-1', dto as any, clientActor as any)).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_ASSIGNED' });
    });

    it('un projet introuvable donne NOT_FOUND', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.create('p-1', dto as any, clientActor as any)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it("n'echoue pas si la notification au superviseur echoue", async () => {
      notifications.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.create('p-1', dto as any, clientActor as any)).resolves.toMatchObject({ id: 'd-new' });
    });
  });

  describe('findAllForProject', () => {
    beforeEach(() => {
      prisma.deposit.findMany.mockResolvedValue([]);
      prisma.deposit.count.mockResolvedValue(0);
    });

    it('force le filtre superviseur sur son propre profil (il ne voit pas les depots des autres)', async () => {
      await service.findAllForProject('p-1', { supervisorId: 'sup-2' } as any, supervisorActor as any);

      expect(prisma.deposit.findMany.mock.calls[0][0].where.supervisorId).toBe('sup-1');
    });

    it('un superviseur sans profil est refuse (fail-closed)', async () => {
      await expect(service.findAllForProject('p-1', {} as any, { userId: 'u', role: 'SUPERVISOR' } as any)).rejects.toMatchObject({
        code: 'PROJECT_ACCESS_DENIED',
      });
    });

    it("n'inclut pas les depots archives par defaut", async () => {
      await service.findAllForProject('p-1', {} as any, adminActor as any);

      expect(prisma.deposit.findMany.mock.calls[0][0].where.isArchived).toBe(false);
    });
  });

  describe('findOne', () => {
    const detailed = { ...pendingDeposit() };

    it('refuse un client qui ne possede pas le depot', async () => {
      prisma.deposit.findUnique.mockResolvedValue(detailed);

      await expect(service.findOne('d-1', { userId: 'u', role: 'CLIENT', clientProfileId: 'autre' } as any)).rejects.toMatchObject({
        code: 'PROJECT_ACCESS_DENIED',
      });
    });

    it('refuse un client sans profil (fail-closed)', async () => {
      prisma.deposit.findUnique.mockResolvedValue(detailed);

      await expect(service.findOne('d-1', { userId: 'u', role: 'CLIENT' } as any)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    });

    it('autorise le client proprietaire', async () => {
      prisma.deposit.findUnique.mockResolvedValue(detailed);

      await expect(service.findOne('d-1', { userId: 'u', role: 'CLIENT', clientProfileId: 'cli-1' } as any)).resolves.toBeDefined();
    });
  });
});
