//frontend/src/components/site/progress/stop-reasons.tsx
import { CloudRain } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/site/progress-bar';
import { stopReasonLabels } from '@/lib/site-format';
import type { Planning } from '@/types/site';

/** Pourquoi le chantier s'est arrete : jours non travailles par raison. */
export function StopReasons({ planning }: { planning: Planning }) {
  if (planning.stopReasons.length === 0) return null;
  const max = Math.max(...planning.stopReasons.map((s) => s.days), 1);
  return (
    <Card className="rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-safety-50 text-safety-500">
            <CloudRain className="h-4 w-4" />
          </span>
          <p className="font-medium text-ink-900">Raisons d&apos;arrêt du chantier</p>
        </div>
        <p className="text-xs text-ink-400">{planning.stoppedDays} jour{planning.stoppedDays > 1 ? 's' : ''} sans travail</p>
      </div>
      <ul className="space-y-2.5">
        {planning.stopReasons.map((s) => (
          <li key={s.reason}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-ink-700">{stopReasonLabels[s.reason]}</span>
              <span className="font-ledger font-semibold text-ink-900">{s.days} j</span>
            </div>
            <ProgressBar value={(s.days / max) * 100} tone={s.reason === 'UNSPECIFIED' ? 'ink' : 'safety'} className="h-2" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
