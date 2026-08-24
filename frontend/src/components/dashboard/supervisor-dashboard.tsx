//frontend/src/components/dashboard/supervisor-dashboard.tsx
// ============================================================================
// supervisor-dashboard.tsx - v2.0
// Le superviseur ne detient pas de solde propre : le hero met en avant le
// nombre de chantiers affectes (grand format) plutot qu'un montant fictif,
// avec le budget total suivi en puce secondaire. Cartes chantiers inchangees
// dans leur logique, juste alignees visuellement sur le nouveau style.
// ============================================================================

'use client';

import Link from 'next/link';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import { DashboardHero } from './dashboard-hero';

export function SupervisorDashboard() {
  const { data, isLoading, isError } = useProjects({ limit: 100 });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger vos projets." />;

  const projects = data?.items ?? [];

  if (projects.length === 0) {
    return <EmptyState title="Aucun chantier affecte" description="Le client n'a pas encore affecte de projet a votre compte." />;
  }

  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalBudget = projects.reduce((sum, p) => sum + parseFloat(p.budget), 0);
  const currency = projects[0]?.currency ?? 'GNF';

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <DashboardHero
        eyebrow="Tableau de bord · Superviseur"
        title="Vos chantiers affectes"
        subtitle="Enregistrez les depenses au fil de l'avancement des travaux."
        primaryLabel="Chantiers affectes"
        primaryValue={String(projects.length)}
        stats={[
          { label: 'Chantiers actifs', value: String(activeCount), tone: 'positive' },
          { label: 'Budget total suivi', value: formatMoney(totalBudget, currency) },
        ]}
      />

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-900">Detail par chantier</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex h-full flex-col justify-between rounded-2xl transition-all hover:shadow-md">
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
    </div>
  );
}