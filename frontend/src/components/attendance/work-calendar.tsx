//frontend/src/components/attendance/work-calendar.tsx
'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { addMonths, currentMonth, dayIso, daysInMonth, firstWeekdayOffset, monthLabel, todayIso } from '@/lib/month';
import type { WorkDay } from '@/types/models';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface WorkCalendarProps {
  month: string;
  onMonthChange: (month: string) => void;
  days: WorkDay[];
  /** Jour pour lequel la saisie est permise : la fenetre de 14 jours est decidee par le parent. */
  isEditable: (iso: string) => boolean;
  onSelectDay: (iso: string) => void;
  loading?: boolean;
}

/**
 * Calendrier du mois : chaque case est un jour. Vert = travaille (effectif affiche), gris = non travaille,
 * pointille orange = jour passe sans aucune saisie.
 */
export function WorkCalendar({ month, onMonthChange, days, isEditable, onSelectDay, loading }: WorkCalendarProps) {
  const today = todayIso();
  const byDate = React.useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const total = daysInMonth(month);
  const offset = firstWeekdayOffset(month);
  const isCurrent = month === currentMonth();

  return (
    <Card className={cn('overflow-hidden rounded-2xl transition-opacity', loading && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2 border-b border-concrete px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-concrete-light"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-ink-900">{monthLabel(month)}</p>
          {!isCurrent && (
            <button type="button" onClick={() => onMonthChange(currentMonth())} className="text-xs font-medium text-blueprint-600 hover:underline">
              Revenir à ce mois-ci
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-concrete-light"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="p-3 sm:p-5">
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((label, i) => (
            <p key={i} className="text-center text-[11px] font-medium uppercase tracking-wide text-ink-400">
              {label}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
            const iso = dayIso(month, day);
            const entry = byDate.get(iso);
            const future = iso > today;
            const missing = !entry && !future;
            const editable = isEditable(iso);
            const label = entry ? (entry.isWorked ? `${entry.workersCount} ouvriers · ${entry.phaseName ?? ''}` : 'Non travaillé') : future ? 'À venir' : 'Non renseigné';

            return (
              <button
                key={iso}
                type="button"
                disabled={future}
                onClick={() => onSelectDay(iso)}
                title={`${day} — ${label}${editable ? '' : ' (consultation)'}`}
                aria-label={`${day} ${monthLabel(month)} : ${label}`}
                className={cn(
                  'relative flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-xl border text-sm transition-all',
                  entry?.isWorked && 'border-moss-200 bg-moss-50 text-moss-600 shadow-card hover:-translate-y-0.5',
                  entry && !entry.isWorked && 'border-concrete bg-concrete-light text-ink-500 hover:-translate-y-0.5',
                  missing && 'border-dashed border-safety-300 bg-safety-50/50 text-ink-700 hover:-translate-y-0.5',
                  future && 'cursor-not-allowed border-transparent bg-transparent text-ink-200',
                  iso === today && 'ring-2 ring-blueprint-400 ring-offset-1',
                )}
              >
                <span className={cn('text-sm font-semibold leading-none', entry?.isWorked && 'text-moss-600')}>{day}</span>
                {entry?.isWorked && <span className="mt-1 font-ledger text-[11px] leading-none">{entry.workersCount}</span>}
                {entry && !entry.isWorked && <span className="mt-1 text-[9px] uppercase leading-none tracking-wide">repos</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-moss-200 bg-moss-50" /> Travaillé (nombre d&apos;ouvriers)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-concrete bg-concrete-light" /> Non travaillé
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-dashed border-safety-300 bg-safety-50/50" /> Non renseigné
          </span>
        </div>
      </div>
    </Card>
  );
}
