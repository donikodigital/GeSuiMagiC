// ============================================================================
// components/layout/sidebar.tsx - v1.2
// Ajout de la section contextuelle "Chantier en cours" (Documents,
// Superviseurs, Anomalies, Reglages du projet consulte), identique a celle
// deja presente dans le tiroir mobile de topbar.tsx v1.2 - elle n'existait
// que cote mobile, la sidebar desktop permanente ne l'avait jamais recue,
// rendant "Documents" invisible en dehors des onglets de la fiche projet.
// Meme detection (useParams sur le segment [id]), meme gating par role,
// meme point d'insertion (juste apres l'item dont le href est /supervisors
// ou /projects selon ce qui existe dans la nav de l'utilisateur courant).
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { FileText, HardHatIcon, Settings2, ShieldAlert, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useNavItems } from '@/hooks/use-nav-items';

export function Sidebar() {
  const pathname = usePathname();
  const { user, isClient, isSuperadmin } = useAuth();
  const params = useParams<{ id?: string }>();
  const items = useNavItems();

  const projectId = params?.id;
  const projectContextItems = React.useMemo(() => {
    if (!projectId) return [];
    return [
      { label: 'Documents', href: `/projects/${projectId}/documents`, icon: FileText },
      ...(isClient || isSuperadmin ? [{ label: 'Superviseurs', href: `/projects/${projectId}/supervisors`, icon: Users }] : []),
      ...(isClient ? [{ label: 'Anomalies', href: `/projects/${projectId}/anomalies`, icon: ShieldAlert }] : []),
      ...(isClient || isSuperadmin ? [{ label: 'Reglages', href: `/projects/${projectId}/settings`, icon: Settings2 }] : []),
    ];
  }, [projectId, isClient, isSuperadmin]);

  const insertAfterHref = items.some((i) => i.href === '/supervisors') ? '/supervisors' : '/projects';

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 text-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-ink-800 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-safety-400 text-ink-900">
          <HardHatIcon className="h-4 w-4" />
        </div>
        <span className="font-display text-base font-semibold">Suivi de Chantier</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <React.Fragment key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-blueprint-700/60 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>

              {item.href === insertAfterHref && projectContextItems.length > 0 && (
                <div className="my-1 border-t border-ink-800 pt-2">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Chantier en cours</p>
                  {projectContextItems.map((sub) => {
                    const subActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                    const SubIcon = sub.icon;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md py-2 pl-8 pr-3 text-sm font-medium transition-colors',
                          subActive ? 'bg-blueprint-700/60 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white',
                        )}
                      >
                        <SubIcon className="h-4 w-4" />
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="border-t border-ink-800 px-4 py-4">
        <p className="truncate text-xs text-ink-400">{user?.email}</p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-safety-400">{roleLabel(user?.role)}</p>
      </div>
    </aside>
  );
}

function roleLabel(role?: string) {
  switch (role) {
    case 'SUPERADMIN':
      return 'Superadmin';
    case 'CLIENT':
      return 'Client';
    case 'SUPERVISOR':
      return 'Superviseur';
    default:
      return '';
  }
}