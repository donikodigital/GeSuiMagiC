//frontend/src/components/site/quality/reception-section.tsx
'use client';

import * as React from 'react';
import { CheckCircle2, Download, FileCheck2, FilePlus2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { SectionHeader } from '@/components/site/section-header';
import { errorText, useReceptions, useSiteMutation } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { todayIso } from '@/lib/month';
import { formatDay, receptionTypeLabels, snagSeverityMeta } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Reception, ReceptionType } from '@/types/site';

/** Proces-verbaux de reception : etape, provisoire, definitive. La liste des reserves non levees est figee dans le PV. */
export function ReceptionSection({ projectId, permissions }: { projectId: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useReceptions(projectId);
  const [creating, setCreating] = React.useState(false);
  const [signing, setSigning] = React.useState<Reception | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const sign = useSiteMutation(projectId, (id: string) => siteService.signReception(projectId, id), { success: 'Procès-verbal signé.', error: 'Impossible de signer le procès-verbal.' });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les réceptions." />;

  const download = async (r: Reception) => {
    setDownloading(r.id);
    try {
      await siteService.receptionPdf(projectId, r.id, r.number);
    } catch (error) {
      toast.error(errorText(error, 'Le téléchargement a échoué.'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Procès-verbaux de réception"
        description="Le PV fige la liste des réserves non levées au moment de la réception. Une fois signé par le client, il ne change plus."
        action={
          permissions.decide && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> Établir un PV
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="Aucune réception" description="Établissez un procès-verbal à la fin d'une étape, puis pour la réception provisoire et définitive." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((r, i) => (
            <Card key={r.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-400">PV n°{r.number} · {formatDay(r.date)}</p>
                  <p className="truncate font-medium text-ink-900">{receptionTypeLabels[r.type]}{r.phaseName ? ` · ${r.phaseName}` : ''}</p>
                </div>
                <StatusBadge label={r.signedAt ? 'Signé' : 'À signer'} tone={r.signedAt ? 'moss' : 'safety'} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={r.withReserves ? `Avec ${r.openSnagsCount} réserve${r.openSnagsCount > 1 ? 's' : ''}` : 'Sans réserve'} tone={r.withReserves ? 'clay' : 'moss'} />
                {r.signedAt && <span className="text-xs text-ink-400">Signé par {r.signerName ?? '—'} le {formatDay(r.signedAt)}</span>}
              </div>
              {r.withReserves && r.reservesSnapshot && (
                <ul className="mt-3 space-y-1.5 rounded-xl bg-concrete-light/60 px-3 py-2.5">
                  {r.reservesSnapshot.slice(0, 6).map((s) => (
                    <li key={s.number} className="flex items-center justify-between gap-2 text-xs text-ink-700">
                      <span className="min-w-0 truncate">n°{s.number} · {s.title}{s.location ? ` (${s.location})` : ''}</span>
                      <span className="shrink-0 text-ink-400">{snagSeverityMeta[s.severity as keyof typeof snagSeverityMeta]?.label ?? s.severity}</span>
                    </li>
                  ))}
                  {r.reservesSnapshot.length > 6 && <li className="text-xs text-ink-400">… et {r.reservesSnapshot.length - 6} autre(s) dans le PDF.</li>}
                </ul>
              )}
              {r.notes && <p className="mt-3 text-sm text-ink-600">{r.notes}</p>}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" loading={downloading === r.id} onClick={() => download(r)}>
                  <Download className="h-4 w-4" /> PV en PDF
                </Button>
                {!r.signedAt && permissions.owner && (
                  <Button size="sm" onClick={() => setSigning(r)}>
                    <PenLine className="h-4 w-4" /> Signer
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateReceptionDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} />
      <ConfirmDialog
        open={signing !== null}
        onClose={() => setSigning(null)}
        onConfirm={async () => {
          if (!signing) return;
          await sign.mutateAsync(signing.id).catch(() => undefined);
          setSigning(null);
        }}
        title="Signer ce procès-verbal ?"
        description={signing ? `${receptionTypeLabels[signing.type]} n°${signing.number}${signing.withReserves ? ` avec ${signing.openSnagsCount} réserve(s) non levée(s)` : ''}. Une fois signé, il ne peut plus être modifié.` : undefined}
        confirmLabel="Signer"
        loading={sign.isPending}
      />
    </div>
  );
}

function CreateReceptionDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const create = useSiteMutation(projectId, (v: Parameters<typeof siteService.createReception>[1]) => siteService.createReception(projectId, v), { success: 'Procès-verbal établi.', error: 'Impossible de créer le procès-verbal.' });
  const [type, setType] = React.useState<ReceptionType>('PHASE');
  const [phaseId, setPhaseId] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [attendees, setAttendees] = React.useState('');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setType('PHASE');
      setPhaseId('');
      setDate(todayIso());
      setAttendees('');
      setNotes('');
    }
  }, [open]);

  const valid = !!date && (type !== 'PHASE' || !!phaseId);
  return (
    <Dialog open={open} onClose={onClose} title="Établir un procès-verbal" description="Les réserves non levées seront jointes au PV." maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await create.mutateAsync({ type, phaseId: type === 'PHASE' ? phaseId : phaseId || undefined, date, attendees: attendees.trim() || undefined, notes: notes.trim() || undefined });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nature de la réception">
            <Select value={type} onChange={(e) => setType(e.target.value as ReceptionType)}>
              {(Object.keys(receptionTypeLabels) as ReceptionType[]).map((t) => (
                <option key={t} value={t}>
                  {receptionTypeLabels[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Étape concernée" required={type === 'PHASE'}>
          <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} emptyLabel={type === 'PHASE' ? 'Choisir une étape' : 'Ensemble du chantier'} />
        </FormField>
        <FormField label="Personnes présentes" hint="Une par ligne ou séparées par des virgules.">
          <Textarea rows={2} value={attendees} onChange={(e) => setAttendees(e.target.value)} maxLength={1000} />
        </FormField>
        <FormField label="Observations">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            <CheckCircle2 className="h-4 w-4" /> Établir le PV
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
