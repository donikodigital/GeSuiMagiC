'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Dialog({ open, onClose, title, description, children, maxWidth = 'max-w-lg' }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn('relative w-full rounded-card bg-white shadow-xl ring-1 ring-ink-950/10 max-h-[90vh] overflow-y-auto', maxWidth)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-concrete px-5 py-4">
          <div>
            <h2 id="dialog-title" className="font-display text-lg font-semibold text-ink-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1.5 text-ink-400 hover:bg-concrete-light hover:text-ink-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
