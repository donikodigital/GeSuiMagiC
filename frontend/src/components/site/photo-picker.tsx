//frontend/src/components/site/photo-picker.tsx
'use client';

import * as React from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { prepareImage, validateFile } from '@/lib/image';
import type { OutboxFile } from '@/lib/offline/outbox';

/** Photos / pieces choisies avant l'enregistrement ; elles partent avec la saisie (ou attendent le reseau). */
export function PhotoPicker({ files, onChange, max = 6, label = 'Photos' }: { files: File[]; onChange: (files: File[]) => void; max?: number; label?: string }) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const previews = React.useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  React.useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const add = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const next = [...files];
      for (const file of Array.from(list)) {
        if (next.length >= max) {
          toast.error(`${max} fichiers au maximum.`);
          break;
        }
        const problem = validateFile(file);
        if (problem) {
          toast.error(`${file.name} : ${problem}`);
          continue;
        }
        next.push(await prepareImage(file));
      }
      onChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-700">{label}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy || files.length >= max} className="inline-flex items-center gap-1.5 rounded-full border border-blueprint-200 bg-white px-3 py-1.5 text-xs font-medium text-blueprint-600 transition-colors hover:bg-blueprint-50 disabled:opacity-50">
            <Camera className="h-3.5 w-3.5" /> Prendre
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || files.length >= max} className="inline-flex items-center gap-1.5 rounded-full border border-concrete bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-concrete-light disabled:opacity-50">
            <ImagePlus className="h-3.5 w-3.5" /> Joindre
          </button>
        </div>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf" multiple className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      {files.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-xl border border-concrete bg-concrete-light shadow-card">
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- apercu local (blob:), pas une image du site
                <img src={previews[i] as string} alt={file.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-ink-500">{file.name}</span>
              )}
              <button type="button" aria-label="Retirer" onClick={() => onChange(files.filter((_, idx) => idx !== i))} className="absolute right-1 top-1 rounded-full bg-ink-900/70 p-1 text-white opacity-90 hover:bg-ink-900">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-concrete-dark px-3 py-3 text-center text-xs text-ink-400">Aucune photo. Elles sont horodatées et fonctionnent sans réseau.</p>
      )}
    </div>
  );
}

/** Fichiers choisis -> fichiers de la file hors ligne (instant de prise de vue = date du fichier). */
export function toOutboxFiles(files: File[], kind: string): OutboxFile[] {
  return files.map((file) => ({ blob: file, name: file.name, kind, capturedAt: new Date(file.lastModified || Date.now()).toISOString() }));
}
