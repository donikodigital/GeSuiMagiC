// ============================================================================
// client-dashboard.tsx - v2.2
// Le solde/budget/verse/depense du hero refletent desormais UN chantier
// selectionne (via le nouveau projectSelector de dashboard-hero.tsx), pas
// une somme agregee de tous les chantiers - ca contredisait le principe de
// portefeuille independant par chantier annonce partout ailleurs dans
// l'app. Le selecteur n'apparait que si le client a 2 projets ou plus ;
// avec un seul projet, comportement inchange (celui-ci est affiche direct).
// ============================================================================

'use client';

import * as React from 'react';
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
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>(undefined);

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger vos projets." />;

  const projects = data?.items ?? [];
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const currency = selectedProject?.currency ?? 'GNF';
  const balance = parseFloat(selectedProject?.wallet?.balance ?? '0');

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <DashboardHero
        eyebrow="Tableau de bord · Client"
        title="Vos chantiers en un coup d'oeil"
        subtitle={
          projects.length > 1
            ? 'Selectionnez un chantier pour voir son solde en detail.'
            : 'Solde disponible pour ce chantier.'
        }
        primaryLabel="Solde disponible"
        primaryValue={selectedProject ? formatMoney(balance, currency) : formatMoney(0, currency)}
        primaryNumericValue={balance}
        dynamicBalanceColor
        maskable
        projectSelector={
          selectedProject
            ? {
                projects: projects.map((p) => ({ id: p.id, name: p.name })),
                selectedId: selectedProject.id,
                onSelect: setSelectedProjectId,
              }
            : undefined
        }
        stats={
          selectedProject
            ? [
                { label: 'Budget', value: formatMoney(selectedProject.budget, currency) },
                { label: 'Total verse', value: formatMoney(selectedProject.wallet?.totalDeposited ?? '0', currency), tone: 'positive' },
                { label: 'Total depense', value: formatMoney(selectedProject.wallet?.totalSpent ?? '0', currency) },
              ]
            : []
        }
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