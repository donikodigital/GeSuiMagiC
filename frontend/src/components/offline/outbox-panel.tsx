//frontend/src/components/offline/outbox-panel.tsx
'use client';

import * as React from 'react';
import { Clock, Image as ImageIcon, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOutboxItems } from '@/hooks/use-outbox';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<string, string> = {
  expense: 'Dépense',
  'site-log': 'Journal de chantier',
  progress: 'Avancement',
  snag: 'Réserve',
  delivery: 'Livraison',
  'stock-movement': 'Mouvement de stock',
  'work-day': 'Journée travaillée',
  'worker-presences': 'Présences des ouvriers',
  'contract-payment': 'Paiement de sous-traitant',
  attachment: 'Pièce jointe',
};

/** Saisies conservees sur l'appareil : en attente d'envoi, ou refusees par le serveur et a corriger. */
export function OutboxPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, retry, discard } = useOutboxItems();
  const [confirming, setConfirming] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} title="Saisies hors ligne" description="Conservées sur cet appareil, envoyées automatiquement au retour du réseau." maxWidth="max-w-xl">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">Aucune saisie en attente.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className={cn('rounded-xl border px-4 py-3 shadow-card', item.status === 'failed' ? 'border-clay-200 bg-clay-50/60' : 'border-concrete bg-white')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{item.label}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
                    <span>{KIND_LABEL[item.kind] ?? item.kind}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDateTime(new Date(item.createdAt))}
                    </span>
                    {item.files.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> {item.files.length} fichier{item.files.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                  {item.status === 'failed' && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-clay-600">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {item.lastError ?? 'Refusée par le serveur.'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.status === 'failed' && (
                    <Button variant="outline" size="sm" onClick={() => void retry(item.id)} title="Réessayer">
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {confirming === item.id ? (
                    <>
                      <Button variant="danger" size="sm" onClick={() => void discard(item.id).then(() => setConfirming(null))}>
                        Supprimer
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Garder
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(item.id)} aria-label="Supprimer cette saisie" className="text-ink-300 hover:text-clay-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
