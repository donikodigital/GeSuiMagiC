// ============================================================================
// app/(app)/projects/page.tsx - v1.2
// Pour le superadmin uniquement : colonnes Statut et Solde retirees du
// tableau, ne restent visibles que Projet/Client/Budget. Ces informations
// restent accessibles via le clic sur la ligne, qui navigue deja vers la
// page detail du projet (statut + solde y sont affiches dans le bandeau et
// les cartes de resume). Client et superviseur : aucun changement, memes
// colonnes qu'avant (Statut visible pour les deux, Budget masque pour le
// superviseur, Solde visible pour les deux).
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import type { Project } from '@/types/models';

export default function ProjectsPage() {
  const router = useRouter();
  const { isSuperadmin, isSupervisor } = useAuth();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError } = useProjects({ page, limit: 20, search: search || undefined });

  const columns = React.useMemo<ColumnDef<Project, any>[]>(() => {
    const base: ColumnDef<Project, any>[] = [
      {
        header: 'Projet',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink-900">{row.original.name}</p>
            <p className="text-xs text-ink-400">{[row.original.city, row.original.country].filter(Boolean).join(', ') || '-'}</p>
          </div>
        ),
      },
    ];
    if (isSuperadmin) {
      base.push({
        header: 'Client',
        id: 'client',
        cell: ({ row }) => (row.original.client ? `${row.original.client.firstName} ${row.original.client.lastName}` : '-'),
      });
    }
    if (!isSuperadmin) {
      base.push({
        header: 'Statut',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge label={projectStatusMeta[row.original.status].label} tone={projectStatusMeta[row.original.status].tone} />,
      });
    }
    if (!isSupervisor) {
      base.push({
        header: 'Budget',
        id: 'budget',
        cell: ({ row }) => <span className="font-ledger">{formatMoney(row.original.budget, row.original.currency)}</span>,
      });
    }
    if (!isSuperadmin) {
      base.push({
        header: 'Solde',
        id: 'balance',
        cell: ({ row }) => {
          const balance = parseFloat(row.original.wallet?.balance ?? '0');
          return (
            <span className={`font-ledger font-medium ${balance < 0 ? 'text-clay-600' : 'text-ink-900'}`}>
              {formatMoney(balance, row.original.currency)}
            </span>
          );
        },
      });
    }
    return base;
  }, [isSuperadmin, isSupervisor]);

  return (
    <div>
      <PageHeader
        title={isSupervisor ? 'Mes chantiers affectes' : 'Projets'}
        description="Portefeuille financier independant par chantier."
        actions={
          !isSupervisor && (
            <Link href="/projects/new">
              <Button>
                <Plus className="h-4 w-4" /> Nouveau projet
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input placeholder="Rechercher un projet..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les projets." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucun projet"
          emptyDescription="Creez votre premier chantier pour commencer le suivi financier."
          onRowClick={(row) => router.push(`/projects/${row.id}`)}
          meta={data?.meta}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}