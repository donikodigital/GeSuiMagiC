//backend/src/attachments/attachments.service.spec.ts
/**
 * Isolation des pieces jointes :
 *  - une piece jointe n'est rattachable qu'a une cible que l'acteur peut consulter, et toutes les cibles
 *    (projet / depot / depense) doivent appartenir au MEME projet ;
 *  - le fichier doit avoir ete televerse via notre presign, dans le dossier de l'acteur ;
 *  - la taille enregistree est la taille REELLE de l'objet (pas celle declaree par le navigateur) ;
 *  - un justificatif d'une operation verrouillee ne peut plus etre retire par son auteur.
 */

import { AttachmentsService, sanitizeFileName } from './attachments.service';

describe('sanitizeFileName', () => {
  it('retire separateurs de chemin et caracteres de controle', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFileName('a\u0000b\r\nc.pdf')).toBe('abc.pdf');
  });

  it('utilise un nom par defaut et limite la longueur', () => {
    expect(sanitizeFileName('   ')).toBe('fichier');
    expect(sanitizeFileName('x'.repeat(400))).toHaveLength(255);
  });
});

describe('AttachmentsService', () => {
  let prisma: any;
  let storage: any;
  let audit: { log: jest.Mock };
  let service: AttachmentsService;

  const admin = { userId: 'u-admin', email: 'a@x', role: 'SUPERADMIN' as const };
  const client = { userId: 'u-c', email: 'c@x', role: 'CLIENT' as const, clientProfileId: 'c-1', tenantClientId: 'c-1' };
  const supervisor = { userId: 'u-s', email: 's@x', role: 'SUPERVISOR' as const, supervisorProfileId: 's-1', tenantClientId: 'c-1' };

  const validDto = (overrides: Record<string, unknown> = {}) => ({
    fileName: 'facture.pdf',
    fileUrl: 'https://cdn.example/c-1/facture/2026/abc.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1,
    kind: 'facture',
    projectId: 'p-1',
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      deposit: { findUnique: jest.fn() },
      expense: { findUnique: jest.fn() },
      attachment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'a-1', ...data })),
        delete: jest.fn(),
      },
    };
    storage = {
      createPresignedUploadUrl: jest.fn().mockResolvedValue({ uploadUrl: 'u', fileUrl: 'f', key: 'k' }),
      keyFromFileUrl: jest.fn((url: string) => (url.startsWith('https://cdn.example/') ? url.slice('https://cdn.example/'.length) : null)),
      fileUrlForKey: jest.fn((key: string) => `https://cdn.example/${key}`),
      verifyUploadedObject: jest.fn().mockResolvedValue({ sizeBytes: 12_345 }),
      resolveReadUrl: jest.fn(async (url: string) => `${url}?signed=1`),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AttachmentsService(prisma, audit as any, storage, { get: () => 15 } as any);
  });

  describe('presign', () => {
    it("range le fichier dans le dossier du client (locataire) ou 'admin'", async () => {
      await service.presign({ fileName: 'a.pdf', mimeType: 'application/pdf', kind: 'facture' } as any, client);
      await service.presign({ fileName: 'a.pdf', mimeType: 'application/pdf', kind: 'facture' } as any, supervisor);
      await service.presign({ fileName: 'a.pdf', mimeType: 'application/pdf', kind: 'facture' } as any, admin);

      expect(storage.createPresignedUploadUrl.mock.calls.map((c: any[]) => c[0])).toEqual(['c-1', 'c-1', 'admin']);
    });
  });

  describe('create', () => {
    it('enregistre la taille REELLE, un nom assaini et le type canonique', async () => {
      const result: any = await service.create(validDto({ fileName: '../x\ny.pdf', mimeType: 'image/jpg', fileUrl: 'https://cdn.example/c-1/facture/2026/abc.jpg' }) as any, client);

      const data = prisma.attachment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ fileSizeBytes: 12_345, mimeType: 'image/jpeg', uploadedById: 'u-c' });
      expect(data.fileName).not.toMatch(/[\\/\n]/);
      // Et l'URL renvoyee est l'URL de lecture (signee en mode prive)
      expect(result.fileUrl).toContain('?signed=1');
    });

    it('exige une cible', async () => {
      await expect(service.create(validDto({ projectId: undefined }) as any, client)).rejects.toMatchObject({ code: 'ATTACHMENT_TARGET_REQUIRED' });
    });

    it("refuse une cible hors du perimetre de l'acteur", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.create(validDto() as any, client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.attachment.create).not.toHaveBeenCalled();
    });

    it("refuse de melanger SON projet et le depot d'un autre projet", async () => {
      prisma.deposit.findUnique.mockResolvedValue({ projectId: 'p-AUTRE' });

      await expect(service.create(validDto({ depositId: 'd-1' }) as any, client)).rejects.toMatchObject({ code: 'ATTACHMENT_TARGET_MISMATCH' });
    });

    it('refuse un depot / une depense inexistants (sans reveler lesquels pour un non-admin)', async () => {
      prisma.deposit.findUnique.mockResolvedValue(null);
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto({ projectId: undefined, depositId: 'd-x' }) as any, client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      await expect(service.create(validDto({ projectId: undefined, expenseId: 'e-x' }) as any, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it.each([
      ['URL externe', 'https://evil.example/c-1/facture/2026/a.pdf'],
      ["dossier d'un autre client", 'https://cdn.example/c-2/facture/2026/a.pdf'],
      ['autre categorie que celle annoncee', 'https://cdn.example/c-1/photo/2026/a.pdf'],
    ])('refuse un fichier non televerse via notre presign : %s', async (_label, fileUrl) => {
      await expect(service.create(validDto({ fileUrl }) as any, client)).rejects.toMatchObject({ code: 'INVALID_FILE_URL' });
      expect(storage.verifyUploadedObject).not.toHaveBeenCalled();
    });

    it('refuse un fichier deja enregistre', async () => {
      prisma.attachment.findFirst.mockResolvedValue({ id: 'a-0' });

      await expect(service.create(validDto() as any, client)).rejects.toMatchObject({ code: 'FILE_ALREADY_REGISTERED' });
    });

    it("propage l'echec de verification de l'objet (introuvable, trop gros...)", async () => {
      storage.verifyUploadedObject.mockRejectedValue(Object.assign(new Error('x'), { code: 'FILE_TOO_LARGE' }));

      await expect(service.create(validDto() as any, client)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
      expect(prisma.attachment.create).not.toHaveBeenCalled();
    });

    it('applique la taille maximale configuree (15 Mo)', async () => {
      await service.create(validDto() as any, client);

      expect(storage.verifyUploadedObject).toHaveBeenCalledWith('c-1/facture/2026/abc.pdf', 'application/pdf', 15 * 1024 * 1024);
    });
  });

  describe('findFor', () => {
    it('un non-superadmin doit cibler une ressource (jamais de liste globale)', async () => {
      await expect(service.findFor({}, client)).rejects.toMatchObject({ code: 'ATTACHMENT_TARGET_REQUIRED' });
    });

    it('un non-superadmin ne lit pas les pieces d\'un projet hors perimetre', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findFor({ projectId: 'p-1' }, client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.attachment.findMany).not.toHaveBeenCalled();
    });

    it('limite la liste et renvoie des URLs de lecture', async () => {
      prisma.attachment.findMany.mockResolvedValue([{ id: 'a-1', fileUrl: 'https://cdn.example/x.pdf' }]);

      const result = await service.findFor({ projectId: 'p-1' }, client);

      expect(prisma.attachment.findMany.mock.calls[0][0].take).toBe(200);
      expect(result[0].fileUrl).toBe('https://cdn.example/x.pdf?signed=1');
    });

    it('le superadmin peut lister sans cible', async () => {
      await expect(service.findFor({}, admin)).resolves.toEqual([]);
    });
  });

  describe('remove', () => {
    const stored = (overrides: Record<string, unknown> = {}) => ({
      id: 'a-1',
      fileName: 'f.pdf',
      fileUrl: 'https://cdn.example/c-1/facture/2026/abc.pdf',
      projectId: 'p-1',
      depositId: null,
      expenseId: null,
      uploadedById: 'u-c',
      deposit: null,
      expense: null,
      ...overrides,
    });

    it("l'auteur supprime sa piece : suppression en base PUIS dans le stockage", async () => {
      prisma.attachment.findUnique.mockResolvedValue(stored());

      await expect(service.remove('a-1', client)).resolves.toEqual({ removed: true });

      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
      expect(storage.deleteByUrl).toHaveBeenCalledWith('https://cdn.example/c-1/facture/2026/abc.pdf');
    });

    it("refuse a quelqu'un qui n'est pas l'auteur du televersement", async () => {
      prisma.attachment.findUnique.mockResolvedValue(stored({ uploadedById: 'u-autre' }));

      await expect(service.remove('a-1', client)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
    });

    it('refuse a un superviseur revoque du projet (plus aucun acces)', async () => {
      prisma.attachment.findUnique.mockResolvedValue(stored({ uploadedById: 'u-s' }));
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.remove('a-1', supervisor)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    });

    it('refuse de retirer le justificatif d\'une operation verrouillee', async () => {
      prisma.attachment.findUnique.mockResolvedValue(stored({ expenseId: 'e-1', expense: { isLocked: true } }));
      prisma.expense.findUnique.mockResolvedValue({ projectId: 'p-1' });

      await expect(service.remove('a-1', client)).rejects.toMatchObject({ code: 'ENTITY_LOCKED' });
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
    });

    it('le superadmin peut supprimer meme une piece verrouillee, et la suppression est journalisee', async () => {
      prisma.attachment.findUnique.mockResolvedValue(stored({ uploadedById: 'u-autre', expense: { isLocked: true } }));

      await service.remove('a-1', admin);

      expect(prisma.attachment.delete).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_SOFT', entityType: 'Attachment' }));
    });

    it('introuvable', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.remove('a-x', client)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
