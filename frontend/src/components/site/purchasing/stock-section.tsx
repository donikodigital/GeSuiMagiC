//frontend/src/components/site/purchasing/stock-section.tsx
'use client';

import * as React from 'react';
import { ArrowDownToLine, History, PackagePlus, Settings2, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { PhaseSelect } from '@/components/site/phase-select';
import { ProgressBar } from '@/components/site/progress-bar';
import { SectionHeader } from '@/components/site/section-header';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { useSiteMutation, useStockItems, useStockMovements } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { newClientRef } from '@/lib/geo';
import { todayIso } from '@/lib/month';
import { formatDateTime } from '@/lib/format';
import { formatDay, formatQty, stockMovementLabels, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { StockItem, StockMovementType } from '@/types/site';

/** Stock du chantier : niveau de chaque materiau, seuil d'alerte, consommation et pertes. */
export function StockSection({ projectId, permissions }: { projectId: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useStockItems(projectId);
  const [adding, setAdding] = React.useState(false);
  const [movement, setMovement] = React.useState<StockItem | null>(null);
  const [history, setHistory] = React.useState<StockItem | null>(null);
  const [threshold, setThreshold] = React.useState<StockItem | null>(null);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger le stock." />;
  const low = data.filter((i) => i.isLow);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Stock sur le chantier"
        description="Chaque livraison alimente le stock. Sortez les matériaux consommés par étape et déclarez les pertes : l'écart avec l'avancement devient visible."
        action={
          permissions.fieldWrite && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PackagePlus className="h-4 w-4" /> Nouvel article
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Articles suivis" value={String(data.length)} />
        <StatCard label="Stock bas" value={String(low.length)} tone={low.length > 0 ? 'clay' : 'moss'} hint={low.length > 0 ? low.map((i) => i.name).slice(0, 2).join(', ') : 'rien à commander'} />
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<PackagePlus className="h-6 w-6" />} title="Aucun article en stock" description="Les articles se créent automatiquement à la première livraison, ou manuellement ici." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((item, i) => {
            const min = item.minQuantity ? toNum(item.minQuantity) : null;
            const level = toNum(item.quantity);
            const pct = min && min > 0 ? Math.min(100, (level / (min * 3)) * 100) : level > 0 ? 100 : 0;
            return (
              <Card key={item.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-ink-900">{item.name}</p>
                  {item.isLow && <StatusBadge label="Stock bas" tone="clay" />}
                </div>
                <p className="mt-2 font-ledger text-3xl font-bold text-ink-900">
                  {formatQty(item.quantity)} <span className="text-base font-semibold text-ink-400">{item.unit}</span>
                </p>
                <ProgressBar className="mt-2" value={pct} tone={item.isLow ? 'clay' : 'moss'} />
                <p className="mt-1 text-[11px] text-ink-400">{min !== null ? `Seuil d'alerte : ${formatQty(min)} ${item.unit}` : "Pas de seuil d'alerte"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-concrete pt-3 text-center">
                  <div>
                    <p className="font-ledger text-sm font-semibold text-moss-600">{formatQty(item.totalIn)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Reçu</p>
                  </div>
                  <div>
                    <p className="font-ledger text-sm font-semibold text-ink-800">{formatQty(item.totalConsumed)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Consommé</p>
                  </div>
                  <div>
                    <p className={`font-ledger text-sm font-semibold ${toNum(item.totalLost) > 0 ? 'text-clay-600' : 'text-ink-800'}`}>{formatQty(item.totalLost)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Perdu</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setHistory(item)} title="Historique">
                    <History className="h-4 w-4" />
                  </Button>
                  {(permissions.owner || permissions.isSiteManager) && (
                    <Button size="sm" variant="ghost" onClick={() => setThreshold(item)} title="Seuil d'alerte">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}
                  {permissions.fieldWrite && (
                    <Button size="sm" variant="outline" onClick={() => setMovement(item)}>
                      <ArrowDownToLine className="h-4 w-4" /> Sortie / perte
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewItemDialog open={adding} onClose={() => setAdding(false)} projectId={projectId} />
      <MovementDialog item={movement} onClose={() => setMovement(null)} projectId={projectId} />
      <HistoryDialog item={history} onClose={() => setHistory(null)} projectId={projectId} />
      <ThresholdDialog item={threshold} onClose={() => setThreshold(null)} projectId={projectId} />
    </div>
  );
}

function NewItemDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const create = useSiteMutation(projectId, (v: { name: string; unit: string; minQuantity?: number }) => siteService.createStockItem(projectId, v), { success: 'Article ajouté au stock.', error: "Impossible d'ajouter l'article." });
  const [name, setName] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [min, setMin] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setName('');
      setUnit('');
      setMin('');
    }
  }, [open]);
  const valid = name.trim().length >= 2 && unit.trim().length >= 1;
  return (
    <Dialog open={open} onClose={onClose} title="Nouvel article de stock" description="Ciment, fer à béton, carreaux… Le stock démarre à zéro : il se remplit par les livraisons.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await create.mutateAsync({ name: name.trim(), unit: unit.trim(), minQuantity: min === '' ? undefined : Number(min) });
          onClose();
        }}
      >
        <FormField label="Désignation" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="Ex. : Ciment CPJ 42,5" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Unité" required>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="sac, m³, kg, barre…" />
          </FormField>
          <FormField label="Seuil d'alerte" hint="Alerte quand le stock descend à ce niveau.">
            <Input type="number" inputMode="decimal" min={0} step="any" value={min} onChange={(e) => setMin(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Ajouter
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ThresholdDialog({ item, onClose, projectId }: { item: StockItem | null; onClose: () => void; projectId: string }) {
  const update = useSiteMutation(projectId, (v: { id: string; minQuantity: number | null }) => siteService.updateStockItem(projectId, v.id, { minQuantity: v.minQuantity }), { success: "Seuil d'alerte enregistré.", error: 'Impossible de modifier le seuil.' });
  const [min, setMin] = React.useState('');
  React.useEffect(() => setMin(item?.minQuantity ? String(toNum(item.minQuantity)) : ''), [item]);
  if (!item) return null;
  return (
    <Dialog open onClose={onClose} title={`Seuil d'alerte · ${item.name}`} description="Le client et le conducteur de travaux sont prévenus quand le stock atteint ce niveau.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await update.mutateAsync({ id: item.id, minQuantity: min === '' ? null : Number(min) });
          onClose();
        }}
      >
        <FormField label={`Seuil (${item.unit})`} hint="Laissez vide pour supprimer l'alerte.">
          <Input type="number" inputMode="decimal" min={0} step="any" value={min} onChange={(e) => setMin(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={update.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MovementDialog({ item, onClose, projectId }: { item: StockItem | null; onClose: () => void; projectId: string }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const [type, setType] = React.useState<'OUT' | 'LOSS' | 'ADJUSTMENT'>('OUT');
  const [quantity, setQuantity] = React.useState('');
  const [phaseId, setPhaseId] = React.useState('');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(todayIso());

  React.useEffect(() => {
    if (item) {
      setType('OUT');
      setQuantity('');
      setPhaseId('');
      setNote('');
      setDate(todayIso());
    }
  }, [item]);
  if (!item) return null;

  const qty = Number(quantity);
  const needsNote = type !== 'OUT';
  const valid = Number.isFinite(qty) && qty !== 0 && (type === 'ADJUSTMENT' || qty > 0) && (type !== 'OUT' || !!phaseId) && (!needsNote || note.trim().length >= 3);

  return (
    <Dialog open onClose={onClose} title={`Mouvement · ${item.name}`} description={`En stock : ${formatQty(item.quantity)} ${item.unit}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const result = await submit(
            {
              kind: 'stock-movement',
              label: `${stockMovementLabels[type]} : ${formatQty(qty)} ${item.unit} de ${item.name}`,
              method: 'POST',
              path: `/projects/${projectId}/stock/items/${item.id}/movements`,
              body: { type, quantity: qty, phaseId: phaseId || undefined, date, note: note.trim() || undefined, clientRef: newClientRef() },
            },
            'Mouvement enregistré.',
          );
          if (result) onClose();
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {(['OUT', 'LOSS', 'ADJUSTMENT'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${type === t ? 'border-blueprint-600 bg-blueprint-600 text-white' : 'border-concrete bg-white text-ink-600 hover:border-blueprint-200'}`}>
              {t === 'OUT' ? 'Consommation' : t === 'LOSS' ? 'Perte' : 'Inventaire'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={type === 'ADJUSTMENT' ? `Écart (${item.unit})` : `Quantité (${item.unit})`} required hint={type === 'ADJUSTMENT' ? 'Négatif si le stock réel est plus bas.' : undefined}>
            <Input type="number" inputMode="decimal" step="any" min={type === 'ADJUSTMENT' ? undefined : 0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField label="Date">
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>
        {type === 'OUT' && (
          <FormField label="Étape qui consomme" required>
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} emptyLabel="Choisir une étape" />
          </FormField>
        )}
        <FormField label={type === 'LOSS' ? 'Cause de la perte' : type === 'ADJUSTMENT' ? "Motif de la correction" : 'Remarque'} required={needsNote}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={type === 'LOSS' ? 'Casse, vol, intempéries…' : undefined} />
        </FormField>
        {type === 'LOSS' && (
          <p className="flex items-start gap-1.5 rounded-xl bg-safety-50 px-3 py-2 text-xs text-safety-500">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Les pertes sont visibles du client dans la consommation par étape.
          </p>
        )}
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

function HistoryDialog({ item, onClose, projectId }: { item: StockItem | null; onClose: () => void; projectId: string }) {
  const { data, isLoading } = useStockMovements(projectId, item?.id);
  if (!item) return null;
  return (
    <Dialog open onClose={onClose} title={`Historique · ${item.name}`} maxWidth="max-w-xl">
      {isLoading ? (
        <PageSpinner />
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">Aucun mouvement.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((m) => {
            const plus = m.type === 'IN' || (m.type === 'ADJUSTMENT' && toNum(m.quantity) > 0);
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-concrete px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800">{stockMovementLabels[m.type as StockMovementType]}{m.phaseName ? ` · ${m.phaseName}` : ''}</p>
                  <p className="text-xs text-ink-400">
                    {formatDay(m.date)} · {m.createdByName ?? '—'} · {formatDateTime(m.createdAt)}
                  </p>
                  {m.note && <p className="mt-1 text-xs text-ink-600">{m.note}</p>}
                </div>
                <p className={`shrink-0 font-ledger text-sm font-semibold ${plus ? 'text-moss-600' : 'text-clay-600'}`}>
                  {plus ? '+' : '−'} {formatQty(Math.abs(toNum(m.quantity)))} {m.unit}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
