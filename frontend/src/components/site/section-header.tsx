//frontend/src/components/site/section-header.tsx
import * as React from 'react';

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Ligne « libelle : valeur » compacte pour les cartes. */
export function Fact({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={strong ? 'truncate font-ledger text-base font-semibold text-ink-900' : 'truncate text-sm text-ink-700'}>{value}</p>
    </div>
  );
}
