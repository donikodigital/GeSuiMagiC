//frontend/src/components/site/progress/phase-progress-cards.tsx
'use client';

import * as React from 'react';
import { CheckCircle2, ClipboardCheck, Hammer, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Textarea } from '@/components/ui/input';
import { ProgressBar } from '@/components/site/progress-bar';
import { ProgressDialog } from '@/components/site/progress/progress-dialog';
import { useSiteMutation } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatDateTime } from '@/lib/format';
import { formatDay, scheduleStatusMeta } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Planning, ProgressUpdate, PhaseProgress } from '@/types/site';

function toneFor(percent: number) {
  return percent >= 100 ? 'moss' : 'blueprint';
}

/** Une carte par etape : avancement valide, attendu d'apres le planning, declaration. */
export function PhaseProgressCards({ projectId, phases, planning, permissions }: { projectId: string; phases: PhaseProgress[]; planning?: Planning; permissions: SitePermissions }) {
  const [target, setTarget] = React.useState<PhaseProgress | null>(null);
  const schedule = new Map((planning?.phases ?? []).map((p) => [p.id, p]));
  const active = phases.filter((p) => p.isActive);

  if (active.length === 0) return null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((phase, i) => {
          const s = schedule.get(phase.id);
          const meta = s ? scheduleStatusMeta[s.status] : null;
          return (
            <Card key={phase.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
                    <Hammer className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{phase.name}</p>
                    {s && (s.plannedStart || s.plannedEnd) && <p className="truncate text-xs text-ink-400">{formatDay(s.plannedStart ?? s.plannedEnd, 'd MMM')} → {formatDay(s.plannedEnd ?? s.plannedStart, 'd MMM yyyy')}</p>}
                  </div>
                </div>
                <p className="font-ledger text-2xl font-bold text-ink-900">{phase.progressPercent}<span className="text-sm font-semibold text-ink-400"> %</span></p>
              </div>
              <ProgressBar className="mt-3" value={phase.progressPercent} tone={toneFor(phase.progressPercent)} marker={s?.expectedPercent} />
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                {meta ? <StatusBadge label={s && s.delayDays > 0 && s.status !== 'DONE' ? `${meta.label} · ${s.delayDays} j` : meta.label} tone={meta.tone} /> : <span />}
                {permissions.fieldWrite && (
                  <Button size="sm" variant="outline" onClick={() => setTarget(phase)}>
                    Déclarer l&apos;avancement
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <ProgressDialog open={target !== null} onClose={() => setTarget(null)} projectId={projectId} phase={target} />
    </>
  );
}

/** Declarations en attente : valider ou refuser (jamais par leur auteur — le serveur le refuse). */
export function PendingUpdates({ projectId, updates, permissions, currentUserId }: { projectId: string; updates: ProgressUpdate[]; permissions: SitePermissions; currentUserId?: string }) {
  const [refusing, setRefusing] = React.useState<ProgressUpdate | null>(null);
  const [note, setNote] = React.useState('');
  const decide = useSiteMutation(projectId, (v: { updateId: string; decision: 'VALIDATED' | 'REJECTED'; note?: string }) => siteService.decideProgress(projectId, v.updateId, { decision: v.decision, note: v.note }), {
    success: (d) => (d.status === 'VALIDATED' ? 'Avancement validé.' : 'Avancement refusé.'),
    error: "Impossible de traiter l'avancement.",
  });

  if (updates.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-safety-500" />
        <h2 className="font-display text-lg font-semibold text-ink-900">À valider ({updates.length})</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {updates.map((u) => {
          const mine = u.submittedById === currentUserId && !permissions.isClient && permissions.role !== 'SUPERADMIN';
          return (
            <Card key={u.id} className="rounded-2xl border-safety-200 bg-safety-50/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{u.phaseName}</p>
                  <p className="text-xs text-ink-500">
                    {u.submittedByName ?? 'Superviseur'} · {formatDateTime(u.createdAt)}
                  </p>
                </div>
                <p className="font-ledger text-2xl font-bold text-safety-500">{u.percent} %</p>
              </div>
              {u.note && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-ink-700">{u.note}</p>}
              {permissions.decide && !mine && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1" loading={decide.isPending} onClick={() => decide.mutate({ updateId: u.id, decision: 'VALIDATED' })}>
                    <CheckCircle2 className="h-4 w-4" /> Valider
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setNote(''); setRefusing(u); }}>
                    <XCircle className="h-4 w-4" /> Refuser
                  </Button>
                </div>
              )}
              {mine && <p className="mt-2 text-xs text-ink-500">Un autre responsable doit valider votre déclaration.</p>}
            </Card>
          );
        })}
      </div>
      <Dialog open={refusing !== null} onClose={() => setRefusing(null)} title="Refuser cet avancement" description={refusing ? `${refusing.phaseName} · ${refusing.percent} %` : undefined}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!refusing || note.trim().length < 3) return;
            await decide.mutateAsync({ updateId: refusing.id, decision: 'REJECTED', note: note.trim() });
            setRefusing(null);
          }}
        >
          <FormField label="Motif du refus" required>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ex. : le ferraillage n'est pas terminé, pourcentage surévalué." />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRefusing(null)}>
              Annuler
            </Button>
            <Button type="submit" variant="danger" loading={decide.isPending} disabled={note.trim().length < 3}>
              Refuser
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
