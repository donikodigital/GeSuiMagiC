//frontend/src/app/(app)/projects/[id]/expenses/[expenseId]/page.tsx
// Fiche depense : validation du client, justificatif obligatoire au-dessus du seuil, validation technique prealable
// (conducteur de travaux / architecte), rattachement a une etape et a un fournisseur, position de saisie.
// Bouton "Contacter le superadmin" pour le client.

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ArrowLeft, Ban, Check, CreditCard, HardHat, Layers, MapPinOff, MessageCircle, Paperclip, Pencil, ReceiptText, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  useExpense,
  useApproveExpense,
  useRejectExpense,
  useCancelExpense,
  useUpdateExpensePayment,
  useUpdateExpense,
  useRemoveExpense,
  useToggleArchiveExpense,
} from '@/hooks/use-expenses';
import { useCreateMessage } from '@/hooks/use-messages';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { CorrectionDialog } from '@/components/shared/correction-dialog';
import { EditExpenseDialog } from '@/components/expenses/edit-expense-dialog';
import { ComposeMessageDialog } from '@/components/messages/compose-message-dialog';
import { PhaseSelect } from '@/components/site/phase-select';
import { useSiteMutation, useSitePermissions, useSuppliers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { techReviewMeta } from '@/lib/site-format';
import { usePhases } from '@/hooks/use-attendance';
import { expenseStatusMeta, expensePaymentStatusMeta, formatDateTime, formatMoney } from '@/lib/format';
import { expensesService } from '@/services/expenses.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import type { ExpensePaymentStatus } from '@/types/models';

const TONE_ICON_BG: Record<string, string> = {
  moss: 'bg-moss-50 text-moss-600',
  safety: 'bg-safety-50 text-safety-500',
  clay: 'bg-clay-50 text-clay-600',
  ink: 'bg-ink-50 text-ink-600',
  blueprint: 'bg-blueprint-50 text-blueprint-700',
};

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string; expenseId: string }>();
  const router = useRouter();
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [correcting, setCorrecting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [contacting, setContacting] = React.useState(false);
  const [reviewing, setReviewing] = React.useState<'APPROVED' | 'REJECTED' | null>(null);
  const [allocating, setAllocating] = React.useState(false);
  const permissions = useSitePermissions(params.id);
  const { data: phases } = usePhases(params.id);

  const { data: expense, isLoading, isError } = useExpense(params.expenseId);
  const approveMutation = useApproveExpense(params.id);
  const rejectMutation = useRejectExpense(params.id);
  const cancelMutation = useCancelExpense(params.id);
  const paymentMutation = useUpdateExpensePayment(params.id);
  const updateMutation = useUpdateExpense(params.id);
  const removeMutation = useRemoveExpense(params.id);
  const archiveMutation = useToggleArchiveExpense(params.id);
  const createMessageMutation = useCreateMessage();

  const correctMutation = useMutation({
    mutationFn: ({ newTotal, reason }: { newTotal: number; reason: string }) => expensesService.correct(params.expenseId, newTotal, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', params.id] });
      toast.success('Correction appliquée, historique conservée.');
      setCorrecting(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Correction impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !expense) return <ErrorState message="Impossible de charger cette dépense." />;

  const techPending = expense.status === 'PENDING' && expense.techReviewStatus === 'PENDING';
  const receiptMissing = !!expense.receiptRequired && !expense.hasReceipt;
  const canTechReview = techPending && permissions.techReview;
  // Le client valide apres la validation technique (si elle est requise) et avec le justificatif (si requis).
  const canAct = isClient && expense.status === 'PENDING';
  const approveBlocked = techPending || receiptMissing;
  const canAllocate = (isSuperadmin || isClient || isSupervisor) && expense.status !== 'CANCELLED';
  const canUpdatePayment = (isSupervisor || isSuperadmin) && expense.status === 'APPROVED';
  const statusTone = expenseStatusMeta[expense.status].tone;

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[statusTone]}`}>
                <ReceiptText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wide text-ink-400">{expense.category?.name}</p>
                <p className="truncate font-display text-lg font-semibold text-ink-900">{expense.label}</p>
                <p className="font-ledger text-2xl font-bold text-ink-900">{formatMoney(expense.total, '')}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {expense.isArchived && <StatusBadge label="Archivee" tone="ink" />}
              <StatusBadge label={expenseStatusMeta[expense.status].label} tone={statusTone} />
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 rounded-card bg-paper px-4 py-3.5 text-sm sm:grid-cols-2">
            <Field label="Date" value={formatDateTime(expense.date)} />
            <Field label="Quantité" value={`${expense.quantity} ${expense.unit} × ${formatMoney(expense.unitPrice, '')}`} />
            <Field label="Fournisseur" value={expense.supplier || '-'} />
            <Field label="Étape du chantier" value={phases?.find((ph) => ph.id === expense.phaseId)?.name ?? 'Non rattachée'} />
            <Field label="Référence facture" value={expense.invoiceReference || '-'} />
            {expense.supervisor && <Field label="Enregistrée par" value={`${expense.supervisor.firstName} ${expense.supervisor.lastName}`} full />}
            {expense.observation && <Field label="Observation" value={expense.observation} full />}
            {expense.rejectionReason && <Field label="Motif" value={expense.rejectionReason} full />}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {expense.techReviewStatus && expense.techReviewStatus !== 'NOT_REQUIRED' && <StatusBadge label={techReviewMeta[expense.techReviewStatus].label} tone={techReviewMeta[expense.techReviewStatus].tone} />}
            {expense.receiptRequired && <StatusBadge label={expense.hasReceipt ? 'Justificatif joint' : 'Justificatif obligatoire manquant'} tone={expense.hasReceipt ? 'moss' : 'clay'} />}
            {expense.latitude && expense.isOffSite && (
              <span className="inline-flex items-center gap-1 rounded-full bg-clay-50 px-2.5 py-0.5 text-xs font-medium text-clay-600">
                <MapPinOff className="h-3.5 w-3.5" /> Saisie hors du chantier
              </span>
            )}
            {canAllocate && (
              <Button size="sm" variant="ghost" onClick={() => setAllocating(true)}>
                <Layers className="h-4 w-4" /> Étape / fournisseur
              </Button>
            )}
          </div>

          {expense.techReviewNote && (
            <p className="rounded-card bg-paper px-4 py-3 text-sm text-ink-600">
              <span className="font-medium text-ink-800">Avis technique : </span>
              {expense.techReviewNote}
            </p>
          )}

          {canTechReview && (
            <div className="rounded-card border border-safety-200 bg-safety-50/60 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <HardHat className="h-4 w-4 text-safety-500" /> Cette dépense attend votre validation technique
              </div>
              <p className="mt-1 text-xs text-ink-500">Vérifiez que le montant et les quantités correspondent aux travaux réalisés, puis le client validera le paiement.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setReviewing('APPROVED')}>
                  <ShieldCheck className="h-4 w-4" /> Valider techniquement
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReviewing('REJECTED')}>
                  <X className="h-4 w-4" /> Refuser
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-card border border-concrete bg-white px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-ink-400" />
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Paiement fournisseur</p>
              </div>
              <StatusBadge label={expensePaymentStatusMeta[expense.paymentStatus].label} tone={expensePaymentStatusMeta[expense.paymentStatus].tone} />
            </div>
            {expense.paymentStatus === 'PARTIAL' && (
              <p className="mt-2 text-sm text-ink-600">
                Versé : <span className="font-ledger">{formatMoney(expense.amountPaidToSupplier, '')}</span> — Reste dû :{' '}
                <span className="font-ledger font-medium">{formatMoney(expense.balanceDueToSupplier ?? '0', '')}</span>
              </p>
            )}
            {canUpdatePayment && (
              <PaymentStatusEditor
                current={expense.paymentStatus}
                total={expense.total}
                onSave={(paymentStatus, amountPaidToSupplier) => paymentMutation.mutate({ id: expense.id, paymentStatus, amountPaidToSupplier })}
                isLoading={paymentMutation.isPending}
              />
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-ink-400" />
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Pièces jointes</p>
            </div>
            <AttachmentsSection target={{ expenseId: expense.id }} readOnly={expense.isLocked && !isSuperadmin} />
            {receiptMissing && <p className="mt-2 text-xs text-clay-600">Joignez la facture ou le reçu : sans lui, cette dépense ne peut pas être validée.</p>}
          </div>

          {(canAct || isSuperadmin || isClient) && (
            <div className="flex flex-wrap gap-2 border-t border-concrete pt-4">
              {canAct && (
                <>
                  <Button
                    onClick={() => approveMutation.mutate(expense.id)}
                    loading={approveMutation.isPending}
                    disabled={approveBlocked}
                    title={techPending ? 'En attente de la validation technique' : receiptMissing ? 'Justificatif manquant' : undefined}
                  >
                    <Check className="h-4 w-4" /> Valider
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                </>
              )}
              {isClient && (
                <Button variant="outline" onClick={() => setContacting(true)}>
                  <MessageCircle className="h-4 w-4" /> Contacter le superadmin
                </Button>
              )}
              {isSuperadmin && (
                <>
                  {expense.status === 'APPROVED' && (
                    <>
                      <Button variant="outline" onClick={() => setCorrecting(true)}>
                        <Pencil className="h-4 w-4" /> Correction du montant
                      </Button>
                      <Button variant="danger" onClick={() => setCancelling(true)}>
                        <Ban className="h-4 w-4" /> Annuler la validation
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                  <Button
                    variant="outline"
                    loading={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate({ id: expense.id, archive: !expense.isArchived })}
                  >
                    {expense.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {expense.isArchived ? 'Desarchiver' : 'Archiver'}
                  </Button>
                  {expense.status !== 'CANCELLED' && (
                    <Button variant="danger" onClick={() => setDeleting(true)}>
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TechReviewDialog decision={reviewing} onClose={() => setReviewing(null)} projectId={params.id} expenseId={expense.id} />
      <AllocationDialog open={allocating} onClose={() => setAllocating(false)} projectId={params.id} expenseId={expense.id} phaseId={expense.phaseId ?? ''} supplierId={expense.supplierId ?? ''} />

      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => rejectMutation.mutate({ id: expense.id, reason }, { onSuccess: () => setRejecting(false) })}
        title="Réfuser cette dépense"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />

      <ReasonDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => cancelMutation.mutate({ id: expense.id, reason }, { onSuccess: () => setCancelling(false) })}
        title="Annuler cette dépense validée"
        description="Le montant reste visible dans l'historique. Le solde du projet sera recalculé."
        confirmLabel="Annuler la dépense"
        danger
        isLoading={cancelMutation.isPending}
      />

      <ReasonDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={(reason) => removeMutation.mutate({ id: expense.id, reason }, { onSuccess: () => setDeleting(false) })}
        title="Supprimer cette dépense"
        description="La dépense ne sera jamais effacée physiquement : elle passe en statut Annulée et reste consultable dans l'historique. Le client sera notifié."
        confirmLabel="Supprimer la dépense"
        danger
        isLoading={removeMutation.isPending}
      />

      <CorrectionDialog
        open={correcting}
        onClose={() => setCorrecting(false)}
        currentAmount={expense.total}
        currency=""
        onConfirm={(newTotal, reason) => correctMutation.mutate({ newTotal, reason })}
        isLoading={correctMutation.isPending}
      />

      <EditExpenseDialog
        open={editing}
        onClose={() => setEditing(false)}
        expense={expense}
        onConfirm={(payload) => updateMutation.mutate({ id: expense.id, payload }, { onSuccess: () => setEditing(false) })}
        isLoading={updateMutation.isPending}
      />

      <ComposeMessageDialog
        open={contacting}
        onClose={() => setContacting(false)}
        isSuperadmin={false}
        isLoading={createMessageMutation.isPending}
        defaultValues={{
          type: 'MODIFICATION_REQUEST',
          subject: `Dépense "${expense.label}" du ${formatDateTime(expense.date)} - ${formatMoney(expense.total, '')}`,
          relatedEntityType: 'Expense',
          relatedEntityId: expense.id,
        }}
        onSubmit={(payload) => createMessageMutation.mutate(payload, { onSuccess: () => setContacting(false) })}
      />
    </div>
  );
}

function TechReviewDialog({ decision, onClose, projectId, expenseId }: { decision: 'APPROVED' | 'REJECTED' | null; onClose: () => void; projectId: string; expenseId: string }) {
  const review = useSiteMutation(projectId, (v: { decision: 'APPROVED' | 'REJECTED'; note?: string }) => siteService.techReview(expenseId, v), { success: 'Avis technique enregistré.', error: "Impossible d'enregistrer l'avis." });
  const [note, setNote] = React.useState('');
  React.useEffect(() => setNote(''), [decision]);
  if (!decision) return null;
  const refusing = decision === 'REJECTED';
  return (
    <Dialog open onClose={onClose} title={refusing ? 'Refuser techniquement' : 'Valider techniquement'} description={refusing ? 'La dépense sera refusée : indiquez pourquoi.' : 'Le client pourra ensuite valider le paiement.'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (refusing && note.trim().length < 3) return;
          await review.mutateAsync({ decision, note: note.trim() || undefined });
          onClose();
        }}
      >
        <FormField label={refusing ? 'Motif du refus' : 'Remarque (facultatif)'} required={refusing}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Retour
          </Button>
          <Button type="submit" variant={refusing ? 'danger' : undefined} loading={review.isPending} disabled={refusing && note.trim().length < 3}>
            {refusing ? 'Refuser' : 'Valider'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AllocationDialog({ open, onClose, projectId, expenseId, phaseId: initialPhase, supplierId: initialSupplier }: { open: boolean; onClose: () => void; projectId: string; expenseId: string; phaseId: string; supplierId: string }) {
  const allocate = useSiteMutation(projectId, (v: { phaseId: string | null; supplierId: string | null }) => siteService.allocateExpense(expenseId, v), { success: 'Dépense rattachée.', error: 'Impossible de rattacher la dépense.' });
  const { data: suppliers } = useSuppliers(projectId);
  const [phaseId, setPhaseId] = React.useState(initialPhase);
  const [supplierId, setSupplierId] = React.useState(initialSupplier);
  React.useEffect(() => {
    if (open) {
      setPhaseId(initialPhase);
      setSupplierId(initialSupplier);
    }
  }, [open, initialPhase, initialSupplier]);
  return (
    <Dialog open={open} onClose={onClose} title="Rattacher la dépense" description="Le coût réel de chaque étape se calcule à partir de ce rattachement.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await allocate.mutateAsync({ phaseId: phaseId || null, supplierId: supplierId || null });
          onClose();
        }}
      >
        <FormField label="Étape du chantier">
          <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} emptyLabel="Non rattachée" />
        </FormField>
        <FormField label="Fournisseur de l'annuaire">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Aucun</option>
            {(suppliers ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={allocate.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PaymentStatusEditor({
  current,
  total,
  onSave,
  isLoading,
}: {
  current: ExpensePaymentStatus;
  total: string;
  onSave: (status: ExpensePaymentStatus, amountPaidToSupplier?: number) => void;
  isLoading: boolean;
}) {
  const [status, setStatus] = React.useState<ExpensePaymentStatus>(current);
  const [amount, setAmount] = React.useState('');

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-concrete-light pt-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={status} onChange={(e) => setStatus(e.target.value as ExpensePaymentStatus)} className="w-full sm:w-44">
        <option value="PAID_FULL">Payé totalement</option>
        <option value="PARTIAL">Acompte / avance</option>
        <option value="CREDIT">A crédit / différé</option>
      </Select>
      {status === 'PARTIAL' && (
        <input
          type="number"
          placeholder="Montant versé"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-10 w-full rounded-md border border-concrete-dark px-3 text-sm sm:w-40"
        />
      )}
      <Button
        size="sm"
        variant="outline"
        loading={isLoading}
        onClick={() => onSave(status, status === 'PARTIAL' ? Number(amount) : undefined)}
        className="w-full sm:w-auto"
      >
        Mettre à jour
      </Button>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-ink-800">{value}</dd>
    </div>
  );
}