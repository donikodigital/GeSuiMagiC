//frontend/src/components/site/progress-bar.tsx
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/site-format';

const fill: Record<Tone, string> = {
  moss: 'bg-moss-500',
  safety: 'bg-safety-500',
  clay: 'bg-clay-500',
  ink: 'bg-ink-400',
  blueprint: 'bg-blueprint-500',
};

/** Barre d'avancement ; `marker` (0-100) repere ou l'etape devrait en etre d'apres le planning. */
export function ProgressBar({ value, tone = 'blueprint', marker, className }: { value: number; tone?: Tone; marker?: number | null; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-concrete-light', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', fill[tone])} style={{ width: `${pct}%` }} />
      {marker !== null && marker !== undefined && marker > 0 && marker < 100 && <span className="absolute top-0 h-full w-0.5 bg-ink-700/70" style={{ left: `${marker}%` }} title={`Attendu : ${marker} %`} />}
    </div>
  );
}
