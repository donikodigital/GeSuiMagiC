//backend/src/common/utils/user-names.util.ts
import { PrismaService, TxClient } from '../../prisma/prisma.service';

/** Noms affichables d'utilisateurs (prenom + nom du profil ; « Administrateur » pour le superadmin). */
export async function loadUserNames(client: PrismaService | TxClient, userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const users = await client.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      role: true,
      email: true,
      clientProfile: { select: { firstName: true, lastName: true } },
      supervisorProfile: { select: { firstName: true, lastName: true } },
    },
  });
  for (const user of users) {
    const profile = user.clientProfile ?? user.supervisorProfile;
    names.set(user.id, profile ? `${profile.firstName} ${profile.lastName}`.trim() : user.role === 'SUPERADMIN' ? 'Administrateur' : user.email);
  }
  return names;
}
