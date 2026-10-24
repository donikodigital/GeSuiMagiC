//frontend/src/components/site/purchasing/order-section.tsx
'use client';

import * as React from 'react';
import { Ban, PackageCheck, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { ProgressBar } from '@/components/site/progress-bar';
import { SectionHeader } from '@/components/site/section-header';
import { useOrders, useSiteMutation, useSuppliers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatMoney } from '@/lib/format';
import { todayIso } from '@/lib/month';
import { formatDay, formatQty, orderStatusMeta, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { PurchaseOrder } from '@/types/site';

interface LineDraft {
  label: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}
const emptyLine = (): LineDraft => ({ label: '', unit: '', quantity: '', unitPrice: '' });

/** Commandes aux fournisseurs : ce qui est commande, ce qui est deja livre, ce qu'il reste a recevoir. */
export function OrderSection({ projectId, currency, permissions, onReceive }: { projectId: string; currency: string; permissions: SitePermissions; onReceive: (order: PurchaseOrder) => void }) {
  const { data, isLoading, isError } = useOrders(projectId);
  const [creating, setCreating] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<PurchaseOrder | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les commandes." />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Commandes"
        description="Passez commande au fournisseur, puis enregistrez chaque livraison : le reste à recevoir se met à jour tout seul."
        action={
          permissions.order && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouvelle commande
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="Aucune commande" description="Les commandes de matériaux apparaissent ici avec leur état de livraison." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((order, i) => {
            const meta = orderStatusMeta[order.status];
            const open = order.status === 'ORDERED' || order.status === 'PARTIAL';
            return (
              <Card key={order.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-400">
                      Commande n°{order.number} · {formatDay(order.orderDate)}
                      {order.phaseName ? ` · ${order.phaseName}` : ''}
                    </p>
                    <p className="truncate font-medium text-ink-900">{order.supplierName ?? 'Fournisseur non précisé'}</p>
                  </div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </div>
                <ul className="mt-3 space-y-2.5">
                  {order.lines.map((line) => {
                    const ordered = toNum(line.quantityOrdered);
                    const delivered = toNum(line.quantityDelivered);
                    return (
                      <li key={line.id}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-ink-700">{line.label}</span>
                          <span className="shrink-0 font-ledger text-xs text-ink-500">
                            {formatQty(delivered)} / {formatQty(ordered)} {line.unit}
                          </span>
                        </div>
                        <ProgressBar className="mt-1 h-1.5" value={ordered > 0 ? (delivered / ordered) * 100 : 0} tone={delivered >= ordered ? 'moss' : 'blueprint'} />
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-concrete pt-3">
                  <p className="text-xs text-ink-400">
                    {order.expectedDate ? `Livraison prévue le ${formatDay(order.expectedDate)}` : 'Sans date de livraison'}
                    {order.total ? ` · ${formatMoney(order.total, currency)}` : ''}
                  </p>
                  <div className="flex gap-1.5">
                    {open && (permissions.owner || permissions.isSiteManager) && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(order)} title="Annuler la commande">
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    {open && permissions.fieldWrite && (
                      <Button size="sm" variant="outline" onClick={() => onReceive(order)}>
                        <PackageCheck className="h-4 w-4" /> Réceptionner
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <CreateOrderDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} currency={currency} />
      <CancelOrderDialog order={cancelling} onClose={() => setCancelling(null)} projectId={projectId} />
    </div>
  );
}

function CreateOrderDialog({ open, onClose, projectId, currency }: { open: boolean; onClose: () => void; projectId: string; currency: string }) {
  const create = useSiteMutation(projectId, (v: Parameters<typeof siteService.createOrder>[1]) => siteService.createOrder(projectId, v), { success: 'Commande enregistrée.', error: 'Impossible de créer la commande.' });
  const { data: suppliers } = useSuppliers(projectId);
  const [supplierId, setSupplierId] = React.useState('');
  const [supplierName, setSupplierName] = React.useState('');
  const [phaseId, setPhaseId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [expectedDate, setExpectedDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()]);

  React.useEffect(() => {
    if (open) {
      setSupplierId('');
      setSupplierName('');
      setPhaseId('');
      setReference('');
      setExpectedDate('');
      setNotes('');
      setLines([emptyLine()]);
    }
  }, [open]);

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.label.trim() || l.quantity);
  const valid = filled.length > 0 && filled.every((l) => l.label.trim().length >= 2 && l.unit.trim() && toNum(l.quantity) > 0) && (!!supplierId || supplierName.trim().length >= 2);

  return (
    <Dialog open={open} onClose={onClose} title="Nouvelle commande" description="Matériaux commandés à un fournisseur." maxWidth="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await create.mutateAsync({
            supplierId: supplierId || undefined,
            supplierName: supplierId ? undefined : supplierName.trim(),
            phaseId: phaseId || undefined,
            reference: reference.trim() || undefined,
            orderDate: todayIso(),
            expectedDate: expectedDate || undefined,
            notes: notes.trim() || undefined,
            lines: filled.map((l) => ({ label: l.label.trim(), unit: l.unit.trim(), quantityOrdered: toNum(l.quantity), unitPrice: l.unitPrice ? toNum(l.unitPrice) : undefined })),
          });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Fournisseur" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Autre (saisir le nom)</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          {!supplierId && (
            <FormField label="Nom du fournisseur" required>
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={150} />
            </FormField>
          )}
          <FormField label="Étape concernée">
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
          </FormField>
          <FormField label="Livraison prévue le">
            <Input type="date" value={expectedDate} min={todayIso()} onChange={(e) => setExpectedDate(e.target.value)} />
          </FormField>
          <FormField label="Référence / bon de commande">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </FormField>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-700">Articles commandés</p>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-concrete bg-paper/50 p-2.5">
              <div className="col-span-12 sm:col-span-5">
                <Input placeholder="Désignation" value={line.label} onChange={(e) => setLine(i, { label: e.target.value })} maxLength={200} aria-label="Désignation" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input placeholder="Quantité" type="number" inputMode="decimal" min={0} step="any" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label="Quantité" />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Input placeholder="Unité" value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value })} maxLength={20} aria-label="Unité" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input placeholder={`Prix (${currency})`} type="number" inputMode="decimal" min={0} step="any" value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label="Prix unitaire" />
              </div>
              <div className="col-span-1 flex items-center justify-end">
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-ink-300 hover:text-clay-500" aria-label="Retirer la ligne">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
            <Plus className="h-4 w-4" /> Ajouter un article
          </Button>
        </div>

        <FormField label="Remarques">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Commander
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelOrderDialog({ order, onClose, projectId }: { order: PurchaseOrder | null; onClose: () => void; projectId: string }) {
  const cancel = useSiteMutation(projectId, (v: { id: string; reason: string }) => siteService.cancelOrder(projectId, v.id, v.reason), { success: 'Commande annulée.', error: "Impossible d'annuler la commande." });
  const [reason, setReason] = React.useState('');
  React.useEffect(() => setReason(''), [order]);
  if (!order) return null;
  return (
    <Dialog open onClose={onClose} title={`Annuler la commande n°${order.number}`} description="Les livraisons déjà reçues restent en stock.">
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
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Retour
          </Button>
          <Button type="submit" variant="danger" loading={cancel.isPending} disabled={reason.trim().length < 3}>
            Annuler la commande
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
