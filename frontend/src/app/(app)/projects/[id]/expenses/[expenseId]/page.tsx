// ============================================================================
// app/(app)/projects/[id]/expenses/[expenseId]/page.tsx - v1.1
// - En-tete : icone ronde coloree selon le statut (meme convention que
//   AuditEntryCard/ExpenseCard) au lieu d'un simple bloc texte.
// - Grille de champs : grid-cols-2 fixe (risque de tassement sur mobile
//   etroit) remplacee par grid-cols-1 sm:grid-cols-2, mise sur fond bg-paper
//   pour la detacher visuellement du reste de la carte ; champs longs
//   ("Enregistree par", Observation, Motif) passent en pleine largeur via
//   sm:col-span-2.
// - Bloc "Paiement fournisseur" : icone CreditCard ajoutee, PaymentStatusEditor
//   passe en colonne sur mobile (Select/input/bouton pleine largeur) au lieu
//   de flex-wrap qui pouvait ecraser les elements.
// - Icone Truck ajoutee au-dessus de la section pieces jointes pour reperage
//   visuel rapide, coherent avec le reste des sections.
// Aucun changement de logique/mutations.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Ban, Check, CreditCard, Paperclip, Pencil, ReceiptText, X } from 'lucide-react';
import { useExpense, useApproveExpense, useRejectExpense, useCancelExpense, useUpdateExpensePayment } from '@/hooks/use-expenses';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { CorrectionDialog } from '@/components/shared/correction-dialog';
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

  const { data: expense, isLoading, isError } = useExpense(params.expenseId);
  const approveMutation = useApproveExpense(params.id);
  const rejectMutation = useRejectExpense(params.id);
  const cancelMutation = useCancelExpense(params.id);
  const paymentMutation = useUpdateExpensePayment(params.id);

  const correctMutation = useMutation({
    mutationFn: ({ newTotal, reason }: { newTotal: number; reason: string }) => expensesService.correct(params.expenseId, newTotal, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', params.id] });
      toast.success('Correction appliquee, historique conserve.');
      setCorrecting(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Correction impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !expense) return <ErrorState message="Impossible de charger cette depense." />;

  const canAct = isClient && expense.status === 'PENDING';
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
            <StatusBadge label={expenseStatusMeta[expense.status].label} tone={statusTone} className="shrink-0" />
          </div>

          <dl className="grid grid-cols-1 gap-4 rounded-card bg-paper px-4 py-3.5 text-sm sm:grid-cols-2">
            <Field label="Date" value={formatDateTime(expense.date)} />
            <Field label="Quantite" value={`${expense.quantity} ${expense.unit} × ${formatMoney(expense.unitPrice, '')}`} />
            <Field label="Fournisseur" value={expense.supplier || '-'} />
            <Field label="Reference facture" value={expense.invoiceReference || '-'} />
            {expense.supervisor && <Field label="Enregistree par" value={`${expense.supervisor.firstName} ${expense.supervisor.lastName}`} full />}
            {expense.observation && <Field label="Observation" value={expense.observation} full />}
            {expense.rejectionReason && <Field label="Motif" value={expense.rejectionReason} full />}
          </dl>

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
                Verse : <span className="font-ledger">{formatMoney(expense.amountPaidToSupplier, '')}</span> — Reste du :{' '}
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
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Pieces jointes</p>
            </div>
            <AttachmentsSection target={{ expenseId: expense.id }} readOnly={expense.isLocked && !isSuperadmin} />
          </div>

          {(canAct || (isSuperadmin && expense.status === 'APPROVED')) && (
            <div className="flex flex-wrap gap-2 border-t border-concrete pt-4">
              {canAct && (
                <>
                  <Button onClick={() => approveMutation.mutate(expense.id)} loading={approveMutation.isPending}>
                    <Check className="h-4 w-4" /> Valider
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                </>
              )}
              {isSuperadmin && expense.status === 'APPROVED' && (
                <>
                  <Button variant="outline" onClick={() => setCorrecting(true)}>
                    <Pencil className="h-4 w-4" /> Correction administrative
                  </Button>
                  <Button variant="danger" onClick={() => setCancelling(true)}>
                    <Ban className="h-4 w-4" /> Annuler la depense
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => rejectMutation.mutate({ id: expense.id, reason }, { onSuccess: () => setRejecting(false) })}
        title="Refuser cette depense"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />

      <ReasonDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => cancelMutation.mutate({ id: expense.id, reason }, { onSuccess: () => setCancelling(false) })}
        title="Annuler cette depense validee"
        description="Le montant reste visible dans l'historique. Le solde du projet sera recalcule."
        confirmLabel="Annuler la depense"
        danger
        isLoading={cancelMutation.isPending}
      />

      <CorrectionDialog
        open={correcting}
        onClose={() => setCorrecting(false)}
        currentAmount={expense.total}
        currency=""
        onConfirm={(newTotal, reason) => correctMutation.mutate({ newTotal, reason })}
        isLoading={correctMutation.isPending}
      />
    </div>
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
        <option value="PAID_FULL">Paye totalement</option>
        <option value="PARTIAL">Acompte / avance</option>
        <option value="CREDIT">A credit / differe</option>
      </Select>
      {status === 'PARTIAL' && (
        <input
          type="number"
          placeholder="Montant verse"
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
        Mettre a jour
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