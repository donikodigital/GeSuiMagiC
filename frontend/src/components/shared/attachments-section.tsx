'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip, Trash2, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { attachmentsService } from '@/services/attachments.service';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

interface AttachmentsSectionProps {
  target: { projectId?: string; depositId?: string; expenseId?: string };
  kindOptions?: { value: string; label: string }[];
  readOnly?: boolean;
}

const DEFAULT_KINDS = [
  { value: 'photo', label: 'Photo' },
  { value: 'facture', label: 'Facture' },
  { value: 'recu', label: 'Recu' },
  { value: 'bon_livraison', label: 'Bon de livraison' },
  { value: 'document', label: 'Document' },
];

export function AttachmentsSection({ target, kindOptions = DEFAULT_KINDS, readOnly }: AttachmentsSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState(kindOptions[0].value);

  const queryKey = ['attachments', target];
  const { data: attachments, isLoading } = useQuery({
    queryKey,
    queryFn: () => attachmentsService.listFor(target),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => attachmentsService.uploadAndRegister(file, kind, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Piece jointe ajoutee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Le televersement a echoue.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => attachmentsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Piece jointe supprimee.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Suppression impossible.'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-concrete-dark bg-white px-2 text-sm">
            {kindOptions.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending}>
            <Upload className="h-4 w-4" /> Ajouter un fichier
          </Button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={handleFileChange} />
          <span className="text-xs text-ink-400">JPG, PNG ou PDF - 15 Mo max</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-400">Chargement...</p>
      ) : attachments && attachments.length > 0 ? (
        <ul className="divide-y divide-concrete rounded-card border border-concrete bg-white">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <a href={a.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-ink-800 hover:text-blueprint-600">
                {a.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-ink-400" /> : <FileText className="h-4 w-4 shrink-0 text-ink-400" />}
                <span className="truncate">{a.fileName}</span>
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-ink-400">{formatDate(a.createdAt)}</span>
                {!readOnly && (
                  <button onClick={() => removeMutation.mutate(a.id)} className="text-ink-300 hover:text-clay-500" aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 rounded-card border border-dashed border-concrete-dark px-4 py-6 text-sm text-ink-400">
          <Paperclip className="h-4 w-4" /> Aucune piece jointe.
        </div>
      )}
    </div>
  );
}
