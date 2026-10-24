//frontend/src/components/site/workforce/workers-section.tsx
'use client';

import * as React from 'react';
import { HandCoins, Pencil, Phone, UserPlus, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { SectionHeader } from '@/components/site/section-header';
import { useAdvances, useSiteMutation, useWorkers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatMoney } from '@/lib/format';
import { todayIso } from '@/lib/month';
import { formatDay, formatQty, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Worker } from '@/types/site';

/** Equipe du chantier : ouvriers nominatifs, taux journalier, avances en cours. */
export function WorkersSection({ projectId, currency, permissions }: { projectId: string; currency: string; permissions: SitePermissions }) {
  const [showInactive, setShowInactive] = React.useState(false);
  const { data, isLoading, isError } = useWorkers(projectId, showInactive);
  const [editing, setEditing] = React.useState<Worker | 'new' | null>(null);
  const [advance, setAdvance] = React.useState<Worker | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les ouvriers." />;
  const money = (v: string | number) => formatMoney(v, currency);
  const activeCount = data.filter((w) => w.isActive).length;
  const totalAdvance = data.reduce((s, w) => s + toNum(w.advanceBalance), 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Ouvriers du chantier"
        description="Chaque ouvrier est enregistré avec son taux journalier. Les présences et les avances alimentent la paie."
        action={
          permissions.fieldWrite && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <UserPlus className="h-4 w-4" /> Ajouter un ouvrier
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ouvriers actifs" value={String(activeCount)} />
        <StatCard label="Avances en cours" value={money(totalAdvance)} tone={totalAdvance > 0 ? 'safety' : 'default'} hint="à retenir sur les prochaines paies" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-500">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-concrete-dark accent-blueprint-600" /> Afficher aussi les ouvriers partis
      </label>

      {data.length === 0 ? (
        <EmptyState icon={<UserRound className="h-6 w-6" />} title="Aucun ouvrier enregistré" description="Ajoutez les ouvriers du chantier pour suivre leurs présences, leurs avances et leur paie." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((w, i) => (
            <Card key={w.id} style={{ animationDelay: `${i * 40}ms` }} className={`animate-card-in rounded-2xl p-4 ${w.isActive ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blueprint-50 font-display text-sm font-semibold text-blueprint-700">
                    {w.fullName
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{w.fullName}</p>
                    <p className="truncate text-xs text-ink-400">{w.trade ?? 'Métier non précisé'}</p>
                  </div>
                </div>
                {!w.isActive && <StatusBadge label="Parti" tone="ink" />}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-concrete pt-3 text-center">
                <div>
                  <p className="font-ledger text-sm font-semibold text-ink-900">{w.dailyRate ? money(w.dailyRate) : '—'}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Par jour</p>
                </div>
                <div>
                  <p className="font-ledger text-sm font-semibold text-ink-900">{formatQty(w.totalDays)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Jours</p>
                </div>
                <div>
                  <p className={`font-ledger text-sm font-semibold ${toNum(w.advanceBalance) > 0 ? 'text-safety-500' : 'text-ink-900'}`}>{money(w.advanceBalance)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Avance due</p>
                </div>
              </div>
              {(w.phone || w.startedAt) && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-400">
                  {w.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {w.phone}
                    </span>
                  )}
                  {w.startedAt && <span>Depuis le {formatDay(w.startedAt)}</span>}
                </p>
              )}
              {permissions.fieldWrite && (
                <div className="mt-3 flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(w)} title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {w.isActive && (
                    <Button size="sm" variant="outline" onClick={() => setAdvance(w)}>
                      <HandCoins className="h-4 w-4" /> Avance
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <WorkerDialog target={editing} onClose={() => setEditing(null)} projectId={projectId} currency={currency} />
      <AdvanceDialog worker={advance} onClose={() => setAdvance(null)} projectId={projectId} currency={currency} />
    </div>
  );
}

function WorkerDialog({ target, onClose, projectId, currency }: { target: Worker | 'new' | null; onClose: () => void; projectId: string; currency: string }) {
  const worker = target && target !== 'new' ? target : null;
  const save = useSiteMutation(projectId, (v: { id?: string; payload: Parameters<typeof siteService.createWorker>[1] }) => (v.id ? siteService.updateWorker(projectId, v.id, v.payload) : siteService.createWorker(projectId, v.payload)), {
    success: worker ? 'Ouvrier mis à jour.' : 'Ouvrier ajouté.',
    error: "Impossible d'enregistrer l'ouvrier.",
  });
  const [fullName, setFullName] = React.useState('');
  const [trade, setTrade] = React.useState('');
  const [rate, setRate] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (!target) return;
    setFullName(worker?.fullName ?? '');
    setTrade(worker?.trade ?? '');
    setRate(worker?.dailyRate ? String(toNum(worker.dailyRate)) : '');
    setPhone(worker?.phone ?? '');
    setNotes(worker?.notes ?? '');
    setActive(worker?.isActive ?? true);
  }, [target, worker]);

  if (!target) return null;
  const valid = fullName.trim().length >= 2;
  return (
    <Dialog open onClose={onClose} title={worker ? "Modifier l'ouvrier" : 'Ajouter un ouvrier'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await save.mutateAsync({
            id: worker?.id,
            payload: { fullName: fullName.trim(), trade: trade.trim() || undefined, dailyRate: rate ? toNum(rate) : undefined, phone: phone.trim() || undefined, notes: notes.trim() || undefined, ...(worker ? { isActive: active, leftAt: !active && worker.isActive ? todayIso() : undefined } : {}) },
          });
          onClose();
        }}
      >
        <FormField label="Nom complet" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Métier">
            <Input value={trade} onChange={(e) => setTrade(e.target.value)} maxLength={100} placeholder="Maçon, ferrailleur…" />
          </FormField>
          <FormField label={`Taux par jour (${currency})`}>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Téléphone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </FormField>
        <FormField label="Remarques">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FormField>
        {worker && (
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-concrete-dark accent-blueprint-600" /> Encore présent sur le chantier
          </label>
        )}
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

function AdvanceDialog({ worker, onClose, projectId, currency }: { worker: Worker | null; onClose: () => void; projectId: string; currency: string }) {
  const { data: advances } = useAdvances(projectId, worker?.id ?? null);
  const create = useSiteMutation(projectId, (v: { workerId: string; amount: number; note?: string }) => siteService.createAdvance(projectId, v.workerId, { amount: v.amount, note: v.note }), { success: 'Avance enregistrée.', error: "Impossible d'enregistrer l'avance." });
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    setAmount('');
    setNote('');
  }, [worker]);
  if (!worker) return null;
  return (
    <Dialog open onClose={onClose} title={`Avance · ${worker.fullName}`} description={`Avance en cours : ${formatMoney(worker.advanceBalance, currency)}. Elle sera retenue sur la prochaine paie.`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (toNum(amount) <= 0) return;
          await create.mutateAsync({ workerId: worker.id, amount: toNum(amount), note: note.trim() || undefined });
          setAmount('');
          setNote('');
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormField label={`Montant (${currency})`} required>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Motif">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={create.isPending} disabled={toNum(amount) <= 0}>
            Enregistrer l&apos;avance
          </Button>
        </div>
      </form>
      {advances && advances.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-concrete pt-3">
          {advances.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-600">
                {formatDay(a.date)}
                {a.note ? ` · ${a.note}` : ''}
              </span>
              <span className="font-ledger font-semibold text-ink-900">{formatMoney(a.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
