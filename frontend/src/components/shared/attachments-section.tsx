// frontend/src/components/shared/attachments-section.tsx - v2.2
// Fix : la v2.1 evitait le retour a la ligne des pastilles de categorie
// via overflow-x-auto, mais demande explicite de ne surtout pas avoir de
// scroll horizontal non plus. Remplace par flex-1 sur chaque pastille :
// elles se partagent desormais la largeur disponible a parts egales et
// leur libelle se tronque (truncate) si l'espace manque, plutot que de
// deborder ou de passer en scroll - garantit une seule ligne, toujours
// entierement visible, en toute circonstance de largeur d'ecran. Police
// et padding resserres (text-[11px], px-2) pour que meme "Documents
// administratifs" reste lisible tronque. Aucun autre changement (dropzone,
// validation, liste, suppression identiques a v2.1).

'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip, Trash2, UploadCloud, FileText, Image as ImageIcon } from 'lucide-react';
import { attachmentsService } from '@/services/attachments.service';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface AttachmentsSectionProps {
  target: { projectId?: string; depositId?: string; expenseId?: string };
  kindOptions?: { value: string; label: string }[];
  readOnly?: boolean;
}

const DEFAULT_KINDS = [
  { value: 'photo', label: 'Photo' },
  { value: 'facture', label: 'Facture' },
  { value: 'recu', label: 'Reçu' },
  { value: 'bon_livraison', label: 'Bon de livraison' },
  { value: 'document', label: 'Document' },
];

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_MB = 15;

export function AttachmentsSection({ target, kindOptions = DEFAULT_KINDS, readOnly }: AttachmentsSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState(kindOptions[0].value);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragCounter = React.useRef(0);

  const queryKey = ['attachments', target];
  const { data: attachments, isLoading } = useQuery({
    queryKey,
    queryFn: () => attachmentsService.listFor(target),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => attachmentsService.uploadAndRegister(file, kind, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Pièce jointe ajoutée.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Le téléversement a échoué.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => attachmentsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Pièce jointe supprimée.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const submitFile = (file: File) => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('Formats acceptés : JPG, PNG ou PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Le fichier dépasse la taille maximale autorisée (${MAX_FILE_SIZE_MB} Mo).`);
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) submitFile(file);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submitFile(file);
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {kindOptions.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                title={k.label}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-full border px-2 py-1.5 text-[11px] font-medium transition-colors',
                  kind === k.value
                    ? 'border-blueprint-600 bg-blueprint-600 text-white'
                    : 'border-concrete bg-white text-ink-500 hover:border-blueprint-200 hover:text-ink-800',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
              isDragging
                ? 'border-blueprint-500 bg-blueprint-50'
                : 'border-concrete-dark bg-paper/60 hover:border-blueprint-300 hover:bg-blueprint-50/40',
              uploadMutation.isPending && 'pointer-events-none opacity-60',
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
              <UploadCloud className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-ink-800">
              {uploadMutation.isPending ? 'Téléversement en cours...' : 'Glissez un fichier ici ou cliquez pour parcourir'}
            </p>
            <p className="text-xs text-ink-400">
              Catégorie : <span className="font-medium text-ink-500">{kindOptions.find((k) => k.value === kind)?.label}</span> · JPG, PNG ou
              PDF · 15 Mo max
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-concrete-light" />
          ))}
        </div>
      ) : attachments && attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((a, i) => {
            const isImage = a.mimeType.startsWith('image/');
            const kindLabel = kindOptions.find((k) => k.value === a.kind)?.label ?? DEFAULT_KINDS.find((k) => k.value === a.kind)?.label;
            return (
              <li
                key={a.id}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-card-in flex items-center gap-3 rounded-xl border border-concrete bg-white px-3.5 py-2.5 shadow-card transition-colors hover:border-blueprint-200"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    isImage ? 'bg-moss-50 text-moss-600' : 'bg-blueprint-50 text-blueprint-600',
                  )}
                >
                  {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>

                <a href={a.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 group">
                  <p className="truncate text-sm font-medium text-ink-800 group-hover:text-blueprint-600">{a.fileName}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                    {kindLabel && (
                      <>
                        <span>{kindLabel}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{formatDate(a.createdAt)}</span>
                  </div>
                </a>

                {!readOnly && (
                  <button
                    onClick={() => removeMutation.mutate(a.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-clay-50 hover:text-clay-500"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-concrete-dark px-4 py-8 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-concrete-light text-ink-400">
            <Paperclip className="h-4 w-4" />
          </span>
          <p className="text-sm text-ink-400">Aucun document pour l'instant.</p>
        </div>
      )}
    </div>
  );
}