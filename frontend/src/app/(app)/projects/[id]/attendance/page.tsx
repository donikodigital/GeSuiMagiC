//frontend/src/app/(app)/projects/[id]/attendance/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { CalendarDays, HardHat, ListChecks, Settings2, Users } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { usePhaseActions, usePhases, useWorkMonth, useWorkSummary } from '@/hooks/use-attendance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { WorkCalendar } from '@/components/attendance/work-calendar';
import { WorkDayDialog } from '@/components/attendance/work-day-dialog';
import { PhasesManagerDialog } from '@/components/attendance/phases-manager-dialog';
import { PhaseSummaryCards } from '@/components/attendance/phase-summary-cards';
import { currentMonth, diffDays, monthLabel, todayIso } from '@/lib/month';
import { formatNumber } from '@/lib/format';

/** Un superviseur peut saisir ou corriger les 14 derniers jours (regle appliquee par le serveur). */
const EDIT_WINDOW_DAYS = 14;
const CLOSED_STATUSES = ['SUSPENDED', 'COMPLETED', 'ARCHIVED'];

export default function ProjectAttendancePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const { data: project } = useProject(projectId);

  const [month, setMonth] = React.useState(currentMonth());
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [phasesOpen, setPhasesOpen] = React.useState(false);

  const monthQuery = useWorkMonth(projectId, month);
  const summaryQuery = useWorkSummary(projectId);
  const phasesQuery = usePhases(projectId);
  const { createDefaults } = usePhaseActions(projectId);

  if (phasesQuery.isLoading || summaryQuery.isLoading) return <PageSpinner />;
  if (phasesQuery.isError || summaryQuery.isError || !phasesQuery.data || !summaryQuery.data) {
    return <ErrorState message="Impossible de charger le suivi des jours travaillés." />;
  }

  const phases = phasesQuery.data;
  const summary = summaryQuery.data;
  const monthView = monthQuery.data;
  const canRecord = isSupervisor || isSuperadmin;
  const projectClosed = !!project && CLOSED_STATUSES.includes(project.status);

  /** null = saisie permise ; sinon la raison de la consultation seule. */
  const lockedReasonFor = (iso: string | null): string | null => {
    if (!iso) return null;
    if (isClient) return 'Les présences sont renseignées par le superviseur. Vous les consultez ici.';
    if (projectClosed && !isSuperadmin) return 'Ce projet est suspendu, terminé ou archivé : les présences ne peuvent plus être modifiées.';
    if (!isSuperadmin && diffDays(iso, todayIso()) > EDIT_WINDOW_DAYS) {
      return `Au-delà de ${EDIT_WINDOW_DAYS} jours, seul l'administrateur peut modifier une journée.`;
    }
    return null;
  };

  if (phases.length === 0) {
    return (
      <EmptyState
        icon={<HardHat className="h-6 w-6" />}
        title="Aucune étape définie"
        description="Définissez les étapes du chantier (fondation, murs, toiture...) pour pouvoir suivre les jours travaillés étape par étape."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => createDefaults.mutate()} loading={createDefaults.isPending}>
              Ajouter les étapes par défaut
            </Button>
            <Button variant="outline" onClick={() => setPhasesOpen(true)}>
              Créer mes propres étapes
            </Button>
            <PhasesManagerDialog open={phasesOpen} onClose={() => setPhasesOpen(false)} projectId={projectId} phases={phases} />
          </div>
        }
      />
    );
  }

  const monthSummary = monthView?.summary;
  const totals = summary.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-500">
          {canRecord
            ? 'Touchez un jour du calendrier pour indiquer si les ouvriers ont travaillé, combien ils étaient et sur quelle étape.'
            : 'Le superviseur renseigne chaque jour si les ouvriers ont travaillé. Ces jours servent à justifier l’utilisation de l’argent envoyé pour l’alimentation.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => setPhasesOpen(true)}>
          <Settings2 className="h-4 w-4" /> Gérer les étapes
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jours travaillés" value={String(totals.workedDays)} tone="moss" hint="depuis le début du chantier" icon={<CalendarDays className="h-4 w-4" />} />
        <StatCard label="Jours-ouvriers" value={formatNumber(totals.workerDays)} hint="somme des effectifs par jour" icon={<Users className="h-4 w-4" />} />
        <StatCard
          label={`Présence · ${monthLabel(month)}`}
          value={monthSummary ? `${monthSummary.workedDays} / ${monthSummary.elapsedDays || monthSummary.daysInMonth}` : '—'}
          hint={monthSummary ? (monthSummary.elapsedDays > 0 ? `${monthSummary.attendanceRate.toLocaleString('fr-FR')} % des jours écoulés` : 'mois à venir') : undefined}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Non renseignés"
          value={monthSummary ? String(monthSummary.unrecordedDays) : '—'}
          tone={monthSummary && monthSummary.unrecordedDays > 0 ? 'safety' : 'default'}
          hint="jours écoulés sans saisie ce mois-ci"
        />
      </div>

      <WorkCalendar
        month={month}
        onMonthChange={setMonth}
        days={monthView?.days ?? []}
        isEditable={(iso) => lockedReasonFor(iso) === null}
        onSelectDay={setSelectedDay}
        loading={monthQuery.isFetching}
      />
      {monthQuery.isError && <ErrorState message="Impossible de charger ce mois." />}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Jours travaillés par étape</h2>
        <PhaseSummaryCards byPhase={summary.byPhase} totalWorkedDays={totals.workedDays} />
      </section>

      {summary.byMonth.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Mois par mois</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...summary.byMonth].reverse().map((m) => (
              <button key={m.month} type="button" onClick={() => setMonth(m.month)} className="text-left transition-transform hover:-translate-y-0.5">
                <Card className="rounded-2xl">
                  <CardContent>
                    <p className="font-medium text-ink-900">{monthLabel(m.month)}</p>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="font-ledger text-2xl font-bold text-moss-600">{m.workedDays}</p>
                        <p className="text-xs text-ink-400">jour{m.workedDays > 1 ? 's' : ''} travaillé{m.workedDays > 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-ledger text-base font-semibold text-ink-700">{formatNumber(m.workerDays)}</p>
                        <p className="text-xs text-ink-400">jours-ouvriers</p>
                      </div>
                    </div>
                    {m.notWorkedDays > 0 && <p className="mt-2 text-xs text-ink-400">{m.notWorkedDays} jour{m.notWorkedDays > 1 ? 's' : ''} sans travail déclaré</p>}
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </section>
      )}

      <WorkDayDialog
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        projectId={projectId}
        date={selectedDay}
        entry={monthView?.days.find((d) => d.date === selectedDay)}
        phases={phases}
        lockedReason={lockedReasonFor(selectedDay)}
      />
      <PhasesManagerDialog open={phasesOpen} onClose={() => setPhasesOpen(false)} projectId={projectId} phases={phases} />
    </div>
  );
}
