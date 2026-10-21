//backend/src/attendance/work-days.service.spec.ts
/**
 * Regles du calendrier des jours travailles :
 *  - un jour travaille exige un effectif >= 1 et une etape active du projet ;
 *  - un jour non travaille n'enregistre ni effectif ni etape ;
 *  - jamais de jour futur ; un superviseur est limite aux 14 derniers jours (le superadmin corrige tout) ;
 *  - un projet suspendu/termine/archive n'accepte plus de saisie (sauf du superadmin) ;
 *  - chaque saisie, correction ou suppression est tracee dans l'audit.
 */

import { WorkDaysService } from './work-days.service';

describe('WorkDaysService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: WorkDaysService;

  const supervisor = { userId: 'u-sup', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 'sp-1', tenantClientId: 'c-1' };
  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };
  const PROJECT = 'p-1';
  const PHASE = 'ph-1';

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'wd-1',
    projectId: PROJECT,
    date: new Date('2026-10-20T00:00:00Z'),
    isWorked: true,
    workersCount: 8,
    phaseId: PHASE,
    phase: { name: 'Fondation' },
    note: null,
    recordedById: 'u-sup',
    updatedAt: new Date('2026-10-21T08:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00Z'));
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectPhase: {
        findFirst: jest.fn().mockResolvedValue({ isActive: true }),
        findMany: jest.fn().mockResolvedValue([{ id: PHASE, name: 'Fondation', isActive: true }]),
      },
      workDay: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create }: any) => row({ ...create, id: 'wd-new' })),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new WorkDaysService(prisma, audit as any);
  });

  afterEach(() => jest.useRealTimers());

  describe('upsert', () => {
    it("enregistre un jour travaille (effectif + etape) et l'ecrit dans l'audit", async () => {
      const result = await service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 8, phaseId: PHASE, note: ' coulage ' }, supervisor);

      const args = prisma.workDay.upsert.mock.calls[0][0];
      expect(args.create).toMatchObject({ projectId: PROJECT, isWorked: true, workersCount: 8, phaseId: PHASE, note: 'coulage', recordedById: 'u-sup' });
      expect(args.where).toEqual({ projectId_date: { projectId: PROJECT, date: new Date('2026-10-20T00:00:00Z') } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'WorkDay' }), prisma);
      expect(result).toMatchObject({ date: '2026-10-20', isWorked: true, workersCount: 8 });
    });

    it("exige un effectif d'au moins 1 pour un jour travaille", async () => {
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: true, phaseId: PHASE }, supervisor)).rejects.toMatchObject({ code: 'WORKERS_REQUIRED' });
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 0, phaseId: PHASE }, supervisor)).rejects.toMatchObject({
        code: 'WORKERS_REQUIRED',
      });
      expect(prisma.workDay.upsert).not.toHaveBeenCalled();
    });

    it("exige une etape pour un jour travaille", async () => {
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 5 }, supervisor)).rejects.toMatchObject({ code: 'PHASE_REQUIRED' });
    });

    it("refuse une etape inconnue, d'un autre projet ou desactivee", async () => {
      prisma.projectPhase.findFirst.mockResolvedValue(null);
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 5, phaseId: PHASE }, supervisor)).rejects.toMatchObject({
        code: 'INVALID_PHASE',
      });
      prisma.projectPhase.findFirst.mockResolvedValue({ isActive: false });
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 5, phaseId: PHASE }, supervisor)).rejects.toMatchObject({
        code: 'INVALID_PHASE',
      });
      // L'etape est cherchee DANS ce projet.
      expect(prisma.projectPhase.findFirst.mock.calls[0][0].where).toEqual({ id: PHASE, projectId: PROJECT });
    });

    it("un jour non travaille n'enregistre ni effectif ni etape, meme s'ils sont fournis", async () => {
      await service.upsert(PROJECT, '2026-10-20', { isWorked: false, workersCount: 12, phaseId: PHASE, note: 'Pluie' }, supervisor);

      expect(prisma.workDay.upsert.mock.calls[0][0].create).toMatchObject({ isWorked: false, workersCount: 0, phaseId: null, note: 'Pluie' });
      expect(prisma.projectPhase.findFirst).not.toHaveBeenCalled();
    });

    it("la correction d'un jour existant garde l'ancienne valeur dans l'audit", async () => {
      prisma.workDay.findUnique.mockResolvedValue(row({ workersCount: 4 }));

      await service.upsert(PROJECT, '2026-10-20', { isWorked: true, workersCount: 9, phaseId: PHASE }, supervisor);

      const entry = audit.log.mock.calls[0][0];
      expect(entry.action).toBe('UPDATE');
      expect(entry.oldValue).toMatchObject({ workersCount: 4 });
      expect(entry.newValue).toMatchObject({ workersCount: 9 });
    });

    it('refuse un jour futur', async () => {
      await expect(service.upsert(PROJECT, '2026-10-22', { isWorked: false }, supervisor)).rejects.toMatchObject({ code: 'FUTURE_DATE' });
      await expect(service.upsert(PROJECT, '2026-10-22', { isWorked: false }, admin)).rejects.toMatchObject({ code: 'FUTURE_DATE' });
    });

    it("limite le superviseur aux 14 derniers jours ; le superadmin peut corriger plus loin", async () => {
      await expect(service.upsert(PROJECT, '2026-10-07', { isWorked: false }, supervisor)).resolves.toBeDefined(); // exactement 14 jours
      await expect(service.upsert(PROJECT, '2026-10-06', { isWorked: false }, supervisor)).rejects.toMatchObject({ code: 'WORKDAY_LOCKED' });
      await expect(service.upsert(PROJECT, '2026-06-01', { isWorked: false }, admin)).resolves.toBeDefined();
    });

    it('refuse une date invalide', async () => {
      await expect(service.upsert(PROJECT, '2026-02-30', { isWorked: false }, supervisor)).rejects.toMatchObject({ code: 'INVALID_DATE' });
      await expect(service.upsert(PROJECT, 'hier', { isWorked: false }, supervisor)).rejects.toMatchObject({ code: 'INVALID_DATE' });
    });

    it("un projet suspendu n'accepte plus de saisie du superviseur, mais le superadmin peut corriger", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'SUSPENDED', currency: 'GNF' });

      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: false }, supervisor)).rejects.toMatchObject({ code: 'PROJECT_NOT_ACTIVE' });
      await expect(service.upsert(PROJECT, '2026-10-20', { isWorked: false }, admin)).resolves.toBeDefined();
    });

    it('projet inexistant : 404 (le guard laisse passer le superadmin sur tout identifiant)', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.upsert('inconnu', '2026-10-20', { isWorked: false }, admin)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('remove', () => {
    it('efface la saisie et trace la suppression', async () => {
      prisma.workDay.findUnique.mockResolvedValue(row());

      await expect(service.remove(PROJECT, '2026-10-20', supervisor)).resolves.toEqual({ removed: true });

      expect(prisma.workDay.delete).toHaveBeenCalledWith({ where: { id: 'wd-1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_SOFT', entityId: 'wd-1' }), prisma);
    });

    it("404 si le jour n'est pas renseigne ; respecte la fenetre de 14 jours", async () => {
      await expect(service.remove(PROJECT, '2026-10-20', supervisor)).rejects.toMatchObject({ status: 404 });
      await expect(service.remove(PROJECT, '2026-09-01', supervisor)).rejects.toMatchObject({ code: 'WORKDAY_LOCKED' });
    });
  });

  describe('lecture', () => {
    it("listMonth : jours du mois + statistiques (5 jours travailles sur les jours ecoules)", async () => {
      prisma.workDay.findMany.mockResolvedValue(
        ['01', '02', '05', '07', '09'].map((d) => row({ id: `wd-${d}`, date: new Date(`2026-10-${d}T00:00:00Z`), workersCount: 4 })),
      );

      const result = await service.listMonth(PROJECT, '2026-10');

      const where = prisma.workDay.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ projectId: PROJECT, date: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } });
      expect(result.days).toHaveLength(5);
      expect(result.summary).toMatchObject({ daysInMonth: 31, elapsedDays: 21, workedDays: 5, workerDays: 20, unrecordedDays: 16 });
    });

    it('summary : totaux, par etape et par mois', async () => {
      prisma.workDay.findMany.mockResolvedValue([
        { date: new Date('2026-09-29T00:00:00Z'), isWorked: true, workersCount: 6, phaseId: PHASE },
        { date: new Date('2026-10-01T00:00:00Z'), isWorked: true, workersCount: 8, phaseId: PHASE },
        { date: new Date('2026-10-02T00:00:00Z'), isWorked: false, workersCount: 0, phaseId: null },
      ]);

      const result = await service.summary(PROJECT);

      expect(result.totals).toMatchObject({ workedDays: 2, notWorkedDays: 1, recordedDays: 3, workerDays: 14, firstWorkedDate: '2026-09-29', lastWorkedDate: '2026-10-01' });
      expect(result.byPhase[0]).toMatchObject({ name: 'Fondation', workedDays: 2, workerDays: 14 });
      expect(result.byMonth.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    });
  });
});
