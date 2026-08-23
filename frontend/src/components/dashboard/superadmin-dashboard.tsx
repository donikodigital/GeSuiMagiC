'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { useProjects } from '@/hooks/use-projects';
import { StatCard } from '@/components/ui/stat-card';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import type { ProjectStatus } from '@/types/models';

export function SuperadminDashboard() {
  const clientsQuery = useQuery({ queryKey: ['clients', 'dashboard'], queryFn: () => clientsService.list(1, 1) });
  const projectsQuery = useProjects({ limit: 100 });

  if (clientsQuery.isLoading || projectsQuery.isLoading) return <PageSpinner />;
  if (clientsQuery.isError || projectsQuery.isError) return <ErrorState message="Impossible de charger les indicateurs globaux." />;

  const projects = projectsQuery.data?.items ?? [];
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalVolume = projects.reduce((sum, p) => sum + parseFloat(p.wallet?.totalDeposited ?? '0'), 0);

  const statusCounts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clients" value={String(clientsQuery.data?.meta.total ?? 0)} />
        <StatCard label="Projets" value={String(projectsQuery.data?.meta.total ?? 0)} />
        <StatCard label="Projets actifs" value={String(activeCount)} tone="moss" />
        <StatCard label="Volume total verse" value={formatMoney(totalVolume, 'GNF')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(statusCounts) as ProjectStatus[]).map((status) => (
          <div key={status} className="flex items-center justify-between rounded-card border border-concrete bg-white px-4 py-3">
            <StatusBadge label={projectStatusMeta[status].label} tone={projectStatusMeta[status].tone} />
            <span className="font-ledger text-sm font-semibold text-ink-900">{statusCounts[status]}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">Projets recents</h2>
          <Link href="/projects" className="flex items-center gap-1 text-sm font-medium text-blueprint-600 hover:underline">
            Voir tout <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-card border border-concrete bg-white">
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
              {projects.slice(0, 8).map((p) => (
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
      </div>
    </div>
  );
}
