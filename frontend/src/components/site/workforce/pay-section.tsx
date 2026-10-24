//frontend/src/components/site/workforce/pay-section.tsx
'use client';

import * as React from 'react';
import { BadgeCheck, FilePlus2, Hammer, Plus, Send, Trash2, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { CategorySelect } from '@/components/site/category-select';
import { SectionHeader } from '@/components/site/section-header';
import { useAuth } from '@/hooks/use-auth';
import { usePayRun, usePayRuns, useSiteMutation, useWorkers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { newClientRef } from '@/lib/geo';
import { expenseStatusMeta, formatMoney } from '@/lib/format';
import { currentMonth, todayIso } from '@/lib/month';
import { formatDay, formatQty, payRunStatusMeta, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { PayLineEdit, PayRun, PayRunLine, Worker } from '@/types/site';

/** Paie par periode : brouillon genere depuis les presences, ajustable, puis valide en une depense. */
export function PaySection({ projectId, currency, permissions }: { projectId: string; currency: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = usePayRuns(projectId);
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les paies." />;
  const money = (v: string | number) => formatMoney(v, currency);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Paie des ouvriers"
        description="La paie d'une période est préparée à partir des présences, puis validée : une dépense du montant brut est alors créée pour le client."
        action={
          permissions.fieldWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> Préparer une paie
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Aucune paie" description="Enregistrez les présences, puis préparez la paie de la période : elle est calculée automatiquement." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((run, i) => {
            const meta = payRunStatusMeta[run.status];
            const expense = run.expenseStatus ? expenseStatusMeta[run.expenseStatus] : null;
            return (
              <button key={run.id} type="button" onClick={() => setOpenId(run.id)} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in text-left transition-transform hover:-translate-y-0.5">
                <Card className="h-full rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-400">Paie n°{run.number}</p>
                      <p className="truncate font-medium text-ink-900">{run.label}</p>
                      <p className="text-xs text-ink-400">
                        {formatDay(run.periodStart, 'd MMM')} → {formatDay(run.periodEnd, 'd MMM yyyy')}
                      </p>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-concrete pt-3 text-center">
                    <div>
                      <p className="font-ledger text-sm font-semibold text-ink-900">{money(run.totalGross)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Brut</p>
                    </div>
                    <div>
                      <p className="font-ledger text-sm font-semibold text-safety-500">{money(run.totalAdvance)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Avances</p>
                    </div>
                    <div>
                      <p className="font-ledger text-sm font-semibold text-moss-600">{money(run.totalNet)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Net versé</p>
                    </div>
                  </div>
                  {expense && <p className="mt-2.5 text-xs text-ink-500">Dépense : <span className="font-medium">{expense.label}</span></p>}
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <CreatePayRunDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} onCreated={(id) => setOpenId(id)} />
      <PayRunDialog id={openId} onClose={() => setOpenId(null)} projectId={projectId} currency={currency} permissions={permissions} />
    </div>
  );
}

function CreatePayRunDialog({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: (id: string) => void }) {
  const create = useSiteMutation(projectId, (v: { label: string; periodStart: string; periodEnd: string }) => siteService.createPayRun(projectId, v), { success: 'Brouillon de paie préparé.', error: 'Impossible de préparer la paie.' });
  const [label, setLabel] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  React.useEffect(() => {
    if (open) {
      const month = currentMonth();
      setLabel('');
      setStart(`${month}-01`);
      setEnd(todayIso());
    }
  }, [open]);
  const valid = label.trim().length >= 3 && !!start && !!end && start <= end && end <= todayIso();
  return (
    <Dialog open={open} onClose={onClose} title="Préparer une paie" description="Une ligne est créée pour chaque ouvrier présent sur la période.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const run = await create.mutateAsync({ label: label.trim(), periodStart: start, periodEnd: end });
          onClose();
          onCreated(run.id);
        }}
      >
        <FormField label="Intitulé" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={150} placeholder="Ex. : Quinzaine du 1er au 15 octobre" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Du" required>
            <Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <FormField label="Au" required>
            <Input type="date" value={end} min={start || undefined} max={todayIso()} onChange={(e) => setEnd(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Préparer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface Draft {
  workerId: string;
  name: string;
  trade: string | null;
  days: string;
  rate: string;
  task: string;
  advance: string;
  note: string;
}

const draftOf = (line: PayRunLine): Draft => {
  const isTask = line.note === 'Marché à la tâche';
  return { workerId: line.workerId, name: line.workerName, trade: line.trade, days: String(toNum(line.daysWorked)), rate: String(toNum(line.dailyRate)), task: isTask ? String(toNum(line.grossAmount)) : '', advance: String(toNum(line.advanceDeducted)), note: isTask ? '' : (line.note ?? '') };
};

function PayRunDialog({ id, onClose, projectId, currency, permissions }: { id: string | null; onClose: () => void; projectId: string; currency: string; permissions: SitePermissions }) {
  const { data: run, isLoading } = usePayRun(projectId, id);
  const workers = useWorkers(projectId);
  const { isSupervisor } = useAuth();
  const edit = useSiteMutation(projectId, (v: { id: string; lines: PayLineEdit[] }) => siteService.editPayRunLines(projectId, v.id, v.lines), { success: 'Brouillon enregistré.', error: "Impossible d'enregistrer le brouillon." });
  const remove = useSiteMutation(projectId, (rid: string) => siteService.deletePayRun(projectId, rid), { success: 'Brouillon supprimé.', error: 'Impossible de supprimer le brouillon.' });
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (run) {
      setDrafts(run.lines.map(draftOf));
      setDirty(false);
    }
  }, [run]);

  if (!id) return null;
  const money = (v: string | number) => formatMoney(v, currency);
  const editable = !!run && run.status === 'DRAFT' && permissions.fieldWrite;
  const advanceOf = (workerId: string) => toNum(workers.data?.find((w) => w.id === workerId)?.advanceBalance);

  const preview = (d: Draft) => {
    const gross = d.task ? toNum(d.task) : toNum(d.days) * toNum(d.rate);
    const advance = Math.min(toNum(d.advance), gross);
    return { gross, net: gross - advance };
  };
  const totals = drafts.reduce((acc, d) => ({ gross: acc.gross + preview(d).gross, net: acc.net + preview(d).net }), { gross: 0, net: 0 });
  const patch = (workerId: string, p: Partial<Draft>) => {
    setDrafts(drafts.map((d) => (d.workerId === workerId ? { ...d, ...p } : d)));
    setDirty(true);
  };
  const missing = workers.data?.filter((w) => w.isActive && !drafts.some((d) => d.workerId === w.id)) ?? [];
  const toPayload = (): PayLineEdit[] =>
    drafts.map((d) => ({ workerId: d.workerId, daysWorked: toNum(d.days), dailyRate: toNum(d.rate), taskAmount: d.task ? toNum(d.task) : undefined, advanceDeducted: toNum(d.advance), note: d.note.trim() || undefined }));

  return (
    <Dialog open onClose={onClose} title={run ? `Paie n°${run.number} · ${run.label}` : 'Paie'} description={run ? `Du ${formatDay(run.periodStart)} au ${formatDay(run.periodEnd)}` : undefined} maxWidth="max-w-3xl">
      {isLoading || !run ? (
        <PageSpinner />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2.5">
            {(editable ? drafts : run.lines.map(draftOf)).map((d) => {
              const p = preview(d);
              const due = advanceOf(d.workerId);
              return (
                <li key={d.workerId} className="rounded-xl border border-concrete bg-paper/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{d.name}</p>
                      <p className="truncate text-xs text-ink-400">{d.trade ?? '—'}{d.task ? ' · marché à la tâche' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-ledger text-sm font-semibold text-moss-600">{money(p.net)}</p>
                      <p className="text-[10px] text-ink-400">brut {money(p.gross)}</p>
                    </div>
                  </div>
                  {editable ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <FormField label="Jours">
                        <Input type="number" inputMode="decimal" min={0} max={366} step="0.5" value={d.days} disabled={!!d.task} onChange={(e) => patch(d.workerId, { days: e.target.value })} />
                      </FormField>
                      <FormField label="Taux / jour">
                        <Input type="number" inputMode="decimal" min={0} step="0.01" value={d.rate} disabled={!!d.task} onChange={(e) => patch(d.workerId, { rate: e.target.value })} />
                      </FormField>
                      <FormField label="Forfait (tâche)">
                        <Input type="number" inputMode="decimal" min={0} step="0.01" value={d.task} placeholder="—" onChange={(e) => patch(d.workerId, { task: e.target.value })} />
                      </FormField>
                      <FormField label="Avance retenue" hint={due > 0 ? `dû : ${money(due)}` : undefined}>
                        <Input type="number" inputMode="decimal" min={0} max={due} step="0.01" value={d.advance} onChange={(e) => patch(d.workerId, { advance: e.target.value })} />
                      </FormField>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-500">
                      {formatQty(d.days)} jour(s) × {money(d.rate)}
                      {toNum(d.advance) > 0 ? ` · avance retenue ${money(d.advance)}` : ''}
                    </p>
                  )}
                  {editable && (
                    <button type="button" className="mt-1 text-xs text-clay-500 hover:underline" onClick={() => { setDrafts(drafts.filter((x) => x.workerId !== d.workerId)); setDirty(true); }}>
                      Retirer de cette paie
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {editable && missing.length > 0 && (
            <Select
              value=""
              onChange={(e) => {
                const w = missing.find((m) => m.id === e.target.value) as Worker | undefined;
                if (!w) return;
                setDrafts([...drafts, { workerId: w.id, name: w.fullName, trade: w.trade, days: '0', rate: String(toNum(w.dailyRate)), task: '', advance: '0', note: '' }]);
                setDirty(true);
              }}
              aria-label="Ajouter un ouvrier à la paie"
            >
              <option value="">+ Ajouter un ouvrier absent de la période (marché à la tâche…)</option>
              {missing.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName}
                </option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-blueprint-50/60 px-4 py-3 text-center">
            <div>
              <p className="font-ledger text-base font-bold text-ink-900">{money(editable ? totals.gross : run.totalGross)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Brut (dépense)</p>
            </div>
            <div>
              <p className="font-ledger text-base font-bold text-safety-500">{money(editable ? totals.gross - totals.net : run.totalAdvance)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Avances retenues</p>
            </div>
            <div>
              <p className="font-ledger text-base font-bold text-moss-600">{money(editable ? totals.net : run.totalNet)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Net à verser</p>
            </div>
          </div>

          {run.status === 'SUBMITTED' && (
            <p className="flex items-center gap-2 rounded-xl bg-moss-50 px-3 py-2.5 text-sm text-moss-600">
              <BadgeCheck className="h-4 w-4" /> Paie validée{run.expenseStatus ? ` — dépense ${expenseStatusMeta[run.expenseStatus].label.toLowerCase()}` : ''}.
            </p>
          )}

          {editable && (
            <div className="flex flex-wrap justify-between gap-2 border-t border-concrete pt-4">
              <Button type="button" variant="ghost" onClick={() => setDeleting(true)}>
                <Trash2 className="h-4 w-4 text-clay-500" /> Supprimer le brouillon
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" loading={edit.isPending} disabled={!dirty} onClick={() => edit.mutate({ id: run.id, lines: toPayload() })}>
                  Enregistrer
                </Button>
                {isSupervisor && (
                  <Button type="button" disabled={dirty || drafts.length === 0} onClick={() => setSubmitting(true)} title={dirty ? "Enregistrez d'abord vos modifications" : undefined}>
                    <Send className="h-4 w-4" /> Valider la paie
                  </Button>
                )}
              </div>
            </div>
          )}
          {editable && !isSupervisor && <p className="text-xs text-ink-400">Seul le superviseur valide la paie (elle est comptabilisée comme une dépense).</p>}
        </div>
      )}
      {run && <SubmitDialog open={submitting} onClose={() => setSubmitting(false)} projectId={projectId} run={run} currency={currency} onDone={onClose} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!run) return;
          await remove.mutateAsync(run.id).catch(() => undefined);
          setDeleting(false);
          onClose();
        }}
        title="Supprimer ce brouillon ?"
        description="Les présences et les avances ne sont pas modifiées."
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
      />
    </Dialog>
  );
}

function SubmitDialog({ open, onClose, projectId, run, currency, onDone }: { open: boolean; onClose: () => void; projectId: string; run: PayRun; currency: string; onDone: () => void }) {
  const submit = useSiteMutation(projectId, (v: { categoryId: string; note?: string }) => siteService.submitPayRun(projectId, run.id, { ...v, clientRef: newClientRef() }), { success: 'Paie validée : la dépense est créée.', error: 'Impossible de valider la paie.' });
  const [categoryId, setCategoryId] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setCategoryId('');
      setNote('');
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Valider la paie" description={`Une dépense de ${formatMoney(run.totalGross, currency)} sera créée pour validation du client.`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!categoryId) return;
          await submit.mutateAsync({ categoryId, note: note.trim() || undefined });
          onClose();
          onDone();
        }}
      >
        <FormField label="Catégorie de dépense" required>
          <CategorySelect value={categoryId} onChange={setCategoryId} guess={/main.?d.?(oe|œ)uvre|ouvrier|paie|salaire/i} />
        </FormField>
        <FormField label="Remarque pour le client">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={submit.isPending} disabled={!categoryId}>
            <Hammer className="h-4 w-4" /> Valider
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
