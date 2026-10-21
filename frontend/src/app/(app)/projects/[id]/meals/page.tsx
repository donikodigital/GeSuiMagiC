//frontend/src/app/(app)/projects/[id]/meals/page.tsx
'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { useMealMonth, useMealMonths } from '@/hooks/use-meals';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState, PageSpinner } from '@/components/ui/misc';
import { MonthSwitcher } from '@/components/meals/month-switcher';
import { MealMonthView } from '@/components/meals/meal-month-view';
import { currentMonth, isValidMonth, monthLabel } from '@/lib/month';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const CLOSED_STATUSES = ['SUSPENDED', 'COMPLETED', 'ARCHIVED'];

function ProjectMealsContent() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const { data: project } = useProject(projectId);

  const requested = searchParams.get('month');
  const [month, setMonthState] = React.useState(isValidMonth(requested) ? requested : currentMonth());

  const setMonth = (next: string) => {
    setMonthState(next);
    router.replace(`/projects/${projectId}/meals?month=${next}`, { scroll: false });
  };

  const monthQuery = useMealMonth(projectId, month);
  const monthsQuery = useMealMonths(projectId);

  const canManage = isClient || isSuperadmin;
  const canAnswer = isSupervisor || isSuperadmin;
  const blocked = !!project && CLOSED_STATUSES.includes(project.status) && !isSuperadmin;

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-ink-500">
        {canManage
          ? "Suivez comment l'argent envoyé pour l'alimentation des ouvriers est utilisé, mois par mois, en le comparant aux jours réellement travaillés."
          : "Le client voit ici l'argent envoyé pour l'alimentation des ouvriers, les repas payés et les jours travaillés correspondants."}
      </p>

      <MonthSwitcher month={month} onChange={setMonth} />

      {monthQuery.isLoading ? (
        <PageSpinner />
      ) : monthQuery.isError || !monthQuery.data ? (
        <ErrorState message="Impossible de charger le suivi de l'alimentation pour ce mois." />
      ) : (
        <MealMonthView projectId={projectId} report={monthQuery.data} canManage={canManage} canAnswer={canAnswer} blocked={blocked} />
      )}

      {monthsQuery.data && monthsQuery.data.length > 1 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Tous les mois</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {monthsQuery.data.map((m) => {
              const remaining = parseFloat(m.amounts.remainingAmount);
              return (
                <button key={m.month} type="button" onClick={() => setMonth(m.month)} className="text-left transition-transform hover:-translate-y-0.5">
                  <Card className={cn('rounded-2xl', m.month === month && 'ring-2 ring-blueprint-300')}>
                    <CardContent>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-ink-900">{monthLabel(m.month)}</p>
                        {m.openRequestsCount > 0 && <span className="rounded-full bg-safety-50 px-2 py-0.5 text-[11px] font-medium text-safety-500">{m.openRequestsCount} demande(s)</span>}
                      </div>
                      {m.envelope ? (
                        <>
                          <p className={cn('mt-3 font-ledger text-lg font-bold', remaining < 0 ? 'text-clay-600' : 'text-moss-600')}>{formatMoney(remaining, m.currency)}</p>
                          <p className="text-xs text-ink-400">de reliquat · {m.attendance.workedDays} jour(s) travaillé(s)</p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-ink-400">Pas d&apos;enveloppe · {m.attendance.workedDays} jour(s) travaillé(s)</p>
                      )}
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProjectMealsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ProjectMealsContent />
    </Suspense>
  );
}
