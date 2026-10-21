//backend/src/categories/categories.service.spec.ts
/**
 * Catalogue par client : un client cree et gere SES categories, sans jamais voir ni toucher celles d'un
 * autre client. Les categories globales (ownerClientId null) restent gerees par le superadmin.
 */

import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: CategoriesService;

  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1', tenantClientId: 'c-1' };

  const category = (overrides: Record<string, unknown> = {}) => ({ id: 'cat-1', name: 'Ciment', group: 'Gros oeuvre', isActive: true, ownerClientId: null, ...overrides });

  beforeEach(() => {
    prisma = {
      expenseCategory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'cat-new', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'cat-1', ...data })),
        delete: jest.fn(),
      },
      material: { count: jest.fn().mockResolvedValue(0) },
      expense: { count: jest.fn().mockResolvedValue(0) },
      budget: { count: jest.fn().mockResolvedValue(0) },
    };
    prisma.runInTransaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new CategoriesService(prisma, audit as any);
  });

  describe('create', () => {
    it('le superadmin cree une categorie GLOBALE (ou pour un client donne)', async () => {
      await service.create({ name: 'Beton' } as any, admin);
      await service.create({ name: 'Beton', ownerClientId: 'c-9' } as any, admin);

      expect(prisma.expenseCategory.create.mock.calls[0][0].data.ownerClientId).toBeNull();
      expect(prisma.expenseCategory.create.mock.calls[1][0].data.ownerClientId).toBe('c-9');
    });

    it('un client ou son superviseur cree une categorie PRIVEE de leur client', async () => {
      await service.create({ name: 'Perso' } as any, client);
      await service.create({ name: 'Perso 2' } as any, supervisor);

      expect(prisma.expenseCategory.create.mock.calls.map((c: any) => c[0].data.ownerClientId)).toEqual(['c-1', 'c-1']);
    });

    it("refuse de creer pour un autre client", async () => {
      await expect(service.create({ name: 'X', ownerClientId: 'c-2' } as any, client)).rejects.toMatchObject({ code: 'CATALOGUE_FORBIDDEN' });
      expect(prisma.expenseCategory.create).not.toHaveBeenCalled();
    });

    it('refuse un nom deja pris (insensible a la casse) dans le perimetre visible : globales + siennes', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1' });

      await expect(service.create({ name: 'ciment' } as any, client)).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });

      const where = prisma.expenseCategory.findFirst.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ OR: [{ ownerClientId: null }, { ownerClientId: 'c-1' }] });
      expect(where.AND[1]).toEqual({ name: { equals: 'ciment', mode: 'insensitive' } });
    });

    it('pour une categorie globale, seule l\'unicite parmi les globales est verifiee (pas de fuite sur les noms prives)', async () => {
      await service.create({ name: 'Beton' } as any, admin);

      expect(prisma.expenseCategory.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ ownerClientId: null });
    });

    it('verifie le nom et ecrit dans la meme transaction (anti-doublon concurrent)', async () => {
      await service.create({ name: 'Perso' } as any, client);

      expect(prisma.runInTransaction).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }), prisma);
    });
  });

  describe('findAll', () => {
    it('le superadmin voit tout', async () => {
      await service.findAll(admin, false);

      expect(prisma.expenseCategory.findMany.mock.calls[0][0].where).toEqual({ AND: [{}, { isActive: true }] });
    });

    it('un client voit les globales + les siennes, jamais celles des autres', async () => {
      await service.findAll(client, true);

      expect(prisma.expenseCategory.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ OR: [{ ownerClientId: null }, { ownerClientId: 'c-1' }] }, {}],
      });
    });

    it('un utilisateur sans client de rattachement est refuse (fail-closed)', async () => {
      await expect(service.findAll({ ...client, tenantClientId: undefined }, false)).rejects.toBeDefined();
    });
  });

  describe('update / activation / suppression', () => {
    it('le client modifie SA categorie privee', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category({ ownerClientId: 'c-1' }));

      await expect(service.update('cat-1', { name: 'Nouveau nom' } as any, client)).resolves.toBeDefined();
      // Le proprietaire n'est jamais modifiable
      expect(prisma.expenseCategory.update.mock.calls[0][0].data).not.toHaveProperty('ownerClientId');
    });

    it('le client ne modifie pas une categorie GLOBALE (403)', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category());

      await expect(service.update('cat-1', { name: 'X' } as any, client)).rejects.toMatchObject({ code: 'CATALOGUE_FORBIDDEN' });
      await expect(service.setActive('cat-1', false, client)).rejects.toMatchObject({ code: 'CATALOGUE_FORBIDDEN' });
      await expect(service.remove('cat-1', client)).rejects.toMatchObject({ code: 'CATALOGUE_FORBIDDEN' });
    });

    it("la categorie d'un AUTRE client est introuvable (404)", async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category({ ownerClientId: 'c-2' }));

      await expect(service.update('cat-1', { name: 'X' } as any, client)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(service.remove('cat-1', client)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('le superadmin gere tout', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category());

      await expect(service.update('cat-1', { group: 'Autre' } as any, admin)).resolves.toBeDefined();
      await expect(service.setActive('cat-1', false, admin)).resolves.toBeDefined();
    });

    it("le renommage est refuse si le nouveau nom existe deja, mais pas si seule la casse change", async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category({ ownerClientId: 'c-1', name: 'Ciment' }));

      await service.update('cat-1', { name: 'CIMENT' } as any, client); // meme nom : aucune verification
      expect(prisma.expenseCategory.findFirst).not.toHaveBeenCalled();

      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'autre' });
      await expect(service.update('cat-1', { name: 'Sable' } as any, client)).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    });

    it('suppression refusee tant que la categorie est utilisee (materiaux, depenses, budgets)', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category({ ownerClientId: 'c-1' }));
      prisma.expense.count.mockResolvedValue(3);

      await expect(service.remove('cat-1', client)).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' });
      expect(prisma.expenseCategory.delete).not.toHaveBeenCalled();
    });

    it('suppression d\'une categorie inutilisee', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category({ ownerClientId: 'c-1' }));

      await expect(service.remove('cat-1', client)).resolves.toEqual({ removed: true });
      expect(prisma.expenseCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('categorie inexistante -> 404', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(null);

      await expect(service.update('x', {} as any, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
