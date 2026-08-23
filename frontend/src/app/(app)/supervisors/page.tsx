'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { supervisorsService } from '@/services/supervisors.service';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { userStatusMeta, formatRelative } from '@/lib/format';
import { CreateSupervisorDialog } from '@/components/supervisors/create-supervisor-dialog';
import type { SupervisorProfile } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

function SupervisorsPageContent() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisors', page, search],
    queryFn: () => supervisorsService.list(page, 20, search || undefined),
  });

  const columns = React.useMemo<ColumnDef<SupervisorProfile, any>[]>(
    () => [
      {
        header: 'Superviseur',
        id: 'name',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink-900">
              {row.original.firstName} {row.original.lastName}
            </p>
            <p className="text-xs text-ink-400">{row.original.user?.email}</p>
          </div>
        ),
      },
      { header: 'Telephone', accessorKey: 'phone', cell: ({ row }) => row.original.phone || '-' },
      {
        header: 'Projets affectes',
        id: 'projects',
        cell: ({ row }) => row.original.projectAssignments?.map((a) => a.project.name).join(', ') || '-',
      },
      {
        header: 'Statut',
        id: 'status',
        cell: ({ row }) =>
          row.original.user ? <StatusBadge label={userStatusMeta[row.original.user.status].label} tone={userStatusMeta[row.original.user.status].tone} /> : '-',
      },
      {
        header: 'Derniere connexion',
        id: 'lastLogin',
        cell: ({ row }) => (row.original.user?.lastLoginAt ? formatRelative(row.original.user.lastLoginAt) : 'Jamais'),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Superviseurs"
        description="Personnes chargees de recevoir et d'utiliser les fonds sur vos chantiers."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau superviseur
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les superviseurs." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucun superviseur"
          emptyDescription="Creez votre premier superviseur pour lui confier un chantier."
          onRowClick={(row) => router.push(`/supervisors/${row.id}`)}
          meta={data?.meta}
          onPageChange={setPage}
        />
      )}

      <CreateSupervisorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

export default function SupervisorsPage() {
  return (
    <RequireRole roles={['CLIENT', 'SUPERADMIN']}>
      <SupervisorsPageContent />
    </RequireRole>
  );
}
