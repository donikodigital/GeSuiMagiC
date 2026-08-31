// ============================================================================
// superadmin-dashboard.tsx - v2.1
// - "Repartition par statut" affiche desormais TOUS les statuts possibles
//   (DRAFT, PLANNED, ACTIVE, SUSPENDED, COMPLETED, ARCHIVED), meme a 0,
//   au lieu de ne montrer que les statuts presents dans les donnees. Utilise
//   projectStatusMeta comme source de verite plutot que statusCounts pour
//   ne jamais desynchroniser la liste affichee du modele de statuts reel.
// - Vue mobile "Projets recents" alignee sur le langage visuel de
//   client-dashboard.tsx v2.3 : icone Building2 en en-tete de carte,
//   bandeau de couleur reprenant le ton du statut, bloc "Solde" sur fond
//   distinct, pied de carte "Voir le detail" cliquable au lieu d'un lien
//   discret en bas.
// Aucun changement de logique/donnees (memes requetes, meme calcul de
// totalVolume/activeCount), uniquement visuel.
// ============================================================================

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2 } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { useProjects } from '@/hooks/use-projects';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import type { ProjectStatus } from '@/types/models';
import { DashboardHero } from './dashboard-hero';

const STATUS_BAR_GRADIENT: Record<string, string> = {
  moss: 'from-moss-500 to-moss-300',
  safety: 'from-safety-500 to-safety-300',
  clay: 'from-clay-500 to-clay-300',
  ink: 'from-ink-400 to-ink-200',
  blueprint: 'from-blueprint-500 to-blueprint-300',
};

const ALL_STATUSES = Object.keys(projectStatusMeta) as ProjectStatus[];

export function SuperadminDashboard() {
  const clientsQuery = useQuery({ queryKey: ['clients', 'dashboard'], queryFn: () => clientsService.list(1, 1) });
  const projectsQuery = useProjects({ limit: 100 });

  if (clientsQuery.isLoading || projectsQuery.isLoading) return <PageSpinner />;
  if (clientsQuery.isError || projectsQuery.isError) return <ErrorState message="Impossible de charger les indicateurs globaux." />;

  const projects = projectsQuery.data?.items ?? [];
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalVolume = projects.reduce((sum, p) => sum + parseFloat(p.wallet?.totalDeposited ?? '0'), 0);
  const currency = projects[0]?.currency ?? 'GNF';

  const statusCounts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const recentProjects = projects.slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <DashboardHero
        eyebrow="Tableau de bord · Superadministrateur"
        title="Vue d'ensemble de la plateforme"
        subtitle="Volume, clients et projets sur l'ensemble des chantiers."
        primaryLabel="Volume total versé"
        primaryValue={formatMoney(totalVolume, currency)}
        maskable
        stats={[
          { label: 'Clients', value: String(clientsQuery.data?.meta.total ?? 0) },
          { label: 'Projets', value: String(projectsQuery.data?.meta.total ?? 0) },
          { label: 'Projets actifs', value: String(activeCount), tone: 'positive' },
        ]}
        actions={[{ label: 'Voir tous les projets', href: '/projects', icon: Building2 }]}
      />

      <div>
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">Repartition par statut</h2>
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
          {ALL_STATUSES.map((status) => (
            <div
              key={status}
              className="flex min-w-[9.5rem] flex-shrink-0 items-center justify-between rounded-2xl border border-concrete bg-white px-4 py-3 shadow-sm sm:min-w-0"
            >
              <StatusBadge label={projectStatusMeta[status].label} tone={projectStatusMeta[status].tone} />
              <span className="font-ledger text-sm font-semibold text-ink-900">{statusCounts[status] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">Projets récents</h2>
          <Link href="/projects" className="flex items-center gap-1 text-sm font-medium text-blueprint-600 hover:underline">
            Voir tout <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Vue desktop : tableau */}
        <div className="hidden overflow-hidden rounded-2xl border border-concrete bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-concrete-light/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Projet</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete">
              {recentProjects.map((p) => (
                <tr key={p.id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-ink-900 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {p.client ? `${p.client.firstName} ${p.client.lastName}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={projectStatusMeta[p.status].label} tone={projectStatusMeta[p.status].tone} />
                  </td>
                  <td className="px-4 py-3 text-right font-ledger">{formatMoney(p.wallet?.balance ?? 0, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Vue mobile : cartes */}
        <div className="space-y-3 md:hidden">
          {recentProjects.map((p) => {
            const statusTone = projectStatusMeta[p.status].tone;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="group block">
                <div className="overflow-hidden rounded-2xl border border-concrete bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className={`h-1 w-full bg-gradient-to-r ${STATUS_BAR_GRADIENT[statusTone] ?? STATUS_BAR_GRADIENT.blueprint}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">{p.name}</p>
                          <p className="truncate text-xs text-ink-500">{p.client ? `${p.client.firstName} ${p.client.lastName}` : '-'}</p>
                        </div>
                      </div>
                      <StatusBadge label={projectStatusMeta[p.status].label} tone={statusTone} className="shrink-0" />
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                      <span className="text-xs text-ink-400">Solde</span>
                      <span className="font-ledger text-sm font-semibold text-ink-900">{formatMoney(p.wallet?.balance ?? 0, p.currency)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-concrete px-4 py-2.5 text-sm font-medium text-blueprint-600 transition-colors group-hover:bg-blueprint-50/60">
                    Voir le détail
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}