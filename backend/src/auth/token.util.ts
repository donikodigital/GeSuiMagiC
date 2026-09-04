//backend/src/auth/token.util.ts
import { randomBytes, createHash } from 'crypto';

/**
 * Genere un token securise a usage unique (invitation, reset de mot de
 * passe). Seul le HASH est stocke en base ; le token en clair n'est jamais
 * persiste (il n'existe que dans l'email envoye au destinataire), evitant
 * qu'une fuite de la base de donnees permette de rejouer un lien.
 */
export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
