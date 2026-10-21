//backend/src/auth/auth-cache.ts
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * Petit cache memoire (par processus) utilise par l'authentification.
 *
 * 1) Cache d'identite : JwtStrategy relit l'utilisateur en base pour verifier
 *    qu'il est toujours ACTIVE (suspension, desactivation...) ; on garde le
 *    resultat quelques secondes pour ne pas ajouter une requete SQL a CHAQUE
 *    appel API. Toute action qui change l'etat d'un compte (suspension,
 *    reset de mot de passe, deconnexion...) appelle `invalidateIdentity`,
 *    et le TTL borne de toute facon le retard (y compris multi-instances).
 *
 * 2) Cache de rotation du refresh token : si le meme refresh token est
 *    presente deux fois en quelques secondes (double clic, deux onglets,
 *    nouvelle tentative reseau), on renvoie la MEME paire de tokens au lieu de
 *    traiter la 2e requete comme un vol de token (ce qui deconnectait
 *    l'utilisateur).
 *
 * 3) Verrou par utilisateur : serialise les rotations concurrentes du meme
 *    utilisateur dans ce processus.
 */

export const IDENTITY_TTL_MS = 15_000;
export const ROTATION_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

interface IdentityEntry {
  expiresAt: number;
  user: AuthenticatedUser;
}

export interface RotationPair {
  accessToken: string;
  refreshToken: string;
}

interface RotationEntry {
  expiresAt: number;
  userId: string;
  pair: RotationPair;
}

const identities = new Map<string, IdentityEntry>();
const rotations = new Map<string, RotationEntry>();
const locks = new Map<string, Promise<unknown>>();

function trim<V>(map: Map<string, V>) {
  while (map.size >= MAX_ENTRIES) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}

// ---------------------------------------------------------------- identite

export function getCachedIdentity(userId: string, now = Date.now()): AuthenticatedUser | undefined {
  const entry = identities.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    identities.delete(userId);
    return undefined;
  }
  return entry.user;
}

export function setCachedIdentity(user: AuthenticatedUser, now = Date.now()): void {
  trim(identities);
  identities.set(user.userId, { user, expiresAt: now + IDENTITY_TTL_MS });
}

/** A appeler des qu'un compte change d'etat (suspension, mot de passe, role...). */
export function invalidateIdentity(...userIds: Array<string | null | undefined>): void {
  for (const id of userIds) {
    if (id) identities.delete(id);
  }
}

/** Invalide tous les comptes d'un client (lui + ses superviseurs) : appele lors d'une suspension. */
export function invalidateIdentitiesWhere(predicate: (user: AuthenticatedUser) => boolean): void {
  for (const [id, entry] of identities) {
    if (predicate(entry.user)) identities.delete(id);
  }
}

// ---------------------------------------------------------------- rotation

export function getRecentRotation(tokenKey: string, userId: string, now = Date.now()): RotationPair | undefined {
  const entry = rotations.get(tokenKey);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    rotations.delete(tokenKey);
    return undefined;
  }
  return entry.userId === userId ? entry.pair : undefined;
}

export function rememberRotation(tokenKey: string, userId: string, pair: RotationPair, now = Date.now()): void {
  trim(rotations);
  rotations.set(tokenKey, { userId, pair, expiresAt: now + ROTATION_TTL_MS });
}

// ------------------------------------------------------------------ verrou

export async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

/** Reinitialise les caches (tests). */
export function clearAuthCaches(): void {
  identities.clear();
  rotations.clear();
  locks.clear();
}
