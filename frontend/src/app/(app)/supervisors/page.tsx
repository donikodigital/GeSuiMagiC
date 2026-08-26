// frontend/src/app/(app)/supervisors/page.tsx
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { supervisorsService } from '@/services/supervisors.service';
import { PageHeader } from '@/components/shared/page-header';
import { SupervisorCard } from '@/components/supervisors/supervisor-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { CreateSupervisorDialog } from '@/components/supervisors/create-supervisor-dialog';
import { RequireRole } from '@/components/shared/require-role';

function SupervisorsPageContent() {
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisors', page, search],
    queryFn: () => supervisorsService.list(page, 20, search || undefined),
  });

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
          <Input
            placeholder="Rechercher..."
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
        <ErrorState message="Impossible de charger les superviseurs." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Aucun superviseur" description="Creez votre premier superviseur pour lui confier un chantier." />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((supervisor) => (
              <SupervisorCard key={supervisor.id} supervisor={supervisor} />
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