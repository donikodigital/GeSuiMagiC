// ============================================================================
// components/layout/topbar.tsx - v1.2
// Ajout d'une section contextuelle "Chantier en cours" dans le tiroir mobile
// : Documents, Superviseurs, Anomalies, Reglages du projet actuellement
// consulte (avant, uniquement accessibles via la barre d'onglets horizontale
// de project-detail-layout.tsx, qui engorgeait l'espace sur mobile).
//
// - Visible uniquement quand l'URL courante est /projects/[id]/... (detecte
//   via useParams - fonctionne meme si Topbar vit au-dessus du segment [id]).
// - Meme gating par role que project-detail-layout.tsx : Documents pour
//   tous, Superviseurs et Reglages pour Client/Superadmin, Anomalies pour
//   Client uniquement.
// - Inseree juste apres "Superviseurs" pour le Client (qui a deja ce libelle
//   au niveau global), sinon juste apres "Projets"/"Mes projets".
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { Bell, FileText, HardHatIcon, LogOut, Menu, Settings2, ShieldAlert, Users, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useNavItems } from '@/hooks/use-nav-items';
import { notificationsService } from '@/services/notifications.service';
import { NotificationsPanel } from './notifications-panel';

export function Topbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const { user, logout, isClient, isSuperadmin } = useAuth();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const items = useNavItems();
  const notifRef = React.useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsService.list(1, 5),
    refetchInterval: 60_000,
  });
  const unreadCount = data?.items.filter((n) => !n.isRead).length ?? 0;

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

  // Fermeture au clic/tap en dehors du panneau de notifications.
  React.useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [notifOpen]);

  // Fermeture a la touche Echap, pour le panneau notif ou le tiroir mobile.
  React.useEffect(() => {
    if (!notifOpen && !mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [notifOpen, mobileOpen]);

  // Fermeture automatique au changement de page.
  React.useEffect(() => {
    setNotifOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Bloque le scroll du body tant qu'un panneau/tiroir est ouvert.
  React.useEffect(() => {
    document.body.style.overflow = notifOpen || mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [notifOpen, mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-concrete bg-white/90 px-4 backdrop-blur lg:px-6">
        <div className="flex items-center gap-3 lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="rounded-md p-2 text-ink-600 hover:bg-concrete-light">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 text-safety-400">
              <HardHatIcon className="h-4 w-4" />
            </div>
            <span className="font-display text-sm font-semibold text-ink-900">Suivi de Chantier</span>
          </div>
        </div>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notifications"
              aria-expanded={notifOpen}
              className="relative rounded-md p-2 text-ink-600 hover:bg-concrete-light"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rebar px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
          </div>

          <button
            onClick={logout}
            className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-concrete-light lg:flex"
          >
            <LogOut className="h-4 w-4" /> Deconnexion
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-ink-950/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-ink-900 text-white">
            <div className="flex h-16 items-center justify-between border-b border-ink-800 px-4">
              <span className="font-display text-base font-semibold">Suivi de Chantier</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Fermer" className="rounded-md p-1.5 hover:bg-ink-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 px-3 py-4">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                        active ? 'bg-blueprint-700/60 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white',
                      )}
                    >
                      <Icon className="h-5 w-5" />
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
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                'flex items-center gap-3 rounded-md py-2 pl-8 pr-3 text-sm font-medium',
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
              <button onClick={logout} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-safety-400">
                <LogOut className="h-4 w-4" /> Deconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}