//frontend/src/components/offline/offline-banner.tsx
'use client';

import * as React from 'react';
import { CloudOff, CloudUpload, TriangleAlert } from 'lucide-react';
import { useOnline, useOutboxItems } from '@/hooks/use-outbox';
import { OutboxPanel } from '@/components/offline/outbox-panel';
import { cn } from '@/lib/utils';

/** Bandeau d'etat du reseau : hors ligne, saisies en attente d'envoi, saisies refusees a corriger. */
export function OfflineBanner() {
  const online = useOnline();
  const { pending, failed } = useOutboxItems();
  const [open, setOpen] = React.useState(false);

  const total = pending.length + failed.length;
  if (online && total === 0) return null;

  const tone = failed.length > 0 ? 'clay' : online ? 'blueprint' : 'safety';
  const Icon = failed.length > 0 ? TriangleAlert : online ? CloudUpload : CloudOff;
  const text =
    failed.length > 0
      ? `${failed.length} saisie${failed.length > 1 ? 's' : ''} à corriger`
      : !online
        ? total > 0
          ? `Hors ligne · ${pending.length} saisie${pending.length > 1 ? 's' : ''} en attente d'envoi`
          : 'Hors ligne · vos saisies seront envoyées au retour du réseau'
        : `Envoi de ${pending.length} saisie${pending.length > 1 ? 's' : ''} en cours…`;

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium lg:px-8',
          tone === 'clay' && 'bg-clay-50 text-clay-600',
          tone === 'safety' && 'bg-safety-50 text-safety-500',
          tone === 'blueprint' && 'bg-blueprint-50 text-blueprint-700',
        )}
        role="status"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{text}</span>
        </span>
        {total > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full border border-current px-3 py-0.5 text-xs font-semibold hover:bg-white/60">
            Voir
          </button>
        )}
      </div>
      <OutboxPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
