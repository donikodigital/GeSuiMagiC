// frontend/src/components/anomalies/anomaly-card.tsx
'use client';

import { ChevronRight, ShieldAlert } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { anomalyStatusMeta, formatDate } from '@/lib/format';
import type { Anomaly } from '@/types/models';

export const CATEGORY_LABELS: Record<string, string> = {
  depense_inconnue: 'Depense inconnue',
  montant_incorrect: 'Montant incorrect',
  doublon: 'Doublon',
  justificatif_absent: 'Justificatif absent',
  materiau_suspect: 'Materiau suspect',
  autre: 'Autre',
};

const TONE_ICON_BG: Record<string, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export function AnomalyCard({ anomaly, onClick }: { anomaly: Anomaly; onClick: () => void }) {
  const tone = anomalyStatusMeta[anomaly.status].tone;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-card border border-concrete bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-blueprint-200 hover:shadow-md active:translate-y-0"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
        <ShieldAlert className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink-900">{CATEGORY_LABELS[anomaly.category] ?? anomaly.category}</p>
          <StatusBadge label={anomalyStatusMeta[anomaly.status].label} tone={tone} className="shrink-0" />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-600">{anomaly.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-400">
          <span>{formatDate(anomaly.createdAt)}</span>
          {anomaly.project?.name && (
            <>
              <span className="text-ink-300">·</span>
              <span className="truncate">{anomaly.project.name}</span>
            </>
          )}
          {anomaly.client && (
            <>
              <span className="text-ink-300">·</span>
              <span className="truncate">
                {anomaly.client.firstName} {anomaly.client.lastName}
              </span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blueprint-500" />
    </button>
  );
}