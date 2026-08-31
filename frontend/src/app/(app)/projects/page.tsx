// frontend/src/app/(app)/projects/page.tsx - v2.0
'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectListCard } from '@/components/projects/project-list-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';

export default function ProjectsPage() {
  const { isSuperadmin, isSupervisor, isClient } = useAuth();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError } = useProjects({ page, limit: 20, search: search || undefined });

  return (
    <div>
      <PageHeader
        title={isSupervisor ? 'Mes chantiers affectés' : 'Projets'}
        description="Portefeuille financier indépendant par chantier."
        actions={
          isClient && (
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
          <Input
            placeholder="Rechercher un projet..."
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
        <ErrorState message="Impossible de charger les projets." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Aucun projet" description="Créez votre premier chantier pour commencer le suivi financier." />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((project) => (
              <ProjectListCard
                key={project.id}
                project={project}
                showClient={isSuperadmin}
                showStatus={!isSuperadmin}
                showBudget={!isSupervisor}
                showBalance={!isSuperadmin}
              />
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
    </div>
  );
}