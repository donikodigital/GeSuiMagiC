//frontend/src/components/meals/month-switcher.tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonth, monthLabel } from '@/lib/month';

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-concrete bg-white px-3 py-2.5 shadow-card">
      <button type="button" onClick={() => onChange(addMonths(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-concrete-light" aria-label="Mois précédent">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-center">
        <p className="font-display text-lg font-semibold text-ink-900">{monthLabel(month)}</p>
        {month !== currentMonth() && (
          <button type="button" onClick={() => onChange(currentMonth())} className="text-xs font-medium text-blueprint-600 hover:underline">
            Revenir à ce mois-ci
          </button>
        )}
      </div>
      <button type="button" onClick={() => onChange(addMonths(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-concrete-light" aria-label="Mois suivant">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
