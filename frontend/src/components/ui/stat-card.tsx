import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

export function StatCard({
  label,
  value,
  tone = 'default',
  hint,
  icon,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'moss' | 'clay' | 'safety';
  hint?: string;
  icon?: React.ReactNode;
}) {
  const toneText = { default: 'text-ink-900', moss: 'text-moss-600', clay: 'text-clay-600', safety: 'text-safety-500' }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        {icon && <div className="text-ink-300">{icon}</div>}
      </div>
      <p className={cn('mt-2 font-ledger text-2xl font-semibold tracking-tight', toneText)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </Card>
  );
}
