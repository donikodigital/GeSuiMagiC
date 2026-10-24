//frontend/src/components/site/workforce/presence-section.tsx
'use client';

import * as React from 'react';
import { CalendarCheck2, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { SectionHeader } from '@/components/site/section-header';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { usePresences, useWorkers } from '@/hooks/use-site';
import { cn } from '@/lib/utils';
import { dayLabel, todayIso } from '@/lib/month';
import { formatQty, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';

type Fraction = 0 | 0.5 | 1;

const addDay = (iso: string, delta: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
};

/** Appel du jour : chaque ouvrier est absent, present une demi-journee ou present une journee complete. */
export function PresenceSection({ projectId, permissions }: { projectId: string; permissions: SitePermissions }) {
  const [date, setDate] = React.useState(todayIso());
  const workers = useWorkers(projectId);
  const presences = usePresences(projectId, date, date);
  const { submit, pending } = useQueuedSubmit(projectId);
  const [values, setValues] = React.useState<Record<string, Fraction>>({});
  const [phaseId, setPhaseId] = React.useState('');
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    const entries = presences.data?.[0]?.entries ?? [];
    setValues(Object.fromEntries(entries.map((e) => [e.workerId, toNum(e.fraction) as Fraction])));
    setPhaseId(entries.find((e) => e.phaseId)?.phaseId ?? '');
    setDirty(false);
  }, [presences.data, date]);

  if (workers.isLoading) return <PageSpinner />;
  if (workers.isError || !workers.data) return <ErrorState message="Impossible de charger les ouvriers." />;
  const active = workers.data.filter((w) => w.isActive);
  if (active.length === 0) {
    return <EmptyState icon={<Users className="h-6 w-6" />} title="Aucun ouvrier actif" description="Ajoutez d'abord les ouvriers du chantier dans l'onglet « Ouvriers »." />;
  }

  const total = active.reduce((sum, w) => sum + (values[w.id] ?? 0), 0);
  const today = todayIso();
  const set = (id: string, fraction: Fraction) => {
    setValues({ ...values, [id]: fraction });
    setDirty(true);
  };

  const save = async () => {
    const entries = active.map((w) => ({ workerId: w.id, fraction: (values[w.id] ?? 0) as Fraction, phaseId: (values[w.id] ?? 0) > 0 && phaseId ? phaseId : undefined }));
    await submit(
      { kind: 'worker-presences', label: `Présences du ${date} : ${formatQty(total)} jour(s)-ouvriers`, method: 'PUT', path: `/projects/${projectId}/worker-presences`, body: { date, entries } },
      'Présences enregistrées.',
    );
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Appel du jour" description="Touchez pour indiquer qui est venu : absent, demi-journée ou journée complète. Fonctionne sans réseau." />
      <Card className="flex items-center justify-between gap-2 rounded-2xl p-3">
        <Button variant="ghost" size="sm" onClick={() => setDate(addDay(date, -1))} aria-label="Jour précédent">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate font-display text-base font-semibold capitalize text-ink-900">{dayLabel(date)}</p>
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="mx-auto mt-1 h-8 w-40 text-center text-xs" aria-label="Choisir une date" />
        </div>
        <Button variant="ghost" size="sm" disabled={date >= today} onClick={() => setDate(addDay(date, 1))} aria-label="Jour suivant">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Card>

      {presences.isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {active.map((w) => {
              const current = values[w.id] ?? 0;
              return (
                <Card key={w.id} className="rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{w.fullName}</p>
                      <p className="truncate text-xs text-ink-400">{w.trade ?? '—'}</p>
                    </div>
                    {permissions.fieldWrite ? (
                      <div className="flex shrink-0 gap-1 rounded-xl bg-concrete-light p-0.5">
                        {([0, 0.5, 1] as Fraction[]).map((f) => (
                          <button key={f} type="button" onClick={() => set(w.id, f)} className={cn('min-w-[3rem] rounded-lg px-2 py-1.5 text-xs font-semibold transition-all', current === f ? (f === 0 ? 'bg-white text-ink-700 shadow-card' : 'bg-moss-500 text-white shadow-card') : 'text-ink-400 hover:text-ink-700')}>
                            {f === 0 ? 'Absent' : f === 0.5 ? '½ jour' : '1 jour'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="font-ledger text-sm font-semibold text-ink-700">{current === 0 ? 'Absent' : current === 0.5 ? '½ jour' : '1 jour'}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="space-y-3 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-700">Total du jour</p>
              <p className="font-ledger text-xl font-bold text-ink-900">{formatQty(total)} <span className="text-sm font-semibold text-ink-400">jour{total > 1 ? 's' : ''}-ouvrier</span></p>
            </div>
            {permissions.fieldWrite && (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink-700">Étape travaillée ce jour</p>
                  <PhaseSelect projectId={projectId} value={phaseId} onChange={(v) => { setPhaseId(v); setDirty(true); }} emptyLabel="Non précisée" />
                </div>
                <Button className="w-full" onClick={save} loading={pending} disabled={!dirty}>
                  <CalendarCheck2 className="h-4 w-4" /> Enregistrer la présence
                </Button>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
