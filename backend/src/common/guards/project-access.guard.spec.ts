//backend/src/common/guards/project-access.guard.spec.ts
import { Reflector } from '@nestjs/core';
import { ProjectAccessGuard } from './project-access.guard';

describe('ProjectAccessGuard', () => {
  let prisma: { project: { findFirst: jest.Mock } };
  let guard: ProjectAccessGuard;

  const contextFor = (user: unknown, params: Record<string, string> = { projectId: 'p-1' }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    }) as any;

  beforeEach(() => {
    prisma = { project: { findFirst: jest.fn() } };
    guard = new ProjectAccessGuard(prisma as any, new Reflector());
  });

  it('refuse une requete sans utilisateur authentifie', async () => {
    await expect(guard.canActivate(contextFor(undefined))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  });

  it('le superadmin passe sans requete', async () => {
    await expect(guard.canActivate(contextFor({ role: 'SUPERADMIN' }))).resolves.toBe(true);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it('client : autorise si le projet lui appartient (filtre sur son clientId)', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p-1' });

    await expect(guard.canActivate(contextFor({ role: 'CLIENT', clientProfileId: 'c-1' }))).resolves.toBe(true);
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { AND: [{ id: 'p-1' }, { clientId: 'c-1' }] }, select: { id: true } });
  });

  it("client : refuse le projet d'un autre client", async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor({ role: 'CLIENT', clientProfileId: 'c-2' }))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  });

  it('superviseur : exige une affectation ACTIVE au projet', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p-1' });

    await guard.canActivate(contextFor({ role: 'SUPERVISOR', supervisorProfileId: 's-1' }));

    expect(prisma.project.findFirst.mock.calls[0][0].where.AND[1]).toEqual({
      supervisors: { some: { supervisorId: 's-1', status: 'ACTIVE' } },
    });
  });

  it("FAIL-CLOSED : un profil manquant est refuse sans meme interroger la base (pas de filtre 'undefined')", async () => {
    await expect(guard.canActivate(contextFor({ role: 'CLIENT' }))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    await expect(guard.canActivate(contextFor({ role: 'SUPERVISOR' }))).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it('refuse si le parametre de projet est absent', async () => {
    await expect(guard.canActivate(contextFor({ role: 'CLIENT', clientProfileId: 'c-1' }, {}))).rejects.toMatchObject({
      code: 'PROJECT_ACCESS_DENIED',
    });
  });
});
