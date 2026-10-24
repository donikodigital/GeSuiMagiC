//frontend/src/components/site/progress/change-orders-section.tsx
'use client';

import * as React from 'react';
import { CalendarPlus, CheckCircle2, FilePlus2, FileSignature, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Textarea } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { SectionHeader } from '@/components/site/section-header';
import { useChangeOrders, useSiteMutation } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatDateTime, formatMoney } from '@/lib/format';
import { changeOrderStatusMeta, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { ChangeOrder } from '@/types/site';

/** Avenants : travaux ou delais supplementaires proposes par le chantier et valides par le client. */
export function ChangeOrdersSection({ projectId, currency, permissions }: { projectId: string; currency: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useChangeOrders(projectId);
  const [creating, setCreating] = React.useState(false);
  const [deciding, setDeciding] = React.useState<{ order: ChangeOrder; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [cancelling, setCancelling] = React.useState<ChangeOrder | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les avenants." />;
  const money = (v: string | number) => formatMoney(v, currency);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Avenants"
        description="Travaux supplémentaires ou modification de délai : une fois approuvé par le client, le surcoût s'ajoute au budget et le délai repousse la fin prévue."
        action={
          permissions.proposeChangeOrder ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> Proposer un avenant
            </Button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Surcoût approuvé" value={money(data.summary.approvedCost)} tone="moss" />
        <StatCard label="Délai ajouté" value={`${data.summary.approvedDays} j`} />
        <StatCard label="En attente" value={String(data.summary.pendingCount)} tone={data.summary.pendingCount > 0 ? 'safety' : 'default'} hint={money(data.summary.pendingCost)} />
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={<FileSignature className="h-6 w-6" />} title="Aucun avenant" description="Les travaux ou délais supplémentaires demandés en cours de chantier apparaissent ici, avec la décision du client." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.items.map((order, i) => {
            const meta = changeOrderStatusMeta[order.status];
            return (
              <Card key={order.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-400">Avenant n°{order.number}{order.phaseName ? ` · ${order.phaseName}` : ''}</p>
                    <p className="truncate font-medium text-ink-900">{order.title}</p>
                  </div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-ink-600">{order.description}</p>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="font-ledger font-semibold text-ink-900">+ {money(order.extraCost)}</span>
                  {order.extraDays > 0 && (
                    <span className="flex items-center gap-1 text-ink-600">
                      <CalendarPlus className="h-3.5 w-3.5" /> + {order.extraDays} j
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  Proposé par {order.requestedByName ?? '—'} · {formatDateTime(order.createdAt)}
                  {order.decidedAt ? ` · ${order.status === 'APPROVED' ? 'approuvé' : 'traité'} le ${formatDateTime(order.decidedAt)}${order.decidedByName ? ` par ${order.decidedByName}` : ''}` : ''}
                </p>
                {order.decisionNote && <p className="mt-2 rounded-xl bg-concrete-light px-3 py-2 text-xs text-ink-600">« {order.decisionNote} »</p>}
                {order.status === 'PENDING' && permissions.owner && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setDeciding({ order, decision: 'APPROVED' })}>
                      <CheckCircle2 className="h-4 w-4" /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDeciding({ order, decision: 'REJECTED' })}>
                      <XCircle className="h-4 w-4" /> Refuser
                    </Button>
                  </div>
                )}
                {order.status === 'APPROVED' && permissions.role === 'SUPERADMIN' && (
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(order)}>
                      Annuler cet avenant
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} currency={currency} />
      <DecisionDialog target={deciding} onClose={() => setDeciding(null)} projectId={projectId} currency={currency} />
      <CancelDialog order={cancelling} onClose={() => setCancelling(null)} projectId={projectId} />
    </div>
  );
}

function CreateDialog({ open, onClose, projectId, currency }: { open: boolean; onClose: () => void; projectId: string; currency: string }) {
  const create = useSiteMutation(projectId, (v: Parameters<typeof siteService.createChangeOrder>[1]) => siteService.createChangeOrder(projectId, v), { success: 'Avenant proposé au client.', error: "Impossible de créer l'avenant." });
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [cost, setCost] = React.useState('');
  const [days, setDays] = React.useState('');
  const [phaseId, setPhaseId] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setCost('');
      setDays('');
      setPhaseId('');
    }
  }, [open]);

  const valid = title.trim().length >= 3 && description.trim().length >= 3 && toNum(cost) >= 0 && cost !== '';
  return (
    <Dialog open={open} onClose={onClose} title="Proposer un avenant" description="Le client devra l'approuver avant qu'il ne modifie le budget.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await create.mutateAsync({ title: title.trim(), description: description.trim(), extraCost: toNum(cost), extraDays: days ? Math.round(toNum(days)) : undefined, phaseId: phaseId || undefined });
          onClose();
        }}
      >
        <FormField label="Objet" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. : terrasse supplémentaire côté jardin" />
        </FormField>
        <FormField label="Description" required>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={`Surcoût (${currency})`} required>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </FormField>
          <FormField label="Jours en plus">
            <Input type="number" inputMode="numeric" min={0} max={3650} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Étape concernée">
          <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Proposer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DecisionDialog({ target, onClose, projectId, currency }: { target: { order: ChangeOrder; decision: 'APPROVED' | 'REJECTED' } | null; onClose: () => void; projectId: string; currency: string }) {
  const decide = useSiteMutation(projectId, (v: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) => siteService.decideChangeOrder(projectId, v.id, { decision: v.decision, note: v.note }), {
    success: (d) => (d.status === 'APPROVED' ? 'Avenant approuvé : le budget et le délai sont mis à jour.' : 'Avenant refusé.'),
    error: "Impossible de traiter l'avenant.",
  });
  const [note, setNote] = React.useState('');
  React.useEffect(() => setNote(''), [target]);
  if (!target) return null;
  const approving = target.decision === 'APPROVED';
  return (
    <Dialog open onClose={onClose} title={approving ? 'Approuver cet avenant' : 'Refuser cet avenant'} description={`Avenant n°${target.order.number} · ${target.order.title}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await decide.mutateAsync({ id: target.order.id, decision: target.decision, note: note.trim() || undefined });
          onClose();
        }}
      >
        {approving && (
          <p className="rounded-xl bg-blueprint-50 px-3 py-2.5 text-sm text-blueprint-700">
            Le budget du projet augmentera de {formatMoney(target.order.extraCost, currency)}
            {target.order.extraDays > 0 ? ` et la fin prévue sera repoussée de ${target.order.extraDays} jour(s)` : ''}.
          </p>
        )}
        <FormField label={approving ? 'Commentaire (facultatif)' : 'Motif du refus'}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant={approving ? 'primary' : 'danger'} loading={decide.isPending}>
            {approving ? 'Approuver' : 'Refuser'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ order, onClose, projectId }: { order: ChangeOrder | null; onClose: () => void; projectId: string }) {
  const cancel = useSiteMutation(projectId, (v: { id: string; reason: string }) => siteService.cancelChangeOrder(projectId, v.id, v.reason), { success: 'Avenant annulé : le budget et le délai sont rétablis.', error: "Impossible d'annuler l'avenant." });
  const [reason, setReason] = React.useState('');
  React.useEffect(() => setReason(''), [order]);
  if (!order) return null;
  return (
    <Dialog open onClose={onClose} title="Annuler un avenant approuvé" description="Le surcoût et le délai ajoutés seront retirés.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (reason.trim().length < 3) return;
          await cancel.mutateAsync({ id: order.id, reason: reason.trim() });
          onClose();
        }}
      >
        <FormField label="Motif" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Retour
          </Button>
          <Button type="submit" variant="danger" loading={cancel.isPending} disabled={reason.trim().length < 3}>
            Annuler l&apos;avenant
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
