//frontend/src/components/site/quality/snag-dialogs.tsx
'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { PhaseSelect } from '@/components/site/phase-select';
import { PhotoPicker, toOutboxFiles } from '@/components/site/photo-picker';
import { PhotoGallery } from '@/components/site/photo-gallery';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { StatusBadge } from '@/components/ui/badge';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { useSiteMutation } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { newClientRef } from '@/lib/geo';
import { formatDateTime } from '@/lib/format';
import { formatDay, snagSeverityMeta, snagStatusMeta } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Snag, SnagSeverity, SnagStatus } from '@/types/site';

/** Declaration d'une reserve (defaut constate) : localisation, gravite, echeance et photos — utilisable sans reseau. */
export function CreateSnagDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [severity, setSeverity] = React.useState<SnagSeverity>('MINOR');
  const [phaseId, setPhaseId] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setLocation('');
      setSeverity('MINOR');
      setPhaseId('');
      setDueDate('');
      setFiles([]);
    }
  }, [open]);

  const valid = title.trim().length >= 3;
  return (
    <Dialog open={open} onClose={onClose} title="Signaler une réserve" description="Un défaut ou une malfaçon à corriger avant la réception." maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const result = await submit(
            {
              kind: 'snag',
              label: `Réserve : ${title.trim()}`,
              method: 'POST',
              path: `/projects/${projectId}/snags`,
              body: { title: title.trim(), description: description.trim() || undefined, location: location.trim() || undefined, severity, phaseId: phaseId || undefined, dueDate: dueDate || undefined, clientRef: newClientRef() },
              files: toOutboxFiles(files, 'photo'),
              attach: { mode: 'entity', entityType: 'Snag' },
            },
            'Réserve enregistrée.',
          );
          if (result) onClose();
        }}
      >
        <FormField label="Défaut constaté" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. : fissure sur le mur du salon" />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Emplacement">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Ex. : salon, mur nord" />
          </FormField>
          <FormField label="Gravité">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as SnagSeverity)}>
              {(Object.keys(snagSeverityMeta) as SnagSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {snagSeverityMeta[s].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Étape">
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
          </FormField>
          <FormField label="À corriger avant le">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Détails">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
        </FormField>
        <PhotoPicker files={files} onChange={setFiles} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Fiche d'une reserve : historique, photos (avant / apres), declaration de levee, confirmation, reouverture. */
export function SnagDetailDialog({ snag, onClose, projectId, permissions }: { snag: Snag | null; onClose: () => void; projectId: string; permissions: SitePermissions }) {
  const transition = useSiteMutation(projectId, (v: { id: string; to: SnagStatus; note?: string }) => siteService.transitionSnag(projectId, v.id, { to: v.to, note: v.note }), { success: 'Réserve mise à jour.', error: 'Impossible de modifier la réserve.' });
  const [note, setNote] = React.useState('');
  React.useEffect(() => setNote(''), [snag?.id, snag?.status]);
  if (!snag) return null;

  const sev = snagSeverityMeta[snag.severity];
  const st = snagStatusMeta[snag.status];
  const go = async (to: SnagStatus) => {
    await transition.mutateAsync({ id: snag.id, to, note: note.trim() || undefined });
  };

  return (
    <Dialog open onClose={onClose} title={`Réserve n°${snag.number}`} description={snag.title} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={st.label} tone={st.tone} />
          <StatusBadge label={sev.label} tone={sev.tone} />
          {snag.overdue && <StatusBadge label="Échéance dépassée" tone="clay" />}
          {snag.phaseName && <StatusBadge label={snag.phaseName} tone="ink" />}
        </div>
        {snag.location && <p className="text-sm text-ink-700"><span className="font-medium">Emplacement :</span> {snag.location}</p>}
        {snag.description && <p className="whitespace-pre-line rounded-xl bg-concrete-light/60 px-3 py-2.5 text-sm text-ink-700">{snag.description}</p>}
        <ul className="space-y-1 text-xs text-ink-500">
          <li>Signalée par {snag.raisedByName ?? '—'} · {formatDateTime(snag.raisedAt)}</li>
          {snag.dueDate && <li>À corriger avant le {formatDay(snag.dueDate)}</li>}
          {snag.fixedAt && <li>Levée déclarée par {snag.fixedByName ?? '—'} · {formatDateTime(snag.fixedAt)}{snag.fixNote ? ` — « ${snag.fixNote} »` : ''}</li>}
          {snag.closedAt && <li>Clôturée par {snag.closedByName ?? '—'} · {formatDateTime(snag.closedAt)}{snag.closureNote ? ` — « ${snag.closureNote} »` : ''}</li>}
        </ul>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Photos</p>
          {permissions.contribute && snag.status !== 'CLOSED' ? (
            <AttachmentsSection target={{ projectId, entityType: 'Snag', entityId: snag.id }} kindOptions={[{ value: 'photo', label: 'Photo' }, { value: 'document', label: 'Document' }]} />
          ) : snag.attachments.length > 0 ? (
            <PhotoGallery attachments={snag.attachments} />
          ) : (
            <p className="text-xs text-ink-400">Aucune photo.</p>
          )}
        </div>

        {(snag.status !== 'CLOSED' || permissions.decide) && (
          <div className="space-y-3 border-t border-concrete pt-4">
            <FormField label="Commentaire" hint={snag.status !== 'OPEN' ? 'Obligatoire pour refuser la levée ou rouvrir la réserve.' : 'Facultatif.'}>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              {snag.status === 'OPEN' && permissions.fieldWrite && (
                <Button variant="outline" loading={transition.isPending} onClick={() => go('FIXED')}>
                  Déclarer la levée
                </Button>
              )}
              {snag.status !== 'CLOSED' && permissions.decide && (
                <Button loading={transition.isPending} onClick={() => go('CLOSED')}>
                  Confirmer la levée
                </Button>
              )}
              {snag.status !== 'OPEN' && permissions.decide && (
                <Button variant="danger" loading={transition.isPending} disabled={note.trim().length < 3} onClick={() => go('OPEN')}>
                  {snag.status === 'FIXED' ? 'Refuser la levée' : 'Rouvrir'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
