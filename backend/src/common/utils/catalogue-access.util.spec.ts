//backend/src/common/utils/catalogue-access.util.spec.ts
import {
  assertCanManageCatalogueEntry,
  canReadCatalogueEntry,
  catalogueReadFilter,
  isCatalogueEntryUsableBy,
  isParentCompatible,
  resolveCatalogueOwner,
} from './catalogue-access.util';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

const admin: AuthenticatedUser = { userId: 'u-admin', email: 'a@a', role: 'SUPERADMIN' };
const client: AuthenticatedUser = { userId: 'u-c', email: 'c@c', role: 'CLIENT', clientProfileId: 'c-1', tenantClientId: 'c-1' };
const supervisor: AuthenticatedUser = { userId: 'u-s', email: 's@s', role: 'SUPERVISOR', supervisorProfileId: 's-1', tenantClientId: 'c-1' };

describe('catalogue par client', () => {
  describe('catalogueReadFilter', () => {
    it('superadmin : tout le catalogue', () => {
      expect(catalogueReadFilter(admin)).toEqual({});
    });

    it('client et superviseur : entrees globales + privees de leur client', () => {
      const expected = { OR: [{ ownerClientId: null }, { ownerClientId: 'c-1' }] };
      expect(catalogueReadFilter(client)).toEqual(expected);
      expect(catalogueReadFilter(supervisor)).toEqual(expected);
    });

    it('fail-closed : un utilisateur sans client de rattachement est refuse', () => {
      expect(() => catalogueReadFilter({ ...client, tenantClientId: undefined })).toThrow();
    });
  });

  describe('canReadCatalogueEntry', () => {
    it('autorise global et propre catalogue, refuse celui d\'un autre client', () => {
      expect(canReadCatalogueEntry(client, null)).toBe(true);
      expect(canReadCatalogueEntry(client, 'c-1')).toBe(true);
      expect(canReadCatalogueEntry(client, 'c-2')).toBe(false);
      expect(canReadCatalogueEntry(admin, 'c-2')).toBe(true);
    });
  });

  describe('resolveCatalogueOwner', () => {
    it('superadmin : global par defaut, ou pour le client indique', () => {
      expect(resolveCatalogueOwner(admin)).toBeNull();
      expect(resolveCatalogueOwner(admin, 'c-9')).toBe('c-9');
    });

    it('client / superviseur : toujours leur propre client', () => {
      expect(resolveCatalogueOwner(client)).toBe('c-1');
      expect(resolveCatalogueOwner(supervisor)).toBe('c-1');
      expect(resolveCatalogueOwner(client, 'c-1')).toBe('c-1');
    });

    it('refuse de creer une entree pour un autre client', () => {
      expect(() => resolveCatalogueOwner(client, 'c-2')).toThrow();
    });
  });

  describe('assertCanManageCatalogueEntry', () => {
    it('superadmin : peut tout modifier', () => {
      expect(() => assertCanManageCatalogueEntry(admin, null, 'Categorie')).not.toThrow();
      expect(() => assertCanManageCatalogueEntry(admin, 'c-2', 'Categorie')).not.toThrow();
    });

    it('client : peut modifier SES entrees privees', () => {
      expect(() => assertCanManageCatalogueEntry(client, 'c-1', 'Categorie')).not.toThrow();
    });

    it('client : ne peut pas modifier le catalogue global (403)', () => {
      try {
        assertCanManageCatalogueEntry(client, null, 'Categorie');
        throw new Error('aurait du lever');
      } catch (err: any) {
        expect(err.code).toBe('CATALOGUE_FORBIDDEN');
        expect(err.getStatus()).toBe(403);
      }
    });

    it("client : l'entree d'un autre client est INTROUVABLE (404), son existence n'est pas revelee", () => {
      try {
        assertCanManageCatalogueEntry(client, 'c-2', 'Categorie');
        throw new Error('aurait du lever');
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
        expect(err.getStatus()).toBe(404);
      }
    });

    it('superviseur : ne modifie jamais le catalogue, meme celui de son client', () => {
      expect(() => assertCanManageCatalogueEntry(supervisor, 'c-1', 'Categorie')).toThrow();
    });
  });

  describe('coherence', () => {
    it('isCatalogueEntryUsableBy : global ou du meme client', () => {
      expect(isCatalogueEntryUsableBy(null, 'c-1')).toBe(true);
      expect(isCatalogueEntryUsableBy('c-1', 'c-1')).toBe(true);
      expect(isCatalogueEntryUsableBy('c-2', 'c-1')).toBe(false);
    });

    it("isParentCompatible : un enfant global n'a que des parents globaux ; un enfant prive accepte global ou meme proprietaire", () => {
      expect(isParentCompatible(null, null)).toBe(true);
      expect(isParentCompatible(null, 'c-1')).toBe(false);
      expect(isParentCompatible('c-1', null)).toBe(true);
      expect(isParentCompatible('c-1', 'c-1')).toBe(true);
      expect(isParentCompatible('c-1', 'c-2')).toBe(false);
    });
  });
});
