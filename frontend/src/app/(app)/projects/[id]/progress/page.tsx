//frontend/src/app/(app)/projects/[id]/progress/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { CalendarClock, CircleDollarSign, FileSignature, Gauge, HardHat, Settings2, TriangleAlert } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { usePhases } from '@/hooks/use-attendance';
import { usePhaseCosts, usePlanning, useProgress, useSitePermissions } from '@/hooks/use-site';
import { useAuthStore } from '@/lib/auth-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { ProgressBar } from '@/components/site/progress-bar';
import { Segmented } from '@/components/site/segmented';
import { SectionHeader } from '@/components/site/section-header';
import { PhaseProgressCards, PendingUpdates } from '@/components/site/progress/phase-progress-cards';
import { GanttChart } from '@/components/site/progress/gantt-chart';
import { PhaseCostCards } from '@/components/site/progress/phase-cost-cards';
import { StopReasons } from '@/components/site/progress/stop-reasons';
import { ChangeOrdersSection } from '@/components/site/progress/change-orders-section';
import { PhasesManagerDialog } from '@/components/attendance/phases-manager-dialog';
import { formatDay } from '@/lib/site-format';

type View = 'progress' | 'planning' | 'costs' | 'orders';

export default function ProjectProgressPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { data: project } = useProject(projectId);
  const permissions = useSitePermissions(projectId);
  const userId = useAuthStore((s) => s.user?.id);
  const [view, setView] = React.useState<View>('progress');
  const [phasesOpen, setPhasesOpen] = React.useState(false);

  const progress = useProgress(projectId);
  const planning = usePlanning(projectId);
  const costs = usePhaseCosts(projectId);
  const phasesQuery = usePhases(projectId);

  if (progress.isLoading || planning.isLoading) return <PageSpinner />;
  if (progress.isError || !progress.data) return <ErrorState message="Impossible de charger l'avancement." />;

  const overview = progress.data;
  const plan = planning.data;
  const currency = project?.currency ?? 'GNF';
  const pendingCount = overview.pendingUpdates.length;

  if (overview.phases.length === 0) {
    return (
      <>
        <EmptyState
          icon={<HardHat className="h-6 w-6" />}
          title="Aucune étape définie"
          description="Définissez les étapes du chantier (fondation, murs, toiture...) pour suivre l'avancement, le planning et le coût de chacune."
          action={
            (permissions.owner || permissions.isSiteManager) && (
              <Button onClick={() => setPhasesOpen(true)}>
                <Settings2 className="h-4 w-4" /> Définir les étapes
              </Button>
            )
          }
        />
        <PhasesManagerDialog open={phasesOpen} onClose={() => setPhasesOpen(false)} projectId={projectId} phases={phasesQuery.data ?? []} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Avancement du chantier</p>
            <p className="font-ledger text-4xl font-bold text-ink-900">
              {overview.progressPercent}
              <span className="text-xl font-semibold text-ink-400"> %</span>
            </p>
          </div>
          {plan && (
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Fin prévue</p>
                <p className="font-medium text-ink-800">{formatDay(plan.plannedEndDate)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Fin projetée</p>
                <p className={plan.projectDelayDays > 0 ? 'font-medium text-clay-600' : 'font-medium text-ink-800'}>{formatDay(plan.projectedEndDate)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Retard</p>
                <p className={plan.projectDelayDays > 0 ? 'font-medium text-clay-600' : 'font-medium text-moss-600'}>{plan.projectDelayDays > 0 ? `${plan.projectDelayDays} jour${plan.projectDelayDays > 1 ? 's' : ''}` : 'Aucun'}</p>
              </div>
            </div>
          )}
        </div>
        <ProgressBar className="mt-4 h-3" value={overview.progressPercent} tone={overview.progressPercent >= 100 ? 'moss' : 'blueprint'} />
        {plan && (plan.lateCount > 0 || plan.atRiskCount > 0) && (
          <p className="mt-3 flex items-center gap-2 text-sm text-clay-600">
            <TriangleAlert className="h-4 w-4" />
            {plan.lateCount > 0 && `${plan.lateCount} étape${plan.lateCount > 1 ? 's' : ''} en retard`}
            {plan.lateCount > 0 && plan.atRiskCount > 0 && ' · '}
            {plan.atRiskCount > 0 && `${plan.atRiskCount} à risque`}
          </p>
        )}
      </Card>

      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'progress', label: 'Étapes', icon: <Gauge className="h-4 w-4" />, badge: pendingCount },
          { value: 'planning', label: 'Planning', icon: <CalendarClock className="h-4 w-4" /> },
          { value: 'costs', label: 'Coûts', icon: <CircleDollarSign className="h-4 w-4" /> },
          { value: 'orders', label: 'Avenants', icon: <FileSignature className="h-4 w-4" /> },
        ]}
      />

      {view === 'progress' && (
        <div className="space-y-6">
          <PendingUpdates projectId={projectId} updates={overview.pendingUpdates} permissions={permissions} currentUserId={userId} />
          <section className="space-y-3">
            <SectionHeader
              title="Avancement par étape"
              description="Le pourcentage déclaré par le terrain ne compte qu'après validation. Le trait noir indique où l'étape devrait en être d'après le planning."
              action={
                (permissions.owner || permissions.isSiteManager) && (
                  <Button variant="outline" size="sm" onClick={() => setPhasesOpen(true)}>
                    <Settings2 className="h-4 w-4" /> Gérer les étapes
                  </Button>
                )
              }
            />
            <PhaseProgressCards projectId={projectId} phases={overview.phases} planning={plan} permissions={permissions} />
          </section>
        </div>
      )}

      {view === 'planning' && plan && (
        <div className="space-y-4">
          <SectionHeader title="Planning du chantier" description="Dates prévues de chaque étape, avancement réel et retards." />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Étapes en retard" value={String(plan.lateCount)} tone={plan.lateCount > 0 ? 'clay' : 'moss'} />
            <StatCard label="À risque" value={String(plan.atRiskCount)} tone={plan.atRiskCount > 0 ? 'safety' : 'default'} />
            <StatCard label="Retard du projet" value={`${plan.projectDelayDays} j`} tone={plan.projectDelayDays > 0 ? 'clay' : 'moss'} />
            <StatCard label="Jours d'arrêt" value={String(plan.stoppedDays)} hint="jours sans travail déclaré" />
          </div>
          <GanttChart planning={plan} />
          <StopReasons planning={plan} />
        </div>
      )}

      {view === 'costs' && (
        <div className="space-y-4">
          <SectionHeader title="Coût par étape" description="Budget, dépenses validées et en attente, marchés engagés et coût final prévu d'après l'avancement." />
          {costs.isLoading ? <PageSpinner /> : costs.data ? <PhaseCostCards costs={costs.data} /> : <ErrorState message="Impossible de charger les coûts." />}
        </div>
      )}

      {view === 'orders' && <ChangeOrdersSection projectId={projectId} currency={currency} permissions={permissions} />}

      <PhasesManagerDialog open={phasesOpen} onClose={() => setPhasesOpen(false)} projectId={projectId} phases={phasesQuery.data ?? []} />
    </div>
  );
}
