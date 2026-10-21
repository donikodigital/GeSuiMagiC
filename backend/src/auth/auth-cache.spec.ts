//backend/src/auth/auth-cache.spec.ts
import {
  IDENTITY_TTL_MS,
  ROTATION_TTL_MS,
  clearAuthCaches,
  getCachedIdentity,
  getRecentRotation,
  invalidateIdentitiesWhere,
  invalidateIdentity,
  rememberRotation,
  setCachedIdentity,
  withUserLock,
} from './auth-cache';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const user = (id: string, tenant?: string): AuthenticatedUser => ({ userId: id, email: `${id}@x`, role: 'CLIENT', clientProfileId: tenant, tenantClientId: tenant });

describe('auth-cache', () => {
  beforeEach(() => clearAuthCaches());

  describe('cache d\'identite', () => {
    it('renvoie l\'identite pendant le TTL puis plus rien', () => {
      setCachedIdentity(user('u1'), 1_000);

      expect(getCachedIdentity('u1', 1_000 + IDENTITY_TTL_MS - 1)).toBeDefined();
      expect(getCachedIdentity('u1', 1_000 + IDENTITY_TTL_MS)).toBeUndefined();
    });

    it('invalidateIdentity retire immediatement un ou plusieurs comptes (suspension...)', () => {
      setCachedIdentity(user('u1'));
      setCachedIdentity(user('u2'));

      invalidateIdentity('u1', undefined, null);

      expect(getCachedIdentity('u1')).toBeUndefined();
      expect(getCachedIdentity('u2')).toBeDefined();
    });

    it("invalidateIdentitiesWhere retire tous les comptes d'un client", () => {
      setCachedIdentity(user('u1', 'c-1'));
      setCachedIdentity(user('u2', 'c-1'));
      setCachedIdentity(user('u3', 'c-2'));

      invalidateIdentitiesWhere((u) => u.tenantClientId === 'c-1');

      expect(getCachedIdentity('u1')).toBeUndefined();
      expect(getCachedIdentity('u2')).toBeUndefined();
      expect(getCachedIdentity('u3')).toBeDefined();
    });
  });

  describe('rotation du refresh token', () => {
    const pair = { accessToken: 'a', refreshToken: 'r' };

    it('rejoue la meme paire pour le meme utilisateur pendant la fenetre', () => {
      rememberRotation('k', 'u1', pair, 1_000);

      expect(getRecentRotation('k', 'u1', 1_000 + ROTATION_TTL_MS - 1)).toEqual(pair);
      expect(getRecentRotation('k', 'u1', 1_000 + ROTATION_TTL_MS)).toBeUndefined();
    });

    it('ne rejoue JAMAIS la paire pour un autre utilisateur', () => {
      rememberRotation('k', 'u1', pair);

      expect(getRecentRotation('k', 'u2')).toBeUndefined();
    });
  });

  describe('withUserLock', () => {
    it('serialise les executions concurrentes du meme utilisateur', async () => {
      const order: string[] = [];
      const slow = withUserLock('u1', async () => {
        order.push('debut-1');
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push('fin-1');
      });
      const fast = withUserLock('u1', async () => {
        order.push('debut-2');
        order.push('fin-2');
      });

      await Promise.all([slow, fast]);

      expect(order).toEqual(['debut-1', 'fin-1', 'debut-2', 'fin-2']);
    });

    it('ne bloque pas les autres utilisateurs et survit a une erreur', async () => {
      await expect(withUserLock('u1', async () => { throw new Error('x'); })).rejects.toThrow('x');
      await expect(withUserLock('u1', async () => 'ok')).resolves.toBe('ok');
      await expect(withUserLock('u2', async () => 'autre')).resolves.toBe('autre');
    });
  });
});
