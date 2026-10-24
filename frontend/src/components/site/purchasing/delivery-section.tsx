//frontend/src/components/site/purchasing/delivery-section.tsx
'use client';

import * as React from 'react';
import { MapPin, MapPinOff, PackageCheck, PackageX, Plus, Trash2, Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhotoGallery } from '@/components/site/photo-gallery';
import { PhotoPicker, toOutboxFiles } from '@/components/site/photo-picker';
import { SectionHeader } from '@/components/site/section-header';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { useDeliveries, useSuppliers } from '@/hooks/use-site';
import { getPosition, newClientRef } from '@/lib/geo';
import { todayIso } from '@/lib/month';
import { formatDay, formatQty, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { PurchaseOrder } from '@/types/site';

interface LineDraft {
  orderLineId?: string;
  label: string;
  unit: string;
  received: string;
  refused: string;
  note: string;
}
const emptyLine = (): LineDraft => ({ label: '', unit: '', received: '', refused: '', note: '' });

/** Bons de livraison : quantites recues et refusees, photo du bon, position — chaque livraison alimente le stock. */
export function DeliverySection({ projectId, permissions, receiveOrder, onReceiveDone, onNew, newOpen }: { projectId: string; permissions: SitePermissions; receiveOrder: PurchaseOrder | null; onReceiveDone: () => void; onNew: () => void; newOpen: boolean }) {
  const { data, isLoading, isError } = useDeliveries(projectId);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les livraisons." />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Livraisons"
        description="Un bon de livraison par camion : photographiez-le, indiquez ce qui est refusé (cassé, non conforme) — seul le reste entre en stock."
        action={
          permissions.fieldWrite && (
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4" /> Enregistrer une livraison
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<Truck className="h-6 w-6" />} title="Aucune livraison" description="Les livraisons reçues sur le chantier apparaissent ici avec leurs photos." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((d, i) => (
            <Card key={d.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-400">
                    {formatDay(d.date)}
                    {d.orderNumber ? ` · commande n°${d.orderNumber}` : ''}
                    {d.noteReference ? ` · BL ${d.noteReference}` : ''}
                  </p>
                  <p className="truncate font-medium text-ink-900">{d.supplierName ?? 'Fournisseur non précisé'}</p>
                </div>
                {d.hasRefusals ? <StatusBadge label="Avec refus" tone="clay" /> : <StatusBadge label="Conforme" tone="moss" />}
              </div>
              <ul className="mt-3 space-y-1.5">
                {d.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink-700">{l.label}</span>
                    <span className="shrink-0 font-ledger text-xs text-ink-600">
                      {formatQty(toNum(l.quantityReceived) - toNum(l.quantityRefused))} {l.unit}
                      {toNum(l.quantityRefused) > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-clay-600">
                          <PackageX className="h-3 w-3" /> {formatQty(l.quantityRefused)} refusé
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {d.attachments.length > 0 && (
                <div className="mt-3">
                  <PhotoGallery attachments={d.attachments} />
                </div>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-x-3 border-t border-concrete pt-2.5 text-xs text-ink-400">
                <span>Reçu par {d.receivedByName ?? '—'}</span>
                {d.latitude && d.longitude && (d.isOffSite ? <span className="inline-flex items-center gap-1 text-clay-600"><MapPinOff className="h-3.5 w-3.5" /> Hors du chantier</span> : <span className="inline-flex items-center gap-1 text-moss-600"><MapPin className="h-3.5 w-3.5" /> Sur le chantier</span>)}
              </p>
            </Card>
          ))}
        </div>
      )}
      <DeliveryDialog open={newOpen || receiveOrder !== null} onClose={onReceiveDone} projectId={projectId} order={receiveOrder} />
    </div>
  );
}

function DeliveryDialog({ open, onClose, projectId, order }: { open: boolean; onClose: () => void; projectId: string; order: PurchaseOrder | null }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const { data: suppliers } = useSuppliers(projectId);
  const [supplierId, setSupplierId] = React.useState('');
  const [supplierName, setSupplierName] = React.useState('');
  const [noteReference, setNoteReference] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [locating, setLocating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSupplierId(order?.supplierId ?? '');
    setSupplierName(order && !order.supplierId ? (order.supplierName ?? '') : '');
    setNoteReference('');
    setDate(todayIso());
    setNotes('');
    setFiles([]);
    setLines(
      order
        ? order.lines
            .filter((l) => toNum(l.quantityRemaining) > 0)
            .map((l) => ({ orderLineId: l.id, label: l.label, unit: l.unit, received: String(toNum(l.quantityRemaining)), refused: '', note: '' }))
        : [emptyLine()],
    );
  }, [open, order]);

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.label.trim() || l.received);
  const valid = filled.length > 0 && filled.every((l) => (l.orderLineId || (l.label.trim().length >= 2 && l.unit.trim())) && toNum(l.received) > 0 && toNum(l.refused) <= toNum(l.received));

  return (
    <Dialog open={open} onClose={onClose} title={order ? `Réceptionner la commande n°${order.number}` : 'Enregistrer une livraison'} description="Quantités effectivement reçues et refusées." maxWidth="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setLocating(true);
          const position = await getPosition();
          setLocating(false);
          const result = await submit(
            {
              kind: 'delivery',
              label: `Livraison${order ? ` (commande n°${order.number})` : ''} : ${filled.map((l) => l.label.trim()).filter(Boolean).slice(0, 2).join(', ') || 'matériaux'}`,
              method: 'POST',
              path: `/projects/${projectId}/deliveries`,
              body: {
                orderId: order?.id,
                supplierId: supplierId || undefined,
                supplierName: supplierId ? undefined : supplierName.trim() || undefined,
                noteReference: noteReference.trim() || undefined,
                date,
                notes: notes.trim() || undefined,
                latitude: position?.latitude,
                longitude: position?.longitude,
                clientRef: newClientRef(),
                lines: filled.map((l) => ({
                  orderLineId: l.orderLineId,
                  label: l.orderLineId ? undefined : l.label.trim(),
                  unit: l.orderLineId ? undefined : l.unit.trim(),
                  quantityReceived: toNum(l.received),
                  quantityRefused: l.refused ? toNum(l.refused) : undefined,
                  note: l.note.trim() || undefined,
                })),
              },
              files: toOutboxFiles(files, 'bon_livraison'),
              attach: { mode: 'entity', entityType: 'Delivery' },
            },
            'Livraison enregistrée : le stock est à jour.',
          );
          if (result) onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!order && (
            <FormField label="Fournisseur">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Autre (saisir le nom)</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {!order && !supplierId && (
            <FormField label="Nom du fournisseur">
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={150} />
            </FormField>
          )}
          <FormField label="N° du bon de livraison">
            <Input value={noteReference} onChange={(e) => setNoteReference(e.target.value)} maxLength={100} />
          </FormField>
          <FormField label="Date de réception">
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-700">Articles reçus</p>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-concrete bg-paper/50 p-2.5">
              <div className="col-span-12 sm:col-span-4">
                {line.orderLineId ? <p className="truncate pt-2 text-sm font-medium text-ink-800">{line.label} <span className="text-xs font-normal text-ink-400">({line.unit})</span></p> : <Input placeholder="Désignation" value={line.label} onChange={(e) => setLine(i, { label: e.target.value })} maxLength={200} aria-label="Désignation" />}
              </div>
              {!line.orderLineId && (
                <div className="col-span-3 sm:col-span-2">
                  <Input placeholder="Unité" value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value })} maxLength={20} aria-label="Unité" />
                </div>
              )}
              <div className={line.orderLineId ? 'col-span-5 sm:col-span-3' : 'col-span-4 sm:col-span-2'}>
                <Input placeholder="Reçu" type="number" inputMode="decimal" min={0} step="any" value={line.received} onChange={(e) => setLine(i, { received: e.target.value })} aria-label="Quantité reçue" />
              </div>
              <div className={line.orderLineId ? 'col-span-5 sm:col-span-3' : 'col-span-4 sm:col-span-2'}>
                <Input placeholder="Refusé" type="number" inputMode="decimal" min={0} step="any" value={line.refused} onChange={(e) => setLine(i, { refused: e.target.value })} aria-label="Quantité refusée" />
              </div>
              <div className="col-span-2 flex items-center justify-end sm:col-span-1">
                {lines.length > 1 && !order && (
                  <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-ink-300 hover:text-clay-500" aria-label="Retirer la ligne">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!order && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus className="h-4 w-4" /> Ajouter un article
            </Button>
          )}
        </div>

        <PhotoPicker files={files} onChange={setFiles} label="Photo du bon de livraison et des matériaux" />
        <FormField label="Remarques">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Ex. : 3 sacs de ciment déchirés, refusés au chauffeur." />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending || locating} disabled={!valid}>
            <PackageCheck className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
