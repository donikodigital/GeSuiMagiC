//backend/src/materials/materials.service.spec.ts
/**
 * Un materiau ne peut referencer qu'une categorie / unite visible par son proprietaire :
 * un materiau GLOBAL ne pointe jamais vers un parent PRIVE (cela exposerait le catalogue d'un client a tous).
 */

import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: MaterialsService;

  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };

  const dto = (overrides: Record<string, unknown> = {}) => ({ name: 'Ciment 32,5', categoryId: 'cat-1', ...overrides });

  beforeEach(() => {
    prisma = {
      expenseCategory: { findUnique: jest.fn().mockResolvedValue({ ownerClientId: null }) },
      unit: { findUnique: jest.fn().mockResolvedValue({ ownerClientId: null }) },
      material: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'mat-new', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'mat-1', ...data })),
        delete: jest.fn(),
      },
      expense: { count: jest.fn().mockResolvedValue(0) },
    };
    prisma.runInTransaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new MaterialsService(prisma, audit as any);
  });

  describe('create', () => {
    it('un client cree un materiau PRIVE dans une categorie globale', async () => {
      await service.create(dto() as any, client);

      expect(prisma.material.create.mock.calls[0][0].data.ownerClientId).toBe('c-1');
    });

    it('un client peut utiliser sa propre categorie privee et une unite globale', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: 'c-1' });

      await expect(service.create(dto({ defaultUnitId: 'u-1' }) as any, client)).resolves.toBeDefined();
    });

    it("refuse la categorie privee d'un AUTRE client", async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: 'c-2' });

      await expect(service.create(dto() as any, client)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it("refuse l'unite privee d'un autre client", async () => {
      prisma.unit.findUnique.mockResolvedValue({ ownerClientId: 'c-2' });

      await expect(service.create(dto({ defaultUnitId: 'u-1' }) as any, client)).rejects.toMatchObject({ code: 'INVALID_UNIT' });
    });

    it('refuse une categorie inexistante', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(null);

      await expect(service.create(dto() as any, client)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
    });

    it('un materiau GLOBAL (superadmin) ne peut pas pointer vers une categorie ou une unite PRIVEE', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: 'c-1' });
      await expect(service.create(dto() as any, admin)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });

      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: null });
      prisma.unit.findUnique.mockResolvedValue({ ownerClientId: 'c-1' });
      await expect(service.create(dto({ defaultUnitId: 'u-1' }) as any, admin)).rejects.toMatchObject({ code: 'INVALID_UNIT' });
    });

    it('refuse un nom deja utilise dans la categorie (insensible a la casse)', async () => {
      prisma.material.findFirst.mockResolvedValue({ id: 'mat-0' });

      await expect(service.create(dto() as any, client)).rejects.toMatchObject({ code: 'MATERIAL_NAME_TAKEN' });
    });
  });

  describe('findAll', () => {
    it('applique le perimetre du client, le filtre de categorie et le filtre actif', async () => {
      await service.findAll(client, 'cat-1', false);

      expect(prisma.material.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ OR: [{ ownerClientId: null }, { ownerClientId: 'c-1' }] }, { categoryId: 'cat-1' }, { isActive: true }],
      });
    });
  });

  describe('update / suppression', () => {
    it("n'autorise pas un client a deplacer son materiau vers la categorie privee d'un autre client", async () => {
      prisma.material.findUnique.mockResolvedValue({ id: 'mat-1', name: 'M', categoryId: 'cat-1', ownerClientId: 'c-1' });
      prisma.expenseCategory.findUnique.mockResolvedValue({ ownerClientId: 'c-2' });

      await expect(service.update('mat-1', { categoryId: 'cat-2' } as any, client)).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
    });

    it('un client ne modifie pas un materiau global', async () => {
      prisma.material.findUnique.mockResolvedValue({ id: 'mat-1', name: 'M', categoryId: 'cat-1', ownerClientId: null });

      await expect(service.update('mat-1', { name: 'X' } as any, client)).rejects.toMatchObject({ code: 'CATALOGUE_FORBIDDEN' });
    });

    it('suppression refusee si le materiau est utilise dans des depenses', async () => {
      prisma.material.findUnique.mockResolvedValue({ id: 'mat-1', name: 'M', categoryId: 'cat-1', ownerClientId: 'c-1' });
      prisma.expense.count.mockResolvedValue(2);

      await expect(service.remove('mat-1', client)).rejects.toMatchObject({ code: 'MATERIAL_IN_USE' });
      expect(prisma.material.delete).not.toHaveBeenCalled();
    });
  });
});
