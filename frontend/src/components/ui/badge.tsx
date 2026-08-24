//frontend/src/components/ui/badge.tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'moss' | 'safety' | 'clay' | 'ink' | 'blueprint';

const toneClasses: Record<Tone, string> = {
  moss: 'bg-moss-50 text-moss-600 ring-moss-200',
  safety: 'bg-safety-50 text-safety-500 ring-safety-200',
  clay: 'bg-clay-50 text-clay-600 ring-clay-200',
  ink: 'bg-ink-50 text-ink-600 ring-ink-200',
  blueprint: 'bg-blueprint-50 text-blueprint-700 ring-blueprint-200',
};

export function StatusBadge({ label, tone, className }: { label: string; tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
