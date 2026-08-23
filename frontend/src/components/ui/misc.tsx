import * as React from 'react';
import { Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-blueprint-500', className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-concrete-dark px-6 py-14 text-center">
      <div className="rounded-full bg-concrete-light p-3 text-ink-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div>
        <p className="font-display text-base font-semibold text-ink-800">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-clay-200 bg-clay-50 px-5 py-4 text-sm text-clay-600">
      {message}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-concrete', className)} />;
}
