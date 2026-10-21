//backend/src/auth/account-status.util.ts
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * Selection Prisma minimale pour decider si un compte peut s'authentifier ET
 * pour construire l'identite (AuthenticatedUser). Partagee par le login, le
 * refresh et la strategie JWT afin que les trois appliquent EXACTEMENT les
 * memes regles.
 */
export const accountSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  clientProfile: { select: { id: true, isActive: true } },
  supervisorProfile: { select: { id: true, clientId: true, client: { select: { isActive: true } } } },
} satisfies Prisma.UserSelect;

export type AccountRecord = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

/**
 * Un compte est utilisable si :
 *  - son statut est ACTIVE (ni INVITED, ni SUSPENDED, ni DISABLED) ;
 *  - un CLIENT n'est pas suspendu (clientProfile.isActive) ;
 *  - un SUPERVISEUR appartient a un client non suspendu (la suspension d'un
 *    client coupait avant l'acces du client mais pas celui de ses superviseurs).
 */
export function isAccountUsable(account: AccountRecord): boolean {
  if (account.status !== 'ACTIVE') return false;
  if (account.role === 'CLIENT') {
    return !!account.clientProfile && account.clientProfile.isActive;
  }
  if (account.role === 'SUPERVISOR') {
    return !!account.supervisorProfile && account.supervisorProfile.client.isActive;
  }
  return account.role === 'SUPERADMIN';
}

/** Construit l'identite injectee dans request.user a partir de la base (source de verite). */
export function toAuthenticatedUser(account: AccountRecord): AuthenticatedUser {
  return {
    userId: account.id,
    email: account.email,
    role: account.role,
    clientProfileId: account.clientProfile?.id,
    supervisorProfileId: account.supervisorProfile?.id,
    // Identifiant du "locataire" (client proprietaire des donnees) : le client lui-meme,
    // ou le client auquel le superviseur est rattache. Absent pour le superadmin.
    tenantClientId: account.clientProfile?.id ?? account.supervisorProfile?.clientId,
  };
}
