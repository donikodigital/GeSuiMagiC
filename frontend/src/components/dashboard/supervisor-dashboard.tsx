// frontend/src/components/dashboard/supervisor-dashboard.tsx - v2.5
// Ajout d'une carte "respirante" cliquable entre le hero et "Detail par
// chantier" (agregeant les depots en attente sur tous les chantiers du
// superviseur via useSupervisorPendingDeposits) - jusqu'ici il fallait
// naviguer manuellement vers l'onglet Depots d'un projet pour valider.
// - 1 seul depot en attente -> clic ouvre directement PendingDepositActionDialog.
// - Plusieurs -> clic ouvre une liste (DepositCard) pour choisir lequel traiter.
// - 0 -> carte non affichee (pas d'encombrement inutile).
// Reste du fichier (hero, grille "Detail par chantier") inchange.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Clock, HardHat, ReceiptText } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useSupervisorPendingDeposits } from '@/hooks/use-supervisor-pending-deposits';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { DepositCard } from '@/components/deposits/deposit-card';
import { PendingDepositActionDialog } from '@/components/deposits/pending-deposit-action-dialog';
import { formatMoney, projectStatusMeta } from '@/lib/format';
import { DashboardHero } from './dashboard-hero';
import type { Deposit } from '@/types/models';

const STATUS_BAR_GRADIENT: Record<string, string> = {
  moss: 'from-moss-500 to-moss-300',
  safety: 'from-safety-500 to-safety-300',
  clay: 'from-clay-500 to-clay-300',
  ink: 'from-ink-400 to-ink-200',
  blueprint: 'from-blueprint-500 to-blueprint-300',
};

export function SupervisorDashboard() {
  const { data, isLoading, isError } = useProjects({ limit: 100 });
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | undefined>(undefined);
  const [selectedDeposit, setSelectedDeposit] = React.useState<Deposit | null>(null);
  const [showPendingList, setShowPendingList] = React.useState(false);

  const projects = data?.items ?? [];
  const pending = useSupervisorPendingDeposits(projects);

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger vos projets." />;

  if (projects.length === 0) {
    return <EmptyState title="Aucun chantier affecté" description="Le client n'a pas encore affecté de projet à votre compte." />;
  }

  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const currency = selectedProject.currency ?? 'GNF';
  const balance = parseFloat(selectedProject.wallet?.balance ?? '0');

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <DashboardHero
        eyebrow="Tableau de bord · Superviseur"
        title="Vos chantiers affectés"
        subtitle={
          projects.length > 1
            ? 'Selectionnez un chantier pour voir son solde en détail.'
            : "Enregistrez les dépenses au fil de l'avancement des travaux."
        }
        primaryLabel="Solde disponible"
        primaryValue={formatMoney(balance, currency)}
        primaryNumericValue={balance}
        dynamicBalanceColor
        maskable
        projectSelector={{
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
          selectedId: selectedProject.id,
          onSelect: setSelectedProjectId,
        }}
        stats={[
          { label: 'Chantiers affectés', value: String(projects.length) },
          { label: 'Chantiers actifs', value: String(activeCount), tone: 'positive' },
        ]}
      />

      {!pending.isLoading && pending.totalCount > 0 && (
        <button
          type="button"
          onClick={() => {
            if (pending.totalCount === 1) setSelectedDeposit(pending.items[0]);
            else setShowPendingList(true);
          }}
          className="group flex w-full items-center gap-4 rounded-2xl border border-safety-200 bg-safety-50 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-safety-100 text-safety-600">
            <Clock className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold text-ink-900">
              {pending.totalCount} dépôt{pending.totalCount > 1 ? 's' : ''} en attente de validation
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              Total : <span className="font-ledger font-semibold text-ink-800">{formatMoney(pending.totalAmount, pending.currency)}</span>
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-900">Détail par chantier</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const statusTone = projectStatusMeta[project.status].tone;
            return (
              <Card key={project.id} className="flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:shadow-md">
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
                          {[project.location, project.city].filter(Boolean).join(', ') || 'Localisation non renseignée'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge label={projectStatusMeta[project.status].label} tone={statusTone} className="shrink-0" />
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                    <span className="text-xs text-ink-400">Solde disponible</span>
                    <span className="font-ledger text-base font-bold text-ink-900">{formatMoney(project.wallet?.balance ?? 0, project.currency)}</span>
                  </div>
                </CardContent>

                <div className="flex gap-2 border-t border-concrete px-5 py-3">
                  <Link href={`/projects/${project.id}/expenses/new`} className="flex-1">
                    <Button size="sm" className="w-full">
                      <ReceiptText className="h-4 w-4" /> Enregistrer une dépense
                    </Button>
                  </Link>
                  <Link href={`/projects/${project.id}`}>
                    <Button size="sm" variant="outline">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {selectedDeposit && (
        <PendingDepositActionDialog
          deposit={selectedDeposit}
          projectName={pending.projectNameById.get(selectedDeposit.projectId)}
          onClose={() => setSelectedDeposit(null)}
        />
      )}

      {showPendingList && (
        <Dialog open onClose={() => setShowPendingList(false)} title="Dépôts en attente" description="Selectionnez un dépôt pour le valider ou le refuser.">
          <div className="space-y-3">
            {pending.items.map((d) => (
              <DepositCard
                key={d.id}
                deposit={d}
                onClick={() => {
                  setShowPendingList(false);
                  setSelectedDeposit(d);
                }}
              />
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}