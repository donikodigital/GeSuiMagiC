//frontend/src/components/attendance/phase-summary-cards.tsx
'use client';

import { HardHat } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WorkSummary } from '@/types/models';

/** Une carte par etape : jours travailles, jours-ouvriers, premiere et derniere date, part du temps total. */
export function PhaseSummaryCards({ byPhase, totalWorkedDays }: { byPhase: WorkSummary['byPhase']; totalWorkedDays: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {byPhase.map((phase, index) => {
        const share = totalWorkedDays > 0 ? (phase.workedDays / totalWorkedDays) * 100 : 0;
        const started = phase.workedDays > 0;
        return (
          <Card key={phase.phaseId} style={{ animationDelay: `${index * 40}ms` }} className={cn('animate-card-in rounded-2xl transition-transform hover:-translate-y-0.5', !phase.isActive && 'opacity-70')}>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', started ? 'bg-blueprint-50 text-blueprint-600' : 'bg-concrete-light text-ink-300')}>
                    <HardHat className="h-4 w-4" />
                  </span>
                  <p className="truncate font-medium text-ink-900">{phase.name}</p>
                </div>
                {!phase.isActive && <span className="shrink-0 text-[11px] text-ink-400">désactivée</span>}
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-ledger text-3xl font-bold leading-none text-ink-900">{phase.workedDays}</p>
                  <p className="mt-1 text-xs text-ink-400">jour{phase.workedDays > 1 ? 's' : ''} travaillé{phase.workedDays > 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-ledger text-lg font-semibold text-ink-700">{formatNumber(phase.workerDays)}</p>
                  <p className="text-xs text-ink-400">jours-ouvriers</p>
                </div>
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-concrete-light">
                <div className="h-full rounded-full bg-blueprint-500 transition-all" style={{ width: `${share}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-400">
                {started
                  ? `${share.toFixed(0)} % du temps · du ${formatDate(phase.firstDate!)} au ${formatDate(phase.lastDate!)}`
                  : 'Pas encore commencée'}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
