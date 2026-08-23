'use client';

import Link from 'next/link';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';

export function SupervisorDashboard() {
  const { data, isLoading, isError } = useProjects({ limit: 100 });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger vos projets." />;

  const projects = data?.items ?? [];

  if (projects.length === 0) {
    return <EmptyState title="Aucun chantier affecte" description="Le client n'a pas encore affecte de projet a votre compte." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold text-ink-900">Vos chantiers affectes</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="flex h-full flex-col justify-between">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-base font-semibold text-ink-900">{project.name}</p>
                <StatusBadge label={projectStatusMeta[project.status].label} tone={projectStatusMeta[project.status].tone} />
              </div>
              <p className="text-xs text-ink-400">{[project.location, project.city].filter(Boolean).join(', ') || 'Localisation non renseignee'}</p>
              <div className="flex items-center justify-between border-t border-concrete pt-3">
                <span className="text-xs text-ink-400">Solde disponible</span>
                <span className="font-ledger text-sm font-semibold text-ink-900">{formatMoney(project.wallet?.balance ?? 0, project.currency)}</span>
              </div>
            </CardContent>
            <div className="flex gap-2 border-t border-concrete px-5 py-3">
              <Link href={`/projects/${project.id}/expenses/new`} className="flex-1">
                <Button size="sm" className="w-full">
                  <ReceiptText className="h-4 w-4" /> Enregistrer une depense
                </Button>
              </Link>
              <Link href={`/projects/${project.id}`}>
                <Button size="sm" variant="outline">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
