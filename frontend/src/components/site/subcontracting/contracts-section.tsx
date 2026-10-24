//frontend/src/components/site/subcontracting/contracts-section.tsx
'use client';

import * as React from 'react';
import { Ban, CheckCircle2, FilePlus2, Handshake, HandCoins, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { CategorySelect } from '@/components/site/category-select';
import { PhaseSelect } from '@/components/site/phase-select';
import { ProgressBar } from '@/components/site/progress-bar';
import { SectionHeader } from '@/components/site/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useQueuedSubmit } from '@/hooks/use-queued-submit';
import { useContract, useContracts, useSiteMutation, useSuppliers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { expenseStatusMeta, formatMoney } from '@/lib/format';
import { getPosition, newClientRef } from '@/lib/geo';
import { todayIso } from '@/lib/month';
import { contractPaymentLabels, contractStatusMeta, formatDay, statementStatusMeta, toNum } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Contract, ContractPaymentType, ProgressStatement } from '@/types/site';

/** Marches de sous-traitance : montant, situations de travaux, retenue de garantie, paiements. */
export function ContractsSection({ projectId, currency, permissions }: { projectId: string; currency: string; permissions: SitePermissions }) {
  const { data, isLoading, isError } = useContracts(projectId);
  const { data: suppliers } = useSuppliers(projectId, undefined, true);
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const money = (v: string | number) => formatMoney(v, currency);
  const supplierName = (id: string) => suppliers?.find((s) => s.id === id)?.name ?? 'Entreprise';

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <ErrorState message="Impossible de charger les marchés." />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Marchés"
        description="Chaque marché suit ce qui est dû à l'entreprise : situations de travaux validées, retenue de garantie, acomptes et paiements."
        action={
          permissions.owner && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> Nouveau marché
            </Button>
          )
        }
      />
      {data.length === 0 ? (
        <EmptyState icon={<Handshake className="h-6 w-6" />} title="Aucun marché" description="Un marché se crée en retenant un devis, ou directement ici." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c, i) => {
            const meta = contractStatusMeta[c.status];
            const amount = toNum(c.amount);
            return (
              <button key={c.id} type="button" onClick={() => setOpenId(c.id)} style={{ animationDelay: `${i * 40}ms` }} className="animate-card-in text-left transition-transform hover:-translate-y-0.5">
                <Card className="h-full rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-400">
                        Marché n°{c.number}
                        {c.phaseName ? ` · ${c.phaseName}` : ''}
                      </p>
                      <p className="truncate font-medium text-ink-900">{c.title}</p>
                      <p className="truncate text-xs text-ink-500">{supplierName(c.supplierId)}</p>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                  <p className="mt-3 font-ledger text-lg font-bold text-ink-900">{money(c.amount)}</p>
                  <ProgressBar className="mt-1.5 h-1.5" value={amount > 0 ? (toNum(c.summary.validatedWorks) / amount) * 100 : 0} tone="moss" />
                  <p className="mt-1 text-xs text-ink-400">Travaux validés : {money(c.summary.validatedWorks)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-concrete pt-3">
                    <div>
                      <p className="font-ledger text-sm font-semibold text-moss-600">{money(c.summary.dueNow)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">À payer maintenant</p>
                    </div>
                    <div>
                      <p className="font-ledger text-sm font-semibold text-ink-900">{money(c.summary.retentionHeld)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">Retenue détenue</p>
                    </div>
                  </div>
                  {c.summary.pendingStatements > 0 && <p className="mt-2 text-xs font-medium text-safety-600">{c.summary.pendingStatements} situation(s) à valider</p>}
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <CreateContractDialog open={creating} onClose={() => setCreating(false)} projectId={projectId} currency={currency} onCreated={(id) => setOpenId(id)} />
      <ContractDialog id={openId} onClose={() => setOpenId(null)} projectId={projectId} currency={currency} permissions={permissions} />
    </div>
  );
}

function CreateContractDialog({ open, onClose, projectId, currency, onCreated }: { open: boolean; onClose: () => void; projectId: string; currency: string; onCreated: (id: string) => void }) {
  const create = useSiteMutation(projectId, (v: Parameters<typeof siteService.createContract>[1]) => siteService.createContract(projectId, v), { success: 'Marché créé.', error: 'Impossible de créer le marché.' });
  const { data: suppliers } = useSuppliers(projectId, 'SUBCONTRACTOR');
  const [supplierId, setSupplierId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [retention, setRetention] = React.useState('5');
  const [phaseId, setPhaseId] = React.useState('');
  const [signedAt, setSignedAt] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setSupplierId('');
      setTitle('');
      setDescription('');
      setAmount('');
      setRetention('5');
      setPhaseId('');
      setSignedAt('');
    }
  }, [open]);
  const valid = !!supplierId && title.trim().length >= 3 && toNum(amount) > 0 && toNum(retention) >= 0 && toNum(retention) <= 20;

  return (
    <Dialog open={open} onClose={onClose} title="Nouveau marché" description="Contrat signé avec un sous-traitant pour un lot de travaux." maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const contract = await create.mutateAsync({
            supplierId,
            title: title.trim(),
            description: description.trim() || undefined,
            amount: toNum(amount),
            retentionPercent: toNum(retention),
            phaseId: phaseId || undefined,
            signedAt: signedAt || undefined,
          });
          onClose();
          onCreated(contract.id);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Entreprise" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choisir…</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Étape concernée">
            <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
          </FormField>
          <FormField label="Objet du marché" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </FormField>
          <FormField label={`Montant (${currency})`} required>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Retenue de garantie (%)" hint="Usuel : 5 %.">
            <Input type="number" inputMode="decimal" min={0} max={20} step="0.5" value={retention} onChange={(e) => setRetention(e.target.value)} />
          </FormField>
          <FormField label="Date de signature">
            <Input type="date" value={signedAt} max={todayIso()} onChange={(e) => setSignedAt(e.target.value)} />
          </FormField>
        </div>
        {(suppliers ?? []).length === 0 && <p className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">Ajoutez d&apos;abord l&apos;entreprise dans l&apos;onglet « Annuaire ».</p>}
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!valid}>
            Créer le marché
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ContractDialog({ id, onClose, projectId, currency, permissions }: { id: string | null; onClose: () => void; projectId: string; currency: string; permissions: SitePermissions }) {
  const { data: contract, isLoading } = useContract(projectId, id);
  const { isSupervisor } = useAuth();
  const complete = useSiteMutation(projectId, (cid: string) => siteService.completeContract(projectId, cid), { success: 'Marché terminé : la retenue peut être débloquée.', error: 'Impossible de terminer le marché.' });
  const [statementOpen, setStatementOpen] = React.useState(false);
  const [deciding, setDeciding] = React.useState<{ statement: ProgressStatement; decision: 'VALIDATED' | 'REJECTED' } | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  if (!id) return null;
  const money = (v: string | number) => formatMoney(v, currency);
  const active = contract?.status === 'ACTIVE';
  const canRelease = contract?.status === 'COMPLETED' && toNum(contract.summary.retentionHeld) - toNum(contract.summary.retentionReleased) > 0;

  return (
    <Dialog open onClose={onClose} title={contract ? `Marché n°${contract.number} · ${contract.title}` : 'Marché'} description={contract ? `${contract.supplier.name}${contract.supplier.trade ? ` — ${contract.supplier.trade}` : ''}` : undefined} maxWidth="max-w-3xl">
      {isLoading || !contract ? (
        <PageSpinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={contractStatusMeta[contract.status].label} tone={contractStatusMeta[contract.status].tone} />
            <span className="text-xs text-ink-400">
              Retenue de garantie {toNum(contract.retentionPercent)} %{contract.signedAt ? ` · signé le ${formatDay(contract.signedAt)}` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Montant du marché', value: contract.summary.contractAmount, strong: true },
              { label: 'Travaux validés', value: contract.summary.validatedWorks },
              { label: 'Reste à exécuter', value: contract.summary.remainingWorks },
              { label: 'Déjà payé', value: contract.summary.paidTotal },
              { label: 'À payer maintenant', value: contract.summary.dueNow, tone: 'text-moss-600' },
              { label: 'Retenue détenue', value: contract.summary.retentionHeld },
              { label: 'Acompte à récupérer', value: contract.summary.advanceOutstanding },
              { label: 'Reste à payer (max)', value: contract.summary.remainingToPay },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-paper/70 px-3 py-2.5">
                <p className={`truncate font-ledger text-sm font-semibold ${f.tone ?? 'text-ink-900'}`}>{money(f.value)}</p>
                <p className="text-[10px] uppercase tracking-wide text-ink-400">{f.label}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink-800">
                <ReceiptText className="h-4 w-4 text-blueprint-600" /> Situations de travaux ({contract.statements.length})
              </h3>
              {active && permissions.fieldWrite && (
                <Button size="sm" variant="outline" onClick={() => setStatementOpen(true)}>
                  <Plus className="h-4 w-4" /> Déclarer
                </Button>
              )}
            </div>
            {contract.statements.length === 0 ? (
              <p className="rounded-xl bg-paper/70 px-3 py-4 text-center text-sm text-ink-400">Aucune situation : l&apos;entreprise déclare régulièrement le cumul des travaux réalisés.</p>
            ) : (
              <ul className="space-y-2.5">
                {contract.statements.map((s) => (
                  <StatementCard key={s.id} statement={s} money={money} projectId={projectId} canDecide={permissions.decide} onDecide={(decision) => setDeciding({ statement: s, decision })} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink-800">
                <HandCoins className="h-4 w-4 text-moss-600" /> Paiements ({contract.payments.length})
              </h3>
              {isSupervisor && (active || canRelease) && (
                <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
                  <Plus className="h-4 w-4" /> Enregistrer un paiement
                </Button>
              )}
            </div>
            {contract.payments.length === 0 ? (
              <p className="rounded-xl bg-paper/70 px-3 py-4 text-center text-sm text-ink-400">Aucun paiement. Chaque paiement crée une dépense à valider par le client.</p>
            ) : (
              <ul className="space-y-2.5">
                {contract.payments.map((p) => {
                  const expense = p.expenseStatus ? expenseStatusMeta[p.expenseStatus] : null;
                  return (
                    <li key={p.id} className="rounded-xl border border-concrete bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">{contractPaymentLabels[p.type]}</p>
                          <p className="text-xs text-ink-400">
                            {formatDay(p.date)}
                            {p.reference ? ` · ${p.reference}` : ''}
                            {p.recordedByName ? ` · ${p.recordedByName}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-ledger text-sm font-semibold text-ink-900">{money(p.amount)}</p>
                          {expense && <StatusBadge label={`Dépense : ${expense.label}`} tone={expense.tone} />}
                        </div>
                      </div>
                      {p.note && <p className="mt-1.5 text-xs text-ink-500">{p.note}</p>}
                      <div className="mt-2.5 border-t border-concrete pt-2.5">
                        <AttachmentsSection
                          target={{ projectId, entityType: 'ContractPayment', entityId: p.id }}
                          kindOptions={[
                            { value: 'recu', label: 'Reçu signé' },
                            { value: 'facture', label: 'Facture' },
                            { value: 'document', label: 'Document' },
                          ]}
                          readOnly={p.expenseStatus === 'APPROVED' || p.expenseStatus === 'REJECTED' || p.expenseStatus === 'CANCELLED'}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {permissions.owner && active && (
            <div className="flex flex-wrap justify-between gap-2 border-t border-concrete pt-4">
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                <Ban className="h-4 w-4 text-clay-500" /> Annuler le marché
              </Button>
              <Button variant="outline" onClick={() => setCompleting(true)}>
                <CheckCircle2 className="h-4 w-4" /> Marquer terminé
              </Button>
            </div>
          )}
          {contract.status === 'COMPLETED' && toNum(contract.summary.retentionHeld) > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-blueprint-50/70 px-3 py-2.5 text-sm text-blueprint-700">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Retenue de garantie encore détenue : {money(toNum(contract.summary.retentionHeld) - toNum(contract.summary.retentionReleased))}.
            </p>
          )}
        </div>
      )}
      {contract && <StatementDialog open={statementOpen} onClose={() => setStatementOpen(false)} projectId={projectId} contract={contract} currency={currency} />}
      {contract && <DecideDialog target={deciding} onClose={() => setDeciding(null)} projectId={projectId} contract={contract} />}
      {contract && <PaymentDialog open={paying} onClose={() => setPaying(false)} projectId={projectId} contract={contract} currency={currency} />}
      {contract && <CancelDialog open={cancelling} onClose={() => setCancelling(false)} projectId={projectId} contract={contract} />}
      <ConfirmDialog
        open={completing}
        onClose={() => setCompleting(false)}
        onConfirm={async () => {
          if (!contract) return;
          await complete.mutateAsync(contract.id).catch(() => undefined);
          setCompleting(false);
        }}
        title="Marquer ce marché comme terminé ?"
        description="Plus aucune situation ne pourra être déclarée ; seule la retenue de garantie pourra encore être débloquée."
        confirmLabel="Terminer"
        loading={complete.isPending}
      />
    </Dialog>
  );
}

function StatementCard({ statement: s, money, projectId, canDecide, onDecide }: { statement: ProgressStatement; money: (v: string | number) => string; projectId: string; canDecide: boolean; onDecide: (decision: 'VALIDATED' | 'REJECTED') => void }) {
  const meta = statementStatusMeta[s.status];
  return (
    <li className="rounded-xl border border-concrete bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-900">Situation n°{s.number}</p>
          <p className="text-xs text-ink-400">
            Arrêtée au {formatDay(s.periodEnd)}
            {s.submittedByName ? ` · ${s.submittedByName}` : ''}
          </p>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-400">Cumul des travaux</dt>
          <dd className="font-ledger font-semibold text-ink-900">{money(s.cumulativeAmount)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Cette période</dt>
          <dd className="font-ledger font-semibold text-ink-900">{money(s.amountThisPeriod)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Retenue / acompte</dt>
          <dd className="font-ledger text-ink-700">
            −{money(s.retentionAmount)}
            {toNum(s.advanceRecovered) > 0 ? ` / −${money(s.advanceRecovered)}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">Net à payer</dt>
          <dd className="font-ledger font-semibold text-moss-600">{money(s.netPayable)}</dd>
        </div>
      </dl>
      {s.status === 'VALIDATED' && <p className="mt-1.5 text-xs text-ink-400">Déjà payé : {money(s.paid)}</p>}
      {s.note && <p className="mt-1.5 text-xs text-ink-500">{s.note}</p>}
      {s.decisionNote && (
        <p className="mt-1.5 text-xs text-ink-500">
          {s.decidedByName ?? 'Décision'} : {s.decisionNote}
        </p>
      )}
      <div className="mt-2.5 border-t border-concrete pt-2.5">
        <AttachmentsSection
          target={{ projectId, entityType: 'ProgressStatement', entityId: s.id }}
          kindOptions={[
            { value: 'situation', label: 'Situation signée' },
            { value: 'photo', label: 'Photo des travaux' },
            { value: 'document', label: 'Document' },
          ]}
          readOnly={s.status !== 'SUBMITTED'}
        />
      </div>
      {canDecide && s.status === 'SUBMITTED' && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onDecide('REJECTED')}>
            Refuser
          </Button>
          <Button size="sm" onClick={() => onDecide('VALIDATED')}>
            <CheckCircle2 className="h-4 w-4" /> Valider
          </Button>
        </div>
      )}
    </li>
  );
}

function StatementDialog({ open, onClose, projectId, contract, currency }: { open: boolean; onClose: () => void; projectId: string; contract: Contract; currency: string }) {
  const submit = useSiteMutation(projectId, (v: Parameters<typeof siteService.submitStatement>[2]) => siteService.submitStatement(projectId, contract.id, v), { success: 'Situation déclarée : elle attend la validation.', error: 'Impossible de déclarer la situation.' });
  const [periodEnd, setPeriodEnd] = React.useState('');
  const [cumulative, setCumulative] = React.useState('');
  const [advance, setAdvance] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setPeriodEnd(todayIso());
      setCumulative('');
      setAdvance('');
      setNote('');
    }
  }, [open]);
  const previous = contract.statements.filter((s) => s.status !== 'REJECTED').reduce((max, s) => Math.max(max, toNum(s.cumulativeAmount)), 0);
  const thisPeriod = toNum(cumulative) - previous;
  const retention = (thisPeriod * toNum(contract.retentionPercent)) / 100;
  const maxAdvance = toNum(contract.summary.advanceOutstanding);
  const net = thisPeriod - retention - toNum(advance);
  const valid = !!periodEnd && toNum(cumulative) > previous && toNum(cumulative) <= toNum(contract.amount) && toNum(advance) >= 0 && toNum(advance) <= maxAdvance && net >= 0;

  return (
    <Dialog open={open} onClose={onClose} title="Déclarer une situation de travaux" description="Indiquez le cumul de tous les travaux réalisés depuis le début du marché." maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await submit.mutateAsync({ periodEnd, cumulativeAmount: toNum(cumulative), advanceRecovered: advance ? toNum(advance) : undefined, note: note.trim() || undefined });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Arrêtée au" required>
            <Input type="date" value={periodEnd} max={todayIso()} onChange={(e) => setPeriodEnd(e.target.value)} />
          </FormField>
          <FormField label={`Cumul des travaux (${currency})`} required hint={`Précédent : ${formatMoney(previous, currency)} · marché : ${formatMoney(contract.amount, currency)}`}>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={cumulative} onChange={(e) => setCumulative(e.target.value)} />
          </FormField>
          {maxAdvance > 0 && (
            <FormField label="Acompte récupéré sur cette situation" hint={`Acompte restant à récupérer : ${formatMoney(maxAdvance, currency)}`}>
              <Input type="number" inputMode="decimal" min={0} max={maxAdvance} step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} />
            </FormField>
          )}
        </div>
        <FormField label="Remarques">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        {toNum(cumulative) > 0 && (
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-blueprint-50/60 px-4 py-3 text-center">
            <div>
              <p className="font-ledger text-sm font-bold text-ink-900">{formatMoney(Math.max(thisPeriod, 0), currency)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Cette période</p>
            </div>
            <div>
              <p className="font-ledger text-sm font-bold text-safety-500">−{formatMoney(Math.max(retention, 0), currency)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Retenue</p>
            </div>
            <div>
              <p className="font-ledger text-sm font-bold text-moss-600">{formatMoney(Math.max(net, 0), currency)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Net estimé</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={submit.isPending} disabled={!valid}>
            Déclarer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DecideDialog({ target, onClose, projectId, contract }: { target: { statement: ProgressStatement; decision: 'VALIDATED' | 'REJECTED' } | null; onClose: () => void; projectId: string; contract: Contract }) {
  const decide = useSiteMutation(projectId, (v: { statementId: string; decision: 'VALIDATED' | 'REJECTED'; note?: string }) => siteService.decideStatement(projectId, contract.id, v.statementId, { decision: v.decision, note: v.note }), {
    success: (_: Contract) => 'Décision enregistrée.',
    error: "Impossible d'enregistrer la décision.",
  });
  const [note, setNote] = React.useState('');
  React.useEffect(() => setNote(''), [target]);
  if (!target) return null;
  const validating = target.decision === 'VALIDATED';
  const needsNote = !validating;
  return (
    <Dialog open onClose={onClose} title={`${validating ? 'Valider' : 'Refuser'} la situation n°${target.statement.number}`} description={validating ? 'Une fois validée, la situation peut être payée.' : "L'entreprise devra déclarer une nouvelle situation."}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (needsNote && note.trim().length < 3) return;
          await decide.mutateAsync({ statementId: target.statement.id, decision: target.decision, note: note.trim() || undefined });
          onClose();
        }}
      >
        <FormField label={needsNote ? 'Motif du refus' : 'Remarque'} required={needsNote}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Retour
          </Button>
          <Button type="submit" variant={validating ? undefined : 'danger'} loading={decide.isPending} disabled={needsNote && note.trim().length < 3}>
            {validating ? 'Valider la situation' : 'Refuser la situation'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PaymentDialog({ open, onClose, projectId, contract, currency }: { open: boolean; onClose: () => void; projectId: string; contract: Contract; currency: string }) {
  const { submit, pending } = useQueuedSubmit(projectId);
  const [type, setType] = React.useState<ContractPaymentType>('STATEMENT');
  const [amount, setAmount] = React.useState('');
  const [statementId, setStatementId] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [locating, setLocating] = React.useState(false);

  const payable = contract.statements.filter((s) => s.status === 'VALIDATED' && toNum(s.netPayable) - toNum(s.paid) > 0);
  const completed = contract.status === 'COMPLETED';
  const types: ContractPaymentType[] = completed ? ['RETENTION_RELEASE'] : ['STATEMENT', 'ADVANCE', 'OTHER'];

  React.useEffect(() => {
    if (!open) return;
    const first = completed ? 'RETENTION_RELEASE' : payable.length > 0 ? 'STATEMENT' : 'ADVANCE';
    setType(first);
    setStatementId(first === 'STATEMENT' ? (payable[0]?.id ?? '') : '');
    setAmount(first === 'STATEMENT' && payable[0] ? String(toNum(payable[0].netPayable) - toNum(payable[0].paid)) : completed ? String(toNum(contract.summary.retentionHeld) - toNum(contract.summary.retentionReleased)) : '');
    setCategoryId('');
    setDate(todayIso());
    setReference('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickType = (next: ContractPaymentType) => {
    setType(next);
    if (next === 'STATEMENT') {
      const target = payable[0];
      setStatementId(target?.id ?? '');
      setAmount(target ? String(toNum(target.netPayable) - toNum(target.paid)) : '');
    } else {
      setStatementId('');
      setAmount('');
    }
  };
  const pickStatement = (sid: string) => {
    setStatementId(sid);
    const target = payable.find((s) => s.id === sid);
    if (target) setAmount(String(toNum(target.netPayable) - toNum(target.paid)));
  };
  const valid = toNum(amount) > 0 && !!categoryId && (type !== 'STATEMENT' || !!statementId) && !!date;

  return (
    <Dialog open={open} onClose={onClose} title="Enregistrer un paiement" description="Le paiement est comptabilisé comme une dépense que le client valide. Joignez ensuite le reçu signé." maxWidth="max-w-xl">
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
              kind: 'contract-payment',
              label: `Paiement ${contractPaymentLabels[type].toLowerCase()} — ${contract.supplier.name} : ${formatMoney(amount, currency)}`,
              method: 'POST',
              path: `/projects/${projectId}/contracts/${contract.id}/payments`,
              body: {
                type,
                amount: toNum(amount),
                categoryId,
                date,
                statementId: type === 'STATEMENT' ? statementId : undefined,
                reference: reference.trim() || undefined,
                note: note.trim() || undefined,
                latitude: position?.latitude,
                longitude: position?.longitude,
                clientRef: newClientRef(),
              },
            },
            'Paiement enregistré : la dépense attend la validation. Pensez à joindre le reçu.',
          );
          if (result) onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nature du paiement" required>
            <Select value={type} onChange={(e) => pickType(e.target.value as ContractPaymentType)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {contractPaymentLabels[t]}
                </option>
              ))}
            </Select>
          </FormField>
          {type === 'STATEMENT' && (
            <FormField label="Situation à payer" required>
              <Select value={statementId} onChange={(e) => pickStatement(e.target.value)}>
                <option value="">{payable.length === 0 ? 'Aucune situation validée à payer' : 'Choisir…'}</option>
                {payable.map((s) => (
                  <option key={s.id} value={s.id}>
                    N°{s.number} — reste {formatMoney(toNum(s.netPayable) - toNum(s.paid), currency)}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label={`Montant (${currency})`} required>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Date du paiement" required>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Catégorie de dépense" required>
            <CategorySelect value={categoryId} onChange={setCategoryId} guess={/sous.?trait|entreprise|prestat|main.?d.?(oe|œ)uvre/i} />
          </FormField>
          <FormField label="Référence (n° de reçu, virement…)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </FormField>
        </div>
        <FormField label="Remarque">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending || locating} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ open, onClose, projectId, contract }: { open: boolean; onClose: () => void; projectId: string; contract: Contract }) {
  const cancel = useSiteMutation(projectId, (reason: string) => siteService.cancelContract(projectId, contract.id, reason), { success: 'Marché annulé.', error: "Impossible d'annuler le marché." });
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Annuler ce marché" description="Les paiements déjà enregistrés restent comptabilisés.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (reason.trim().length < 3) return;
          await cancel.mutateAsync(reason.trim());
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
            Annuler le marché
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
