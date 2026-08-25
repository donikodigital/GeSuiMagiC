// ============================================================================
// app/(app)/layout.tsx - v1.2
// Fix deconnexion au refresh : le garde attendait `isAuthenticated` sans
// attendre la rehydratation du store persist (Zustand), donc il redirigeait
// vers /login pendant le court instant ou accessToken/user valaient encore
// null au demarrage, avant meme la lecture du localStorage.
// ============================================================================

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { useAuth } from '@/hooks/use-auth';
import { PageSpinner } from '@/components/ui/misc';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuth();

  React.useEffect(() => {
    // Tant que le store n'a pas fini de relire le localStorage, on ne sait
    // pas encore si l'utilisateur est authentifie : ne rien decider.
    if (!hasHydrated) return;

    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Ecran d'attente tant que l'hydratation n'est pas terminee, ou une fois
  // terminee si l'utilisateur n'est pas authentifie (le temps que la
  // redirection prenne effet).
  if (!hasHydrated || !isAuthenticated) return <PageSpinner />;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}