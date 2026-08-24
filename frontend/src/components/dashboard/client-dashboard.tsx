//frontend/src/components/dashboard/client-dashboard.tsx
// ============================================================================
// client-dashboard.tsx - v2.0
// Le DashboardHero remplace les 4 StatCard du haut : le solde disponible
// consolide devient la valeur "grand format" (avec oeil pour le masquer),
// budget/verse/depense passent en puces secondaires. Cartes chantiers
// affinees (hover, coins plus arrondis) mais logique inchangee.
// ============================================================================

'use client';

import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import { DashboardHero } from './dashboard-hero';

export function ClientDashboard() {
  const { data, isLoading, isError } = useProjects({ limit: 100 });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger vos projets." />;

  const projects = data?.items ?? [];
  const totals = projects.reduce(
    (acc, p) => {
      acc.budget += parseFloat(p.budget);
      acc.deposited += parseFloat(p.wallet?.totalDeposited ?? '0');
      acc.spent += parseFloat(p.wallet?.totalSpent ?? '0');
      acc.balance += parseFloat(p.wallet?.balance ?? '0');
      return acc;
    },
    { budget: 0, deposited: 0, spent: 0, balance: 0 },
  );
  const currency = projects[0]?.currency ?? 'GNF';

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <DashboardHero
        eyebrow="Tableau de bord · Client"
        title="Vos chantiers en un coup d'oeil"
        subtitle="Solde consolide sur l'ensemble de vos projets."
        primaryLabel="Solde disponible"
        primaryValue={formatMoney(totals.balance, currency)}
        primaryTone={totals.balance < 0 ? 'negative' : 'default'}
        maskable
        stats={[
          { label: 'Budget total', value: formatMoney(totals.budget, currency) },
          { label: 'Total verse', value: formatMoney(totals.deposited, currency), tone: 'positive' },
          { label: 'Total depense', value: formatMoney(totals.spent, currency) },
        ]}
        actions={[{ label: 'Nouveau projet', href: '/projects/new', icon: Plus }]}
      />

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-900">Vos chantiers</h2>

        {projects.length === 0 ? (
          <EmptyState
            title="Aucun chantier pour le moment"
            description="Creez votre premier projet pour commencer a suivre son financement."
            action={
              <Link href="/projects/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Creer un projet
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const balance = parseFloat(project.wallet?.balance ?? '0');
              const budget = parseFloat(project.budget);
              const usedPct = budget > 0 ? Math.min(100, (parseFloat(project.wallet?.totalSpent ?? '0') / budget) * 100) : 0;
              return (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="h-full rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-base font-semibold text-ink-900">{project.name}</p>
                          <p className="text-xs text-ink-400">{[project.city, project.country].filter(Boolean).join(', ') || 'Localisation non renseignee'}</p>
                        </div>
                        <StatusBadge label={projectStatusMeta[project.status].label} tone={projectStatusMeta[project.status].tone} />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-ink-400">
                          <span>Depense</span>
                          <span>{usedPct.toFixed(0)}% du budget</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-concrete-light">
                          <div
                            className={`h-full rounded-full ${usedPct > 90 ? 'bg-clay' : usedPct > 70 ? 'bg-safety-400' : 'bg-moss'}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-ink-400">Solde disponible</span>
                        <span className={`font-ledger text-sm font-semibold ${balance < 0 ? 'text-clay-600' : 'text-ink-900'}`}>
                          {formatMoney(balance, project.currency)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 pt-1 text-xs font-medium text-blueprint-600">
                        Voir le detail <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}