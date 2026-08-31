// ============================================================================
// client-dashboard.tsx - v2.3
// Refonte visuelle de la carte "Vos chantiers" (grille sous le hero) :
// - Icone HardHat + nom/localisation regroupes en en-tete au lieu d'un
//   simple texte, badge de statut aligne a droite.
// - Bandeau de couleur en haut de carte reprenant le ton du statut
//   (moss/safety/clay/blueprint/ink), pour un reperage visuel rapide sans
//   avoir a lire le badge.
// - Bloc "Solde disponible" sur fond distinct (bg-paper) pour le faire
//   ressortir au lieu de rester une simple ligne de texte parmi d'autres.
// - "Voir le detail" devient un vrai pied de carte cliquable (bordure +
//   fond au survol) plutot qu'un lien discret en fin de contenu.
// Aucun changement de logique/donnees : memes calculs de balance/usedPct,
// meme structure de grille, memes props envoyees a DashboardHero.
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, HardHat, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import { DashboardHero } from './dashboard-hero';

const STATUS_BAR_GRADIENT: Record<string, string> = {
  moss: 'from-moss-500 to-moss-300',
  safety: 'from-safety-500 to-safety-300',
  clay: 'from-clay-500 to-clay-300',
  ink: 'from-ink-400 to-ink-200',
  blueprint: 'from-blueprint-500 to-blueprint-300',
};

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
            ? 'Selectionnez un chantier pour voir son solde en détail.'
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
                { label: 'Total versé', value: formatMoney(selectedProject.wallet?.totalDeposited ?? '0', currency), tone: 'positive' },
                { label: 'Total depensé', value: formatMoney(selectedProject.wallet?.totalSpent ?? '0', currency) },
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
            description="Créez votre premier projet pour commencer à suivre son financement."
            action={
              <Link href="/projects/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Créer un projet
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
              const statusTone = projectStatusMeta[project.status].tone;

              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="group block h-full">
                  <Card className="flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className={`h-1 w-full bg-gradient-to-r ${STATUS_BAR_GRADIENT[statusTone] ?? STATUS_BAR_GRADIENT.blueprint}`} />

                    <CardContent className="flex-1 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
                            <HardHat className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-display text-base font-semibold text-ink-900">{project.name}</p>
                            <p className="truncate text-xs text-ink-400">
                              {[project.city, project.country].filter(Boolean).join(', ') || 'Localisation non renseignée'}
                            </p>
                          </div>
                        </div>
                        <StatusBadge label={projectStatusMeta[project.status].label} tone={statusTone} className="shrink-0" />
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-500">
                          <span>Dépense</span>
                          <span className="font-medium">{usedPct.toFixed(0)}% du budget</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-concrete-light">
                          <div
                            className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-clay' : usedPct > 70 ? 'bg-safety-400' : 'bg-moss'}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                        <span className="text-xs text-ink-400">Solde disponible</span>
                        <span className={`font-ledger text-base font-bold ${balance < 0 ? 'text-clay-600' : 'text-ink-900'}`}>
                          {formatMoney(balance, project.currency)}
                        </span>
                      </div>
                    </CardContent>

                    <div className="flex items-center justify-between border-t border-concrete px-5 py-3 text-sm font-medium text-blueprint-600 transition-colors group-hover:bg-blueprint-50/60">
                      Voir le détail
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
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