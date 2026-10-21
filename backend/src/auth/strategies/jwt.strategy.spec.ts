//backend/src/auth/strategies/jwt.strategy.spec.ts
import { JwtStrategy } from './jwt.strategy';
import { clearAuthCaches, getCachedIdentity } from '../auth-cache';

describe('JwtStrategy', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  const activeClient = {
    id: 'u-1',
    email: 'c@x',
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfile: { id: 'c-1', isActive: true },
    supervisorProfile: null,
  };

  beforeEach(() => {
    clearAuthCaches();
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy({ get: () => 'secret-de-test' } as any, prisma as any);
  });

  it("construit l'identite depuis la BASE (role/profils), pas depuis le contenu du token", async () => {
    prisma.user.findUnique.mockResolvedValue(activeClient);

    const user = await strategy.validate({ sub: 'u-1', email: 'forge@x', role: 'SUPERADMIN' });

    expect(user).toMatchObject({ userId: 'u-1', email: 'c@x', role: 'CLIENT', clientProfileId: 'c-1', tenantClientId: 'c-1' });
  });

  it('un superviseur herite du client auquel il est rattache (tenantClientId)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-2',
      email: 's@x',
      role: 'SUPERVISOR',
      status: 'ACTIVE',
      clientProfile: null,
      supervisorProfile: { id: 's-1', clientId: 'c-9', client: { isActive: true } },
    });

    const user = await strategy.validate({ sub: 'u-2', email: '', role: 'SUPERVISOR' });

    expect(user).toMatchObject({ supervisorProfileId: 's-1', tenantClientId: 'c-9' });
  });

  it.each(['INVITED', 'SUSPENDED', 'DISABLED'])('refuse (401) un compte au statut %s', async (status) => {
    prisma.user.findUnique.mockResolvedValue({ ...activeClient, status });

    await expect(strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('refuse un client suspendu et les superviseurs de ce client', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...activeClient, clientProfile: { id: 'c-1', isActive: false } });
    await expect(strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });

    prisma.user.findUnique.mockResolvedValue({
      id: 'u-2',
      email: 's@x',
      role: 'SUPERVISOR',
      status: 'ACTIVE',
      clientProfile: null,
      supervisorProfile: { id: 's-1', clientId: 'c-1', client: { isActive: false } },
    });
    await expect(strategy.validate({ sub: 'u-2', email: '', role: 'SUPERVISOR' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('refuse un compte supprime ou un token sans sujet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'inconnu', email: '', role: 'CLIENT' })).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
    await expect(strategy.validate({} as any)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(strategy.validate({ sub: 42 } as any)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it("met l'identite en cache (une seule lecture en base pour deux appels)", async () => {
    prisma.user.findUnique.mockResolvedValue(activeClient);

    await strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' });
    await strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(getCachedIdentity('u-1')).toBeDefined();
  });

  it("ne met PAS en cache un refus (la reactivation d'un compte est prise en compte immediatement)", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...activeClient, status: 'SUSPENDED' }).mockResolvedValueOnce(activeClient);

    await expect(strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' })).rejects.toBeDefined();
    await expect(strategy.validate({ sub: 'u-1', email: '', role: 'CLIENT' })).resolves.toBeDefined();
  });
});
