'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { userStatusMeta, formatRelative } from '@/lib/format';
import { CreateClientDialog } from '@/components/clients/create-client-dialog';
import type { ClientProfile } from '@/types/models';
import { RequireRole } from '@/components/shared/require-role';

function ClientsPageContent() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: () => clientsService.list(page, 20, search || undefined),
  });

  const columns = React.useMemo<ColumnDef<ClientProfile, any>[]>(
    () => [
      {
        header: 'Client',
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
      { header: 'Ville', accessorKey: 'city', cell: ({ row }) => row.original.city || '-' },
      { header: 'Projets', id: 'projects', cell: ({ row }) => row.original._count?.projects ?? 0 },
      {
        header: 'Statut du compte',
        id: 'status',
        cell: ({ row }) =>
          row.original.user ? (
            <StatusBadge label={userStatusMeta[row.original.user.status].label} tone={userStatusMeta[row.original.user.status].tone} />
          ) : (
            '-'
          ),
      },
      {
        header: 'Derniere connexion',
        id: 'lastLogin',
        cell: ({ row }) => (row.original.user?.lastLoginAt ? formatRelative(row.original.user.lastLoginAt) : 'Jamais'),
      },
      {
        header: '',
        id: 'active',
        cell: ({ row }) => (!row.original.isActive ? <StatusBadge label="Suspendu par l'admin" tone="clay" /> : null),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Proprietaires de chantiers geres sur la plateforme."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau client
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input placeholder="Rechercher un client..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les clients." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucun client"
          emptyDescription="Creez le premier client pour commencer."
          onRowClick={(row) => router.push(`/clients/${row.id}`)}
          meta={data?.meta}
          onPageChange={setPage}
        />
      )}

      <CreateClientDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={(id) => router.push(`/clients/${id}`)} />
    </div>
  );
}

export default function ClientsPage() {
  return (
    <RequireRole roles={['SUPERADMIN']}>
      <ClientsPageContent />
    </RequireRole>
  );
}
