//backend/src/storage/storage.service.spec.ts
import { Logger } from '@nestjs/common';
import { StorageService } from './storage.service';

const build = (overrides: Record<string, unknown> = {}) => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const settings: Record<string, unknown> = {
    'storage.bucket': 'mon-bucket',
    'storage.publicUrl': 'https://cdn.example/',
    'storage.privateBucket': false,
    ...overrides,
  };
  // Sans endpoint ni identifiants : aucun client S3 n'est cree (aucun appel reseau).
  return new StorageService({ get: (key: string) => settings[key] } as any);
};

describe('StorageService', () => {
  describe('buildKey', () => {
    it("construit <dossier>/<categorie>/<annee>/<uuid>.<ext> ; l'extension vient du TYPE, jamais d'un nom de fichier", () => {
      const key = build().buildKey('c-1', 'facture', 'application/pdf');

      expect(key).toMatch(new RegExp(`^c-1/facture/${new Date().getFullYear()}/[0-9a-f-]{36}\\.pdf$`));
      expect(build().buildKey('c-1', 'photo', 'image/jpg')).toMatch(/\.jpg$/);
      expect(build().buildKey('c-1', 'photo', 'image/png')).toMatch(/\.png$/);
    });

    it('refuse les types non autorises (HTML, SVG, executables...)', () => {
      for (const type of ['text/html', 'image/svg+xml', 'application/x-msdownload']) {
        expect(() => build().buildKey('c-1', 'document', type)).toThrow();
      }
    });

    it('genere des cles uniques', () => {
      const storage = build();
      expect(storage.buildKey('c-1', 'photo', 'image/png')).not.toBe(storage.buildKey('c-1', 'photo', 'image/png'));
    });
  });

  describe('fileUrlForKey / keyFromFileUrl', () => {
    it('bucket public : URL publique, et retour a la cle', () => {
      const storage = build();
      const url = storage.fileUrlForKey('c-1/facture/2026/a.pdf');

      expect(url).toBe('https://cdn.example/c-1/facture/2026/a.pdf');
      expect(storage.keyFromFileUrl(url)).toBe('c-1/facture/2026/a.pdf');
    });

    it("bucket PRIVE : jamais d'URL publique (s3://bucket/cle)", () => {
      const storage = build({ 'storage.privateBucket': true });
      const url = storage.fileUrlForKey('c-1/facture/2026/a.pdf');

      expect(url).toBe('s3://mon-bucket/c-1/facture/2026/a.pdf');
      expect(storage.keyFromFileUrl(url)).toBe('c-1/facture/2026/a.pdf');
      expect(storage.isPrivate()).toBe(true);
    });

    it.each([
      'https://evil.example/c-1/a.pdf',
      's3://autre-bucket/c-1/a.pdf',
      'https://cdn.example/../secret',
      'https://cdn.example/c-1/a.pdf?X-Amz=1',
      'https://cdn.example/c-1/a.pdf#frag',
      'https://cdn.example//etc',
      'https://cdn.example/',
      'javascript:alert(1)',
    ])('rejette %s (URL etrangere ou suspecte)', (url) => {
      expect(build().keyFromFileUrl(url)).toBeNull();
    });
  });

  describe('sans configuration S3', () => {
    it('refuse le presign et la verification avec STORAGE_NOT_CONFIGURED', async () => {
      const storage = build();

      await expect(storage.createPresignedUploadUrl('c-1', 'application/pdf', 'facture')).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
      await expect(storage.verifyUploadedObject('k', 'application/pdf', 100)).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED' });
    });

    it("resolveReadUrl rend l'URL telle quelle et deleteByUrl ne plante pas", async () => {
      const storage = build({ 'storage.privateBucket': true });

      await expect(storage.resolveReadUrl('s3://mon-bucket/c-1/a.pdf')).resolves.toBe('s3://mon-bucket/c-1/a.pdf');
      await expect(storage.deleteByUrl('s3://mon-bucket/c-1/a.pdf')).resolves.toBeUndefined();
    });
  });
});
