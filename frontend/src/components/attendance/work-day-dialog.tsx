//frontend/src/components/attendance/work-day-dialog.tsx
'use client';

import * as React from 'react';
import { CalendarCheck, CalendarOff, Lock, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { dayLabel } from '@/lib/month';
import { useClearWorkDay } from '@/hooks/use-attendance';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { getPosition } from '@/lib/geo';
import { stopReasonLabels } from '@/lib/site-format';
import type { ProjectPhase, UpsertWorkDayPayload, WorkDay } from '@/types/models';

interface WorkDayDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  date: string | null;
  entry?: WorkDay;
  phases: ProjectPhase[];
  /** null = la saisie est permise ; sinon la raison affichee (consultation seule). */
  lockedReason: string | null;
}

export function WorkDayDialog({ open, onClose, projectId, date, entry, phases, lockedReason }: WorkDayDialogProps) {
  const { submit: queuedSubmit, pending: saving } = useQueuedSubmit(projectId);
  const clear = useClearWorkDay(projectId);

  const [isWorked, setIsWorked] = React.useState(true);
  const [workers, setWorkers] = React.useState('');
  const [phaseId, setPhaseId] = React.useState('');
  const [note, setNote] = React.useState('');
  const [stopReason, setStopReason] = React.useState<NonNullable<UpsertWorkDayPayload['stopReason']> | ''>('');
  const [locating, setLocating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setIsWorked(entry ? entry.isWorked : true);
    setWorkers(entry?.isWorked ? String(entry.workersCount) : '');
    setPhaseId(entry?.phaseId ?? '');
    setNote(entry?.note ?? '');
    setStopReason(entry && !entry.isWorked ? (entry.stopReason ?? '') : '');
  }, [open, entry, date]);

  if (!date) return null;

  // Une etape desactivee depuis la saisie reste selectionnable pour ne pas perdre l'information en modifiant la note.
  const selectable = phases.filter((p) => p.isActive || p.id === entry?.phaseId);
  const readOnly = lockedReason !== null;
  const workersNumber = Number(workers);
  const valid = !isWorked || (Number.isInteger(workersNumber) && workersNumber >= 1 && workersNumber <= 1000 && !!phaseId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || !valid) return;
    // La position sert a verifier la presence sur le chantier ; elle n'est jamais bloquante.
    setLocating(true);
    const position = isWorked ? await getPosition() : null;
    setLocating(false);
    const payload: UpsertWorkDayPayload = isWorked
      ? { isWorked: true, workersCount: workersNumber, phaseId, note: note.trim() || undefined, latitude: position?.latitude, longitude: position?.longitude }
      : { isWorked: false, note: note.trim() || undefined, stopReason: stopReason || undefined };
    const result = await queuedSubmit(
      {
        kind: 'work-day',
        label: `Journée du ${date} : ${isWorked ? `${workersNumber} ouvrier(s)` : 'non travaillée'}`,
        method: 'PUT',
        path: `/projects/${projectId}/work-days/${date}`,
        body: payload,
      },
      'Journée enregistrée.',
    );
    if (result) onClose();
  };

  const remove = async () => {
    await clear.mutateAsync(date);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={dayLabel(date).replace(/^./, (c) => c.toUpperCase())} description="Présence des ouvriers sur le chantier ce jour-là.">
      <form onSubmit={submit} className="space-y-4">
        {readOnly && (
          <div className="flex items-start gap-2 rounded-card border border-concrete bg-concrete-light/60 px-3 py-2.5 text-xs text-ink-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lockedReason}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { value: true, label: 'Travaillé', icon: CalendarCheck, active: 'border-moss-300 bg-moss-50 text-moss-600' },
            { value: false, label: 'Non travaillé', icon: CalendarOff, active: 'border-ink-300 bg-concrete-light text-ink-700' },
          ].map((option) => {
            const Icon = option.icon;
            const selected = isWorked === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                disabled={readOnly}
                onClick={() => setIsWorked(option.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3.5 text-sm font-medium transition-all disabled:cursor-default',
                  selected ? `${option.active} shadow-card` : 'border-concrete bg-white text-ink-500 hover:border-concrete-dark',
                )}
              >
                <Icon className="h-5 w-5" />
                {option.label}
              </button>
            );
          })}
        </div>

        {isWorked && (
          <>
            <FormField label="Nombre d'ouvriers présents" htmlFor="wd-workers" required hint="Effectif total sur le chantier ce jour-là.">
              <Input
                id="wd-workers"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
                disabled={readOnly}
                placeholder="Ex. 8"
              />
            </FormField>

            <FormField label="Étape du chantier" htmlFor="wd-phase" required>
              <Select id="wd-phase" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={readOnly}>
                <option value="">Choisir l&apos;étape en cours...</option>
                {selectable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isActive ? '' : ' (désactivée)'}
                  </option>
                ))}
              </Select>
              {selectable.length === 0 && <p className="text-xs text-clay-500">Aucune étape : ajoutez-en depuis « Gérer les étapes ».</p>}
            </FormField>
          </>
        )}

        {!isWorked && (
          <FormField label="Cause de l'arrêt" htmlFor="wd-stop" hint="Sert à expliquer les retards dans le rapport du mois.">
            <Select id="wd-stop" value={stopReason} onChange={(e) => setStopReason(e.target.value as typeof stopReason)} disabled={readOnly}>
              <option value="">Non précisée</option>
              {(Object.keys(stopReasonLabels) as (keyof typeof stopReasonLabels)[])
                .filter((k) => k !== 'UNSPECIFIED')
                .map((k) => (
                  <option key={k} value={k}>
                    {stopReasonLabels[k]}
                  </option>
                ))}
            </Select>
          </FormField>
        )}

        <FormField label={isWorked ? 'Note (facultatif)' : 'Précision (facultatif)'} htmlFor="wd-note">
          <Textarea
            id="wd-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={readOnly}
            placeholder={isWorked ? 'Ex. coulage de la dalle' : 'Ex. pluie, jour férié, livraison en retard...'}
          />
        </FormField>

        <div className="flex items-center justify-between gap-2 pt-1">
          {entry && !readOnly ? (
            <Button type="button" variant="ghost" size="sm" onClick={remove} loading={clear.isPending} className="text-clay-600 hover:bg-clay-50">
              <Trash2 className="h-4 w-4" /> Effacer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {readOnly ? 'Fermer' : 'Annuler'}
            </Button>
            {!readOnly && (
              <Button type="submit" loading={saving || locating} disabled={!valid}>
                Enregistrer
              </Button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
