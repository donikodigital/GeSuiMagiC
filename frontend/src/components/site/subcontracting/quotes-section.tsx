//frontend/src/components/site/subcontracting/quotes-section.tsx
'use client';

import * as React from 'react';
import { Award, FileSearch, Paperclip, Plus, Scale, Trash2, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { PhaseSelect } from '@/components/site/phase-select';
import { SectionHeader } from '@/components/site/section-header';
import { useQuoteLot, useQuoteLots, useSiteMutation, useSuppliers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { formatMoney } from '@/lib/format';
import { todayIso } from '@/lib/month';
import { formatDay, formatQty, quoteLotStatusMeta, quoteStatusMeta, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { QuoteLot, SupplierQuote } from '@/types/site';

/** Consultations d'entreprises : metre du lot, devis recus, comparaison ligne par ligne, attribution. */
export function QuotesSection({ projectId, currency, permissions }: { projectId: string; currency: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useQuoteLots(projectId);
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const money = (v: string | number) => formatMoney(v, currency);

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les consultations." />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Devis et métrés"
        description="Décrivez les travaux d'un lot (métré), saisissez les devis reçus et comparez-les prix par prix avant de choisir."
        action={
          permissions.decide && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouveau lot
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<Scale className="h-6 w-6" />} title="Aucune consultation" description="Créez un lot (ex. : électricité) avec son métré, puis ajoutez les devis des entreprises consultées." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((lot, i) => {
            const meta = quoteLotStatusMeta[lot.status];
            return (
              <button key={lot.id} type="button" onClick={() => setOpenId(lot.id)} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in text-left transition-transform hover:-translate-y-0.5">
                <Card className="h-full rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-400">
                        Lot n°{lot.number}
                        {lot.phaseName ? ` · ${lot.phaseName}` : ''}
                      </p>
                      <p className="truncate font-medium text-ink-900">{lot.title}</p>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-concrete pt-3 text-center">
                    <div>
                      <p className="font-ledger text-sm font-semibold text-ink-900">{lot.itemCount}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Postes</p>
                    </div>
                    <div>
                      <p className="font-ledger text-sm font-semibold text-ink-900">{lot.quoteCount}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Devis</p>
                    </div>
                    <div>
                      <p className="truncate font-ledger text-sm font-semibold text-moss-600">{lot.lowestQuote ? money(lot.lowestQuote) : '—'}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Meilleur</p>
                    </div>
                  </div>
                  {lot.estimatedAmount && <p className="mt-2 text-xs text-ink-400">Estimation : {money(lot.estimatedAmount)}</p>}
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <CreateLotDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} currency={currency} onCreated={(id) => setOpenId(id)} />
      <LotDialog id={openId} onClose={() => setOpenId(null)} projectId={projectId} currency={currency} permissions={permissions} />
    </div>
  );
}

interface ItemDraft {
  label: string;
  unit: string;
  quantity: string;
  price: string;
}
const emptyItem = (): ItemDraft => ({ label: '', unit: '', quantity: '', price: '' });

function CreateLotDialog({ open, onClose, projectId, currency, onCreated }: { open: boolean; onClose: () => void; projectId: string; currency: string; onCreated: (id: string) => void }) {
  const create = useSiteMutation(projectId, (v: Parameters<typeof siteService.createQuoteLot>[1]) => siteService.createQuoteLot(projectId, v), { success: 'Lot créé : saisissez les devis reçus.', error: 'Impossible de créer le lot.' });
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [phaseId, setPhaseId] = React.useState('');
  const [items, setItems] = React.useState<ItemDraft[]>([emptyItem()]);
  React.useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setPhaseId('');
      setItems([emptyItem()]);
    }
  }, [open]);
  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const filled = items.filter((it) => it.label.trim() || it.quantity);
  const valid = title.trim().length >= 3 && filled.length > 0 && filled.every((it) => it.label.trim().length >= 2 && it.unit.trim() && toNum(it.quantity) > 0);

  return (
    <Dialog open={open} onClose={onClose} title="Nouveau lot de consultation" description="Le métré liste les postes sur lesquels chaque entreprise donne son prix." maxWidth="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const lot = await create.mutateAsync({
            title: title.trim(),
            description: description.trim() || undefined,
            phaseId: phaseId || undefined,
            items: filled.map((it) => ({ label: it.label.trim(), unit: it.unit.trim(), quantity: toNum(it.quantity), estimatedUnitPrice: it.price ? toNum(it.price) : undefined })),
          });
          onClose();
          onCreated(lot.id);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Intitulé du lot" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. : Électricité courants forts" />
          </FormField>
          <FormField label="Étape concernée">
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
          </FormField>
        </div>
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
        </FormField>
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-700">Postes du métré</p>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-concrete bg-paper/50 p-2.5">
              <div className="col-span-12 sm:col-span-5">
                <Input placeholder="Désignation du poste" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} maxLength={200} aria-label="Désignation" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input placeholder="Quantité" type="number" inputMode="decimal" min={0} step="any" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Quantité" />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Input placeholder="Unité" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} maxLength={20} aria-label="Unité" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input placeholder={`Estimé (${currency})`} type="number" inputMode="decimal" min={0} step="any" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} aria-label="Prix estimé" />
              </div>
              <div className="col-span-1 flex items-center justify-end">
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-ink-300 hover:text-clay-500" aria-label="Retirer le poste">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setItems([...items, emptyItem()])}>
            <Plus className="h-4 w-4" /> Ajouter un poste
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Créer le lot
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function LotDialog({ id, onClose, projectId, currency, permissions }: { id: string | null; onClose: () => void; projectId: string; currency: string; permissions: SitePermissions }) {
  const { data: lot, isLoading } = useQuoteLot(projectId, id);
  const close = useSiteMutation(projectId, (lotId: string) => siteService.closeLot(projectId, lotId), { success: 'Consultation close.', error: 'Impossible de clore la consultation.' });
  const remove = useSiteMutation(projectId, (v: { lotId: string; quoteId: string }) => siteService.deleteQuote(projectId, v.lotId, v.quoteId), { success: 'Devis supprimé.', error: 'Impossible de supprimer le devis.' });
  const [quoting, setQuoting] = React.useState<SupplierQuote | 'new' | null>(null);
  const [awarding, setAwarding] = React.useState<SupplierQuote | null>(null);
  const [deleting, setDeleting] = React.useState<SupplierQuote | null>(null);
  const [showFilesFor, setShowFilesFor] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState(false);
  if (!id) return null;
  const money = (v: string | number) => formatMoney(v, currency);
  const open = lot?.status === 'OPEN';

  return (
    <Dialog open onClose={onClose} title={lot ? `Lot n°${lot.number} · ${lot.title}` : 'Lot'} description={lot?.description ?? undefined} maxWidth="max-w-3xl">
      {isLoading || !lot ? (
        <PageSpinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={quoteLotStatusMeta[lot.status].label} tone={quoteLotStatusMeta[lot.status].tone} />
            {lot.phaseName && <span className="text-xs text-ink-400">Étape : {lot.phaseName}</span>}
            {lot.estimatedAmount && <span className="text-xs text-ink-400">Estimation : {money(lot.estimatedAmount)}</span>}
          </div>

          <section className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-ink-800">Métré</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {lot.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 rounded-xl bg-paper/70 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink-700">{it.label}</span>
                  <span className="shrink-0 font-ledger text-xs text-ink-500">
                    {formatQty(it.quantity)} {it.unit}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink-800">Devis reçus ({lot.quotes.length})</h3>
              {open && permissions.decide && (
                <Button size="sm" variant="outline" onClick={() => setQuoting('new')}>
                  <Plus className="h-4 w-4" /> Saisir un devis
                </Button>
              )}
            </div>
            {lot.quotes.length === 0 ? (
              <p className="rounded-xl bg-paper/70 px-3 py-4 text-center text-sm text-ink-400">Aucun devis pour l&apos;instant.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {lot.quotes.map((q) => {
                  const summary = lot.comparison.quotes.find((c) => c.quoteId === q.id);
                  const best = lot.comparison.bestQuoteId === q.id;
                  const meta = quoteStatusMeta[q.status];
                  return (
                    <div key={q.id} className={`rounded-2xl border p-3.5 ${best ? 'border-moss-300 bg-moss-50/50' : 'border-concrete bg-white'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{q.supplier.name}</p>
                          <p className="truncate text-xs text-ink-400">
                            {q.reference ? `Réf. ${q.reference}` : 'Sans référence'}
                            {q.validUntil ? ` · valable jusqu'au ${formatDay(q.validUntil)}` : ''}
                          </p>
                        </div>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </div>
                      <p className="mt-2 font-ledger text-lg font-bold text-ink-900">{money(q.totalAmount)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                        {best && (
                          <span className="inline-flex items-center gap-1 font-medium text-moss-600">
                            <Trophy className="h-3.5 w-3.5" /> Le moins cher
                          </span>
                        )}
                        {summary && !summary.complete && <span className="text-safety-600">Incomplet ({summary.pricedItems}/{lot.items.length} postes)</span>}
                        {summary?.gapToEstimatePercent != null && (
                          <span>
                            {summary.gapToEstimatePercent > 0 ? '+' : ''}
                            {summary.gapToEstimatePercent.toFixed(1)} % vs estimation
                          </span>
                        )}
                        {summary?.gapToBestPercent != null && summary.gapToBestPercent > 0 && <span>+{summary.gapToBestPercent.toFixed(1)} % vs meilleur</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setShowFilesFor(showFilesFor === q.id ? null : q.id)}>
                          <Paperclip className="h-4 w-4" /> Devis joint
                        </Button>
                        {open && permissions.decide && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setQuoting(q)}>
                              Modifier
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleting(q)} aria-label="Supprimer le devis">
                              <Trash2 className="h-4 w-4 text-clay-500" />
                            </Button>
                          </>
                        )}
                        {open && permissions.owner && q.status === 'SUBMITTED' && (
                          <Button size="sm" onClick={() => setAwarding(q)}>
                            <Award className="h-4 w-4" /> Retenir
                          </Button>
                        )}
                      </div>
                      {showFilesFor === q.id && (
                        <div className="mt-3 border-t border-concrete pt-3">
                          <AttachmentsSection
                            target={{ projectId, entityType: 'SupplierQuote', entityId: q.id }}
                            kindOptions={[
                              { value: 'devis', label: 'Devis' },
                              { value: 'document', label: 'Document' },
                            ]}
                            readOnly={!open || !permissions.decide}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {lot.comparison.rows.length > 0 && lot.comparison.quotes.length > 1 && <ComparisonView lot={lot} money={money} />}

          {permissions.owner && lot.status !== 'CLOSED' && (
            <div className="flex justify-end border-t border-concrete pt-4">
              <Button variant="outline" onClick={() => setClosing(true)}>
                Clore la consultation
              </Button>
            </div>
          )}
        </div>
      )}
      {lot && <QuoteDialog target={quoting} onClose={() => setQuoting(null)} projectId={projectId} lot={lot} currency={currency} />}
      {lot && <AwardDialog quote={awarding} onClose={() => setAwarding(null)} projectId={projectId} lot={lot} money={money} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting || !lot) return;
          await remove.mutateAsync({ lotId: lot.id, quoteId: deleting.id }).catch(() => undefined);
          setDeleting(null);
        }}
        title="Supprimer ce devis ?"
        description={deleting ? `Le devis de ${deleting.supplier.name} sera retiré de la comparaison.` : undefined}
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
      />
      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={async () => {
          if (!lot) return;
          await close.mutateAsync(lot.id).catch(() => undefined);
          setClosing(false);
        }}
        title="Clore cette consultation ?"
        description="Plus aucun devis ne pourra être ajouté ou modifié."
        confirmLabel="Clore"
        loading={close.isPending}
      />
    </Dialog>
  );
}

/** Comparaison poste par poste : le prix le plus bas de chaque ligne est mis en avant. */
function ComparisonView({ lot, money }: { lot: QuoteLot; money: (v: string | number) => string }) {
  const names = new Map(lot.comparison.quotes.map((q) => [q.quoteId, q.supplierName]));
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink-800">
        <FileSearch className="h-4 w-4 text-blueprint-600" /> Comparaison poste par poste
      </h3>
      <ul className="space-y-2">
        {lot.comparison.rows.map((row) => (
          <li key={row.itemId} className="rounded-xl border border-concrete bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium text-ink-800">{row.label}</p>
              <p className="shrink-0 font-ledger text-xs text-ink-400">
                {formatQty(row.quantity)} {row.unit}
                {row.estimatedTotal ? ` · est. ${money(row.estimatedTotal)}` : ''}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.cells.map((c) => (
                <span
                  key={c.quoteId}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${c.isLowest ? 'bg-moss-50 font-semibold text-moss-700 ring-1 ring-moss-200' : c.total ? 'bg-paper text-ink-600' : 'bg-paper text-ink-300'}`}
                >
                  <span className="max-w-[9rem] truncate">{names.get(c.quoteId) ?? '—'}</span>
                  <span className="font-ledger">{c.total ? money(c.total) : 'non chiffré'}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuoteDialog({ target, onClose, projectId, lot, currency }: { target: SupplierQuote | 'new' | null; onClose: () => void; projectId: string; lot: QuoteLot; currency: string }) {
  const save = useSiteMutation(projectId, (v: Parameters<typeof siteService.upsertQuote>[2]) => siteService.upsertQuote(projectId, lot.id, v), { success: 'Devis enregistré.', error: "Impossible d'enregistrer le devis." });
  const { data: suppliers } = useSuppliers(projectId, 'SUBCONTRACTOR');
  const [supplierId, setSupplierId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [validUntil, setValidUntil] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [prices, setPrices] = React.useState<Record<string, string>>({});

  const load = React.useCallback(
    (quote: SupplierQuote | null, supplier: string) => {
      setSupplierId(supplier);
      setReference(quote?.reference ?? '');
      setValidUntil(quote?.validUntil ? quote.validUntil.slice(0, 10) : '');
      setNotes(quote?.notes ?? '');
      setPrices(Object.fromEntries(lot.items.map((it) => [it.id, String(toNum(quote?.lines.find((l) => l.itemId === it.id)?.unitPrice) || '')])));
    },
    [lot.items],
  );
  React.useEffect(() => {
    if (target === 'new') load(null, '');
    else if (target) load(target, target.supplierId);
  }, [target, load]);

  if (!target) return null;
  const editing = target !== 'new';
  const priced = lot.items.filter((it) => toNum(prices[it.id]) > 0);
  const total = lot.items.reduce((sum, it) => sum + toNum(prices[it.id]) * toNum(it.quantity), 0);
  const valid = !!supplierId && priced.length > 0;
  // Choisir un fournisseur deja consulte recharge son devis (le serveur remplace le devis du meme fournisseur).
  const pickSupplier = (id: string) => {
    const existing = lot.quotes.find((q) => q.supplierId === id) ?? null;
    load(existing, id);
  };
  const options = [...(suppliers ?? [])];
  if (editing && !options.some((s) => s.id === target.supplierId)) options.push({ id: target.supplierId, name: target.supplier.name } as (typeof options)[number]);

  return (
    <Dialog open onClose={onClose} title={editing ? `Devis de ${target.supplier.name}` : 'Saisir un devis'} description="Indiquez le prix unitaire proposé pour chaque poste ; laissez vide un poste non chiffré." maxWidth="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await save.mutateAsync({
            supplierId,
            reference: reference.trim() || undefined,
            validUntil: validUntil || undefined,
            notes: notes.trim() || undefined,
            lines: priced.map((it) => ({ itemId: it.id, unitPrice: toNum(prices[it.id]) })),
          });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Entreprise" required>
            <Select value={supplierId} onChange={(e) => pickSupplier(e.target.value)} disabled={editing}>
              <option value="">Choisir…</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Référence du devis">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </FormField>
          <FormField label="Valable jusqu'au">
            <Input type="date" value={validUntil} min={todayIso()} onChange={(e) => setValidUntil(e.target.value)} />
          </FormField>
        </div>
        {!editing && (suppliers ?? []).length === 0 && <p className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">Ajoutez d&apos;abord l&apos;entreprise dans l&apos;onglet « Annuaire ».</p>}
        <ul className="space-y-2">
          {lot.items.map((it) => (
            <li key={it.id} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-concrete bg-paper/50 p-2.5">
              <div className="col-span-12 min-w-0 sm:col-span-7">
                <p className="truncate text-sm font-medium text-ink-800">{it.label}</p>
                <p className="text-xs text-ink-400">
                  {formatQty(it.quantity)} {it.unit}
                  {it.estimatedUnitPrice ? ` · estimé ${formatMoney(it.estimatedUnitPrice, currency)} / ${it.unit}` : ''}
                </p>
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Input type="number" inputMode="decimal" min={0} step="any" placeholder={`Prix unitaire (${currency})`} value={prices[it.id] ?? ''} onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })} aria-label={`Prix unitaire de ${it.label}`} />
              </div>
            </li>
          ))}
        </ul>
        <FormField label="Remarques">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex items-center justify-between rounded-2xl bg-blueprint-50/60 px-4 py-3">
          <span className="text-sm text-ink-600">Total du devis</span>
          <span className="font-ledger text-lg font-bold text-ink-900">{formatMoney(total, currency)}</span>
        </div>
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

function AwardDialog({ quote, onClose, projectId, lot, money }: { quote: SupplierQuote | null; onClose: () => void; projectId: string; lot: QuoteLot; money: (v: string | number) => string }) {
  const award = useSiteMutation(projectId, (v: { quoteId: string; createContract?: { retentionPercent?: number } }) => siteService.awardLot(projectId, lot.id, v), { success: (l: QuoteLot) => (l.status === 'AWARDED' ? 'Devis retenu.' : 'Lot attribué.'), error: "Impossible d'attribuer le lot." });
  const [createContract, setCreateContract] = React.useState(true);
  const [retention, setRetention] = React.useState('5');
  React.useEffect(() => {
    setCreateContract(true);
    setRetention('5');
  }, [quote]);
  if (!quote) return null;
  const retentionNum = toNum(retention);

  return (
    <Dialog open onClose={onClose} title={`Retenir ${quote.supplier.name}`} description={`Devis de ${money(quote.totalAmount)} pour « ${lot.title} ». Les autres devis sont écartés.`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (createContract && (retentionNum < 0 || retentionNum > 20)) return;
          await award.mutateAsync({ quoteId: quote.id, createContract: createContract ? { retentionPercent: retentionNum } : undefined });
          onClose();
        }}
      >
        <label className="flex items-start gap-2.5 rounded-xl bg-paper/70 p-3 text-sm text-ink-700">
          <input type="checkbox" checked={createContract} onChange={(e) => setCreateContract(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-concrete text-blueprint-600" />
          <span>
            Créer le marché de sous-traitance du même montant
            <span className="block text-xs text-ink-400">Vous pourrez ensuite suivre les situations de travaux et les paiements.</span>
          </span>
        </label>
        {createContract && (
          <FormField label="Retenue de garantie (%)" hint="Part retenue sur chaque situation, rendue à la fin du marché. Usuel : 5 %.">
            <Input type="number" inputMode="decimal" min={0} max={20} step="0.5" value={retention} onChange={(e) => setRetention(e.target.value)} />
          </FormField>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={award.isPending}>
            <Award className="h-4 w-4" /> Retenir ce devis
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
