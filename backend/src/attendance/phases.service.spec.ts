//backend/src/attendance/phases.service.spec.ts
import { DEFAULT_PHASE_NAMES } from './attendance.constants';
import { PhasesService } from './phases.service';

describe('PhasesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: PhasesService;

  const actor = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const PROJECT = 'p-1';
  const phase = (overrides: Record<string, unknown> = {}) => ({ id: 'ph-1', projectId: PROJECT, name: 'Fondation', position: 0, isActive: true, createdAt: new Date(), ...overrides });

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Villa', clientId: 'c-1', status: 'ACTIVE', currency: 'GNF' }) },
      projectPhase: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 2 } }),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'ph-new', ...data })),
        update: jest.fn().mockImplementation(({ where, data }: any) => ({ ...phase({ id: where.id }), ...data })),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn(),
      },
      workDay: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      projectSupervisor: { findFirst: jest.fn().mockResolvedValue({ position: 'SUPERVISOR' }) },
    };
    // Autres donnees rattachees a une etape (depenses, journal, stock...) : aucune par defaut.
    for (const model of ['expense', 'siteLog', 'snag', 'reception', 'changeOrder', 'quoteLot', 'contract', 'purchaseOrder', 'stockMovement', 'workerPresence', 'phaseProgressUpdate']) {
      prisma[model] = { count: jest.fn().mockResolvedValue(0) };
    }
    prisma.runInTransaction = jest.fn().mockImplementation((fn: any) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PhasesService(prisma, audit as any);
  });

  it('cree une etape a la suite des autres, nom nettoye, avec audit', async () => {
    const created = await service.create(PROJECT, { name: '  Gros oeuvre ' }, actor);

    expect(prisma.projectPhase.create).toHaveBeenCalledWith({ data: { projectId: PROJECT, name: 'Gros oeuvre', position: 3 } });
    expect(created.name).toBe('Gros oeuvre');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'ProjectPhase' }), prisma);
  });

  it('refuse un nom deja pris (sans tenir compte de la casse)', async () => {
    prisma.projectPhase.findFirst.mockResolvedValue({ id: 'ph-x' });

    await expect(service.create(PROJECT, { name: 'fondation' }, actor)).rejects.toMatchObject({ code: 'PHASE_NAME_TAKEN' });
    expect(prisma.projectPhase.findFirst.mock.calls[0][0].where).toEqual({ projectId: PROJECT, name: { equals: 'fondation', mode: 'insensitive' } });
    expect(prisma.projectPhase.create).not.toHaveBeenCalled();
  });

  it("liste les etapes avec jours travailles et jours-ouvriers", async () => {
    prisma.projectPhase.findMany.mockResolvedValue([phase(), phase({ id: 'ph-2', name: 'Murs', position: 1 })]);
    prisma.workDay.findMany.mockResolvedValue([
      { date: new Date('2026-10-01T00:00:00Z'), isWorked: true, workersCount: 8, phaseId: 'ph-1' },
      { date: new Date('2026-10-02T00:00:00Z'), isWorked: true, workersCount: 6, phaseId: 'ph-1' },
    ]);

    const result = await service.list(PROJECT);

    expect(result[0]).toMatchObject({ name: 'Fondation', workedDays: 2, workerDays: 14 });
    expect(result[1]).toMatchObject({ name: 'Murs', workedDays: 0, workerDays: 0 });
  });

  it("renomme / desactive une etape DU projet ; 404 pour l'etape d'un autre projet", async () => {
    prisma.projectPhase.findFirst.mockResolvedValueOnce(phase());
    prisma.projectPhase.findFirst.mockResolvedValueOnce(null); // pas de doublon

    const updated = await service.update(PROJECT, 'ph-1', { name: 'Fondations', isActive: false }, actor);
    expect(updated).toMatchObject({ name: 'Fondations', isActive: false });
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'UPDATE', oldValue: { name: 'Fondation' }, newValue: { name: 'Fondations' } });

    prisma.projectPhase.findFirst.mockResolvedValueOnce(null);
    await expect(service.update(PROJECT, 'ph-autre', { name: 'X1' }, actor)).rejects.toMatchObject({ status: 404 });
    expect(prisma.projectPhase.findFirst.mock.calls[0][0].where).toEqual({ id: 'ph-1', projectId: PROJECT });
  });

  it("refuse de renommer une etape avec le nom d'une autre", async () => {
    prisma.projectPhase.findFirst.mockResolvedValueOnce(phase());
    prisma.projectPhase.findFirst.mockResolvedValueOnce({ id: 'ph-2' });

    await expect(service.update(PROJECT, 'ph-1', { name: 'Murs' }, actor)).rejects.toMatchObject({ code: 'PHASE_NAME_TAKEN' });
  });

  it("reordonne : la liste doit contenir toutes les etapes, une fois chacune", async () => {
    prisma.projectPhase.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    await expect(service.reorder(PROJECT, { orderedIds: ['a', 'b'] }, actor)).rejects.toMatchObject({ code: 'PHASES_MISMATCH' });
    await expect(service.reorder(PROJECT, { orderedIds: ['a', 'b', 'zzz'] }, actor)).rejects.toMatchObject({ code: 'PHASES_MISMATCH' });
    expect(prisma.projectPhase.update).not.toHaveBeenCalled();

    await service.reorder(PROJECT, { orderedIds: ['c', 'a', 'b'] }, actor);
    expect(prisma.projectPhase.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data.position])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });

  it("ne supprime pas une etape utilisee par des jours (il faut la desactiver)", async () => {
    prisma.projectPhase.findFirst.mockResolvedValue(phase());
    prisma.workDay.count.mockResolvedValue(3);

    await expect(service.remove(PROJECT, 'ph-1', actor)).rejects.toMatchObject({ code: 'PHASE_IN_USE' });
    expect(prisma.projectPhase.delete).not.toHaveBeenCalled();
  });

  it("supprime une etape inutilisee et trace la suppression", async () => {
    prisma.projectPhase.findFirst.mockResolvedValue(phase());

    await expect(service.remove(PROJECT, 'ph-1', actor)).resolves.toEqual({ removed: true });
    expect(prisma.projectPhase.delete).toHaveBeenCalledWith({ where: { id: 'ph-1' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_SOFT' }), prisma);
  });

  it("etapes par defaut : seulement pour un projet sans etape", async () => {
    prisma.projectPhase.count.mockResolvedValue(2);
    await expect(service.createDefaults(PROJECT, actor)).rejects.toMatchObject({ code: 'PHASES_ALREADY_EXIST' });
    expect(prisma.projectPhase.createMany).not.toHaveBeenCalled();

    prisma.projectPhase.count.mockResolvedValue(0);
    await service.createDefaults(PROJECT, actor);
    const rows = prisma.projectPhase.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.name)).toEqual([...DEFAULT_PHASE_NAMES]);
    expect(rows.map((r: any) => r.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  describe('budget et planning par etape', () => {
    const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1' };

    it("le client fixe le budget d'une etape (arrondi) avec trace d'audit", async () => {
      prisma.projectPhase.findFirst.mockResolvedValueOnce(phase());

      await service.update(PROJECT, 'ph-1', { budgetAmount: 1_500_000.456 }, actor);

      expect(prisma.projectPhase.update.mock.calls[0][0].data.budgetAmount.toString()).toBe('1500000.46');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'ProjectPhase' }), prisma);
    });

    it("le superviseur de saisie ne peut pas fixer le budget d'une etape", async () => {
      await expect(service.update(PROJECT, 'ph-1', { budgetAmount: 10 }, supervisor)).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
      expect(prisma.projectPhase.update).not.toHaveBeenCalled();
    });

    it('le conducteur de travaux modifie le planning mais pas le budget', async () => {
      prisma.projectSupervisor.findFirst.mockResolvedValue({ position: 'SITE_MANAGER' });
      prisma.projectPhase.findFirst.mockResolvedValueOnce(phase());

      await service.update(PROJECT, 'ph-1', { plannedStart: '2026-11-01', plannedEnd: '2026-11-30' }, supervisor);
      expect(prisma.projectPhase.update.mock.calls[0][0].data.plannedEnd).toEqual(new Date('2026-11-30T00:00:00Z'));

      await expect(service.update(PROJECT, 'ph-1', { budgetAmount: 10 }, supervisor)).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
    });

    it('refuse un planning dont le debut suit la fin', async () => {
      prisma.projectPhase.findFirst.mockResolvedValueOnce(phase());

      await expect(service.update(PROJECT, 'ph-1', { plannedStart: '2026-12-01', plannedEnd: '2026-11-01' }, actor)).rejects.toMatchObject({ code: 'INVALID_PLANNING' });
    });

    it('efface le budget avec null', async () => {
      prisma.projectPhase.findFirst.mockResolvedValueOnce(phase({ budgetAmount: 500 }));

      await service.update(PROJECT, 'ph-1', { budgetAmount: null }, actor);

      expect(prisma.projectPhase.update.mock.calls[0][0].data.budgetAmount).toBeNull();
    });
  });

  it('projet inexistant : 404', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.list('inconnu')).rejects.toMatchObject({ status: 404 });
  });
});
