// ============================================================================
// app/(app)/layout.tsx - v1.1
// Fix racine du scroll horizontal mobile : ajout de min-w-0 sur la colonne
// de contenu (flex-1 seul ne suffit pas - un enfant flex garde min-width:
// auto par defaut, donc tout contenu large en profondeur - ici la barre
// d'onglets - pouvait pousser toute la ligne sidebar+contenu au-dela de
// l'ecran). C'etait la cause commune aux deux pages signalees.
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
  const { isAuthenticated } = useAuth();
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else {
      setChecked(true);
    }
  }, [isAuthenticated, router]);

  if (!checked) return <PageSpinner />;

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