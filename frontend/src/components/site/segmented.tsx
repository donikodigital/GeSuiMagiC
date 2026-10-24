//frontend/src/components/site/segmented.tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

/** Selecteur de vue : pastilles sur une seule ligne, sans defilement horizontal (elles se partagent la largeur). */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentedOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1.5 rounded-2xl bg-concrete-light p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all sm:text-sm',
            value === o.value ? 'bg-white text-blueprint-700 shadow-card' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.icon}
          <span className="truncate">{o.label}</span>
          {!!o.badge && o.badge > 0 && <span className="rounded-full bg-safety-500 px-1.5 text-[10px] font-bold leading-4 text-white">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}
