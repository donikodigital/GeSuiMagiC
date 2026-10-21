//backend/src/common/utils/project-access.util.spec.ts
import { projectAccessFilter } from './project-access.util';

describe('projectAccessFilter (fail-closed)', () => {
  it('superadmin : aucun filtre (tous les projets)', () => {
    expect(projectAccessFilter({ userId: 'u', email: 'a@a', role: 'SUPERADMIN' })).toEqual({});
  });

  it('client : uniquement ses projets', () => {
    expect(projectAccessFilter({ userId: 'u', email: 'a@a', role: 'CLIENT', clientProfileId: 'c-1' })).toEqual({ clientId: 'c-1' });
  });

  it('superviseur : uniquement les projets ou son affectation est ACTIVE', () => {
    expect(projectAccessFilter({ userId: 'u', email: 'a@a', role: 'SUPERVISOR', supervisorProfileId: 's-1' })).toEqual({
      supervisors: { some: { supervisorId: 's-1', status: 'ACTIVE' } },
    });
  });

  it('un profil manquant leve une exception au lieu de produire { clientId: undefined } (= aucun filtre pour Prisma)', () => {
    expect(() => projectAccessFilter({ userId: 'u', email: 'a@a', role: 'CLIENT' })).toThrow();
    expect(() => projectAccessFilter({ userId: 'u', email: 'a@a', role: 'SUPERVISOR' })).toThrow();
  });

  it('un role inconnu est refuse', () => {
    expect(() => projectAccessFilter({ userId: 'u', email: 'a@a', role: 'HACKER' as never })).toThrow();
  });
});
