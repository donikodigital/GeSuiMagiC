//frontend/src/components/site/progress/progress-dialog.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Textarea } from '@/components/ui/input';
import { newClientRef } from '@/lib/geo';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import type { PhaseProgress } from '@/types/site';

/** Declaration de l'avancement d'une etape (a valider par le conducteur de travaux, l'architecte ou le client). */
export function ProgressDialog({ open, onClose, projectId, phase }: { open: boolean; onClose: () => void; projectId: string; phase: PhaseProgress | null }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const [percent, setPercent] = React.useState(0);
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    if (open && phase) {
      setPercent(phase.progressPercent);
      setNote('');
    }
  }, [open, phase]);

  if (!phase) return null;
  const unchanged = percent === phase.progressPercent;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unchanged) return;
    const result = await submit(
      { kind: 'progress', label: `Avancement « ${phase.name} » : ${percent} %`, method: 'POST', path: `/projects/${projectId}/progress`, body: { phaseId: phase.id, percent, note: note.trim() || undefined, clientRef: newClientRef() } },
      'Avancement déclaré : il sera pris en compte après validation.',
    );
    if (result) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Avancement · ${phase.name}`} description={`Actuellement validé : ${phase.progressPercent} %.`}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="rounded-2xl bg-blueprint-50/60 px-4 py-5 text-center">
          <p className="font-ledger text-4xl font-bold text-blueprint-700">{percent} %</p>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="mt-4 w-full accent-blueprint-600"
            aria-label="Pourcentage d'avancement"
          />
          <div className="mt-1 flex justify-between text-[11px] text-ink-400">
            <span>0 %</span>
            <span>50 %</span>
            <span>100 %</span>
          </div>
        </div>
        <FormField label="Précisions" hint="Ce qui a été réalisé depuis la dernière déclaration (facultatif).">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ex. : coulage de la dalle terminé, ferraillage des poteaux en cours." />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending} disabled={unchanged}>
            Déclarer l&apos;avancement
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
