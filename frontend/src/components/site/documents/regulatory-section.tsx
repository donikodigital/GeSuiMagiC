//frontend/src/components/site/documents/regulatory-section.tsx
'use client';

import * as React from 'react';
import { AlertTriangle, FileBadge2, Paperclip, Pencil, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { SectionHeader } from '@/components/site/section-header';
import { useProjectDocuments, useSiteMutation } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { daysLabel, documentStatusMeta, documentTypeLabels, formatDay } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { ProjectDocument, ProjectDocumentType } from '@/types/site';

/** Documents reglementaires (permis, assurances, garanties...) avec alerte avant expiration. */
export function RegulatorySection({ projectId, permissions }: { projectId: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useProjectDocuments(projectId);
  const [editing, setEditing] = React.useState<ProjectDocument | 'new' | null>(null);
  const [filesFor, setFilesFor] = React.useState<string | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les documents." />;
  const alerts = data.filter((d) => d.status === 'EXPIRED' || d.status === 'EXPIRING');

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Documents réglementaires"
        description="Permis de construire, assurances, garanties : renseignez la date d'expiration, vous êtes prévenu avant l'échéance."
        action={
          permissions.contribute && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          )
        }
      />
      {alerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-safety-50 px-4 py-3 text-sm text-safety-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {alerts.filter((d) => d.status === 'EXPIRED').length > 0 && <span className="font-semibold">{alerts.filter((d) => d.status === 'EXPIRED').length} document(s) expiré(s). </span>}
            {alerts.filter((d) => d.status === 'EXPIRING').length > 0 && <span>{alerts.filter((d) => d.status === 'EXPIRING').length} document(s) arrivent bientôt à échéance.</span>}
          </p>
        </div>
      )}
      {data.length === 0 ? (
        <EmptyState icon={<FileBadge2 className="h-6 w-6" />} title="Aucun document réglementaire" description="Ajoutez le permis, l'assurance décennale, les garanties… avec leurs dates d'expiration." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((d, i) => {
            const meta = documentStatusMeta[d.status];
            return (
              <Card key={d.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-400">
                      {documentTypeLabels[d.type]}
                      {d.reference ? ` · ${d.reference}` : ''}
                    </p>
                    <p className="truncate font-medium text-ink-900">{d.title}</p>
                  </div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  {d.issuedAt ? `Délivré le ${formatDay(d.issuedAt)}` : 'Date de délivrance non renseignée'}
                  {d.expiresAt ? ` · expire le ${formatDay(d.expiresAt)}` : ''}
                  {d.daysLeft !== null && d.status !== 'NO_EXPIRY' ? ` (${daysLabel(d.daysLeft)})` : ''}
                </p>
                {d.notes && <p className="mt-1.5 text-xs text-ink-500">{d.notes}</p>}
                <div className="mt-3 flex items-center justify-between border-t border-concrete pt-2.5">
                  <Button size="sm" variant="ghost" onClick={() => setFilesFor(filesFor === d.id ? null : d.id)}>
                    <Paperclip className="h-4 w-4" /> Pièces ({d.attachments.length})
                  </Button>
                  {permissions.decide && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                      <Pencil className="h-4 w-4" /> Modifier
                    </Button>
                  )}
                </div>
                {filesFor === d.id && (
                  <div className="mt-3 border-t border-concrete pt-3">
                    <AttachmentsSection
                      target={{ projectId, entityType: 'ProjectDocument', entityId: d.id }}
                      kindOptions={[
                        { value: 'document', label: 'Scan du document' },
                        { value: 'photo', label: 'Photo' },
                      ]}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <DocumentDialog target={editing} onClose={() => setEditing(null)} projectId={projectId} />
    </div>
  );
}

function DocumentDialog({ target, onClose, projectId }: { target: ProjectDocument | 'new' | null; onClose: () => void; projectId: string }) {
  const existing = target && target !== 'new' ? target : null;
  const save = useSiteMutation(
    projectId,
    (v: { type: ProjectDocumentType; title: string; reference?: string; issuedAt?: string; expiresAt?: string; notes?: string }) =>
      existing ? siteService.updateDocument(projectId, existing.id, v) : siteService.createDocument(projectId, v),
    { success: existing ? 'Document mis à jour.' : 'Document ajouté : joignez-en le scan depuis sa carte.', error: "Impossible d'enregistrer le document." },
  );
  const [type, setType] = React.useState<ProjectDocumentType>('PERMIT');
  const [title, setTitle] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [issuedAt, setIssuedAt] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [notes, setNotes] = React.useState('');
  React.useEffect(() => {
    if (!target) return;
    setType(existing?.type ?? 'PERMIT');
    setTitle(existing?.title ?? '');
    setReference(existing?.reference ?? '');
    setIssuedAt(existing?.issuedAt?.slice(0, 10) ?? '');
    setExpiresAt(existing?.expiresAt?.slice(0, 10) ?? '');
    setNotes(existing?.notes ?? '');
  }, [target, existing]);
  if (!target) return null;
  const valid = title.trim().length >= 3 && (!issuedAt || !expiresAt || issuedAt <= expiresAt);

  return (
    <Dialog open onClose={onClose} title={existing ? 'Modifier le document' : 'Nouveau document réglementaire'} maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await save.mutateAsync({ type, title: title.trim(), reference: reference.trim() || undefined, issuedAt: issuedAt || undefined, expiresAt: expiresAt || undefined, notes: notes.trim() || undefined });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Type" required>
            <Select value={type} onChange={(e) => setType(e.target.value as ProjectDocumentType)}>
              {(Object.keys(documentTypeLabels) as ProjectDocumentType[]).map((t) => (
                <option key={t} value={t}>
                  {documentTypeLabels[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Intitulé" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. : Permis de construire" />
          </FormField>
          <FormField label="Référence / numéro">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </FormField>
          <span className="hidden sm:block" />
          <FormField label="Délivré le">
            <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </FormField>
          <FormField label="Expire le" hint="Une alerte est envoyée avant l'échéance.">
            <Input type="date" value={expiresAt} min={issuedAt || undefined} onChange={(e) => setExpiresAt(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Remarques">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
