//frontend/src/app/(app)/clients/page.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { clientsService } from '@/services/clients.service';
import { PageHeader } from '@/components/shared/page-header';
import { ClientCard } from '@/components/clients/client-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { CreateClientDialog } from '@/components/clients/create-client-dialog';
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

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Proprietaires de chantiers gerés sur la plateforme."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau client
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input
            placeholder="Rechercher un client..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les clients." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Aucun client" description="Créez le premier client pour commencer." />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>

          {data?.meta && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-ink-400">
                {data.meta.total} resultat{data.meta.total > 1 ? 's' : ''} - page {data.meta.page} sur {data.meta.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={data.meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
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