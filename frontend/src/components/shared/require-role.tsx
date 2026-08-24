//frontend/src/components/shared/require-role.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { UserRole } from '@/types/models';

/**
 * Protege une page cote client en fonction du role. La securite reelle
 * reste appliquee par le backend (@Roles) - ce garde n'est qu'un confort
 * d'UX pour eviter un ecran d'erreur brut si quelqu'un navigue vers une
 * URL que son role ne peut pas utiliser (ex: /clients pour un superviseur).
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) return null;

  if (!roles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-concrete-dark px-6 py-16 text-center">
        <div className="rounded-full bg-concrete-light p-3 text-ink-400">
          <ShieldOff className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-ink-800">Acces non autorise</p>
          <p className="mt-1 max-w-sm text-sm text-ink-500">Votre role ne permet pas d&apos;acceder a cette page.</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-sm font-medium text-blueprint-600 hover:underline">
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
