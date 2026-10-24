//frontend/src/components/site/journal/site-log-dialog.tsx
'use client';

import * as React from 'react';
import { MapPin } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { PhaseSelect } from '@/components/site/phase-select';
import { PhotoPicker, toOutboxFiles } from '@/components/site/photo-picker';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { getPosition, newClientRef } from '@/lib/geo';
import { todayIso } from '@/lib/month';
import { weatherLabels } from '@/lib/site-format';
import type { WeatherCondition } from '@/types/site';

/** Nouvelle entree du journal : texte, meteo, etape, photos horodatees et position — fonctionne sans reseau. */
export function SiteLogDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [weather, setWeather] = React.useState<WeatherCondition | ''>('');
  const [phaseId, setPhaseId] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [locating, setLocating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setContent('');
      setDate(todayIso());
      setWeather('');
      setPhaseId('');
      setFiles([]);
    }
  }, [open]);

  const valid = title.trim().length >= 2 && content.trim().length >= 2;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setLocating(true);
    const position = await getPosition();
    setLocating(false);
    const result = await submit(
      {
        kind: 'site-log',
        label: `Journal : ${title.trim()}`,
        method: 'POST',
        path: `/projects/${projectId}/site-logs`,
        body: {
          date,
          title: title.trim(),
          content: content.trim(),
          weather: weather || undefined,
          phaseId: phaseId || undefined,
          latitude: position?.latitude,
          longitude: position?.longitude,
          clientRef: newClientRef(),
        },
        files: toOutboxFiles(files, 'photo'),
        attach: { mode: 'entity', entityType: 'SiteLog' },
      },
      'Entrée ajoutée au journal.',
    );
    if (result) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Nouvelle entrée du journal" description="Ce qui s'est passé sur le chantier aujourd'hui, avec photos." maxWidth="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Titre" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="Ex. : coulage de la dalle du rez-de-chaussée" />
        </FormField>
        <FormField label="Compte rendu" required>
          <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} placeholder="Travaux réalisés, effectif, livraisons, problèmes rencontrés, visites…" />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Date">
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Météo">
            <Select value={weather} onChange={(e) => setWeather(e.target.value as WeatherCondition | '')}>
              <option value="">Non précisée</option>
              {(Object.keys(weatherLabels) as WeatherCondition[]).map((w) => (
                <option key={w} value={w}>
                  {weatherLabels[w]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Étape">
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
          </FormField>
        </div>
        <PhotoPicker files={files} onChange={setFiles} />
        <p className="flex items-center gap-1.5 text-xs text-ink-400">
          <MapPin className="h-3.5 w-3.5" /> Votre position est enregistrée avec l&apos;entrée pour confirmer votre présence sur le chantier.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending || locating} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
