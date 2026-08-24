//frontend/src/app/(app)/projects/[id]/expenses/[expenseId]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, X, Pencil, Ban } from 'lucide-react';
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

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">{expense.category?.name}</p>
              <p className="font-display text-lg font-semibold text-ink-900">{expense.label}</p>
              <p className="font-ledger text-2xl font-semibold text-ink-900">{formatMoney(expense.total, '')}</p>
            </div>
            <StatusBadge label={expenseStatusMeta[expense.status].label} tone={expenseStatusMeta[expense.status].tone} />
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Date" value={formatDateTime(expense.date)} />
            <Field label="Quantite" value={`${expense.quantity} ${expense.unit} × ${formatMoney(expense.unitPrice, '')}`} />
            <Field label="Fournisseur" value={expense.supplier || '-'} />
            <Field label="Reference facture" value={expense.invoiceReference || '-'} />
            {expense.supervisor && <Field label="Enregistree par" value={`${expense.supervisor.firstName} ${expense.supervisor.lastName}`} />}
            {expense.observation && <Field label="Observation" value={expense.observation} full />}
            {expense.rejectionReason && <Field label="Motif" value={expense.rejectionReason} full />}
          </dl>

          <div className="rounded-card border border-concrete bg-paper px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Paiement fournisseur</p>
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
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Pieces jointes</p>
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
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-concrete-light pt-3">
      <Select value={status} onChange={(e) => setStatus(e.target.value as ExpensePaymentStatus)} className="w-44">
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
          className="h-9 w-40 rounded-md border border-concrete-dark px-2 text-sm"
        />
      )}
      <Button size="sm" variant="outline" loading={isLoading} onClick={() => onSave(status, status === 'PARTIAL' ? Number(amount) : undefined)}>
        Mettre a jour
      </Button>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-ink-800">{value}</dd>
    </div>
  );
}
