//frontend/src/components/site/progress/gantt-chart.tsx
'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dayDiff, formatDay, scheduleStatusMeta } from '@/lib/site-format';
import { cn } from '@/lib/utils';
import type { Planning } from '@/types/site';

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

/** Planning en barres : prevu (bleu, rempli selon l'avancement), reel (vert) et repere « aujourd'hui ». */
export function GanttChart({ planning }: { planning: Planning }) {
  const phases = planning.phases.filter((p) => p.isActive && (p.plannedStart || p.plannedEnd));

  const range = React.useMemo(() => {
    const dates: string[] = [planning.today];
    for (const p of phases) {
      [p.plannedStart, p.plannedEnd, p.actualStart, p.actualEnd].forEach((d) => d && dates.push(d));
    }
    if (planning.projectedEndDate) dates.push(planning.projectedEndDate);
    dates.sort();
    const min = dates[0];
    const max = dates[dates.length - 1];
    return { min, max, span: Math.max(1, dayDiff(min, max) + 1) };
  }, [phases, planning.today, planning.projectedEndDate]);

  if (phases.length === 0) {
    return (
      <Card className="rounded-2xl p-6 text-center text-sm text-ink-500">
        Aucune date prévue sur les étapes. Renseignez le début et la fin prévus de chaque étape (bouton « Gérer les étapes ») pour afficher le planning.
      </Card>
    );
  }

  const pos = (iso: string) => (dayDiff(range.min, iso) / range.span) * 100;
  const width = (from: string, to: string) => Math.max(1.2, ((dayDiff(from, to) + 1) / range.span) * 100);

  // Reperes mensuels (1er de chaque mois dans la plage).
  const ticks: { iso: string; left: number }[] = [];
  const [sy, sm] = range.min.split('-').map(Number);
  let cursor = `${sy}-${String(sm).padStart(2, '0')}-01`;
  if (cursor < range.min) cursor = addDays(cursor, 32).slice(0, 8) + '01';
  while (cursor <= range.max && ticks.length < 36) {
    ticks.push({ iso: cursor, left: pos(cursor) });
    cursor = addDays(cursor, 32).slice(0, 8) + '01';
  }

  const todayLeft = pos(planning.today);

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="relative border-b border-concrete bg-paper/60 px-4 pb-2 pt-3">
        <div className="relative h-5">
          {ticks.map((t) => (
            <span key={t.iso} className="absolute top-0 -translate-x-1/2 text-[10px] font-medium uppercase tracking-wide text-ink-400" style={{ left: `${Math.min(97, Math.max(3, t.left))}%` }}>
              {formatDay(t.iso, 'MMM yy')}
            </span>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-concrete/70">
        {phases.map((phase) => {
          const start = phase.plannedStart ?? phase.plannedEnd!;
          const end = phase.plannedEnd ?? phase.plannedStart!;
          const meta = scheduleStatusMeta[phase.status];
          const actualFrom = phase.actualStart;
          const actualTo = phase.actualEnd ?? (phase.status === 'DONE' ? phase.actualStart : planning.today);
          return (
            <li key={phase.id} className="px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-ink-900">{phase.name}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-ledger text-xs font-semibold text-ink-600">{phase.progressPercent} %</span>
                  <StatusBadge label={phase.delayDays > 0 && phase.status !== 'DONE' ? `${meta.label} · ${phase.delayDays} j` : meta.label} tone={meta.tone} />
                </div>
              </div>
              <div className="relative h-7">
                {ticks.map((t) => (
                  <span key={t.iso} className="absolute top-0 h-full w-px bg-concrete/70" style={{ left: `${t.left}%` }} />
                ))}
                <div
                  className={cn('absolute top-0.5 h-3.5 overflow-hidden rounded-full', phase.status === 'LATE' ? 'bg-clay-100' : 'bg-blueprint-100')}
                  style={{ left: `${pos(start)}%`, width: `${width(start, end)}%` }}
                  title={`Prévu : ${formatDay(start)} → ${formatDay(end)}`}
                >
                  <div className={cn('h-full rounded-full', phase.status === 'LATE' ? 'bg-clay-500' : 'bg-blueprint-500')} style={{ width: `${phase.progressPercent}%` }} />
                </div>
                {actualFrom && actualTo && (
                  <div className="absolute bottom-0.5 h-1.5 rounded-full bg-moss-500" style={{ left: `${pos(actualFrom)}%`, width: `${width(actualFrom, actualTo < actualFrom ? actualFrom : actualTo)}%` }} title={`Réel : ${formatDay(actualFrom)} → ${formatDay(actualTo)}`} />
                )}
                <span className="absolute top-0 h-full w-0.5 bg-safety-500" style={{ left: `${todayLeft}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Prévu {formatDay(start, 'd MMM')} → {formatDay(end, 'd MMM yyyy')}
                {phase.actualStart ? ` · commencé le ${formatDay(phase.actualStart, 'd MMM')}` : ''}
                {phase.actualEnd ? ` · terminé le ${formatDay(phase.actualEnd, 'd MMM')}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-concrete bg-paper/60 px-4 py-2 text-[11px] text-ink-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-blueprint-500" /> Prévu (rempli = avancement)</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-moss-500" /> Réel</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-safety-500" /> Aujourd&apos;hui</span>
      </div>
    </Card>
  );
}
