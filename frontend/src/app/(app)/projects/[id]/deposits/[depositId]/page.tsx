'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, X, Pencil } from 'lucide-react';
import { useDeposit, useApproveDeposit, useRejectDeposit } from '@/hooks/use-deposits';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { CorrectionDialog } from '@/components/shared/correction-dialog';
import { depositStatusMeta, formatDateTime, formatMoney, paymentMethodLabels } from '@/lib/format';
import { depositsService } from '@/services/deposits.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export default function DepositDetailPage() {
  const params = useParams<{ id: string; depositId: string }>();
  const router = useRouter();
  const { isSupervisor, isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);
  const [correcting, setCorrecting] = React.useState(false);

  const { data: deposit, isLoading, isError } = useDeposit(params.depositId);
  const approveMutation = useApproveDeposit(params.id);
  const rejectMutation = useRejectDeposit(params.id);

  const correctMutation = useMutation({
    mutationFn: ({ newAmount, reason }: { newAmount: number; reason: string }) => depositsService.correct(params.depositId, newAmount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      queryClient.invalidateQueries({ queryKey: ['projects', params.id] });
      toast.success('Correction appliquee, historique conserve.');
      setCorrecting(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Correction impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !deposit) return <ErrorState message="Impossible de charger ce depot." />;

  const canAct = isSupervisor && deposit.status === 'PENDING';

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">Depot</p>
              <p className="font-ledger text-2xl font-semibold text-ink-900">{formatMoney(deposit.amount, deposit.currency)}</p>
            </div>
            <StatusBadge label={depositStatusMeta[deposit.status].label} tone={depositStatusMeta[deposit.status].tone} />
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Date" value={formatDateTime(deposit.date)} />
            <Field label="Mode de versement" value={paymentMethodLabels[deposit.paymentMethod]} />
            <Field label="Motif" value={deposit.motif || '-'} />
            <Field label="Reference" value={deposit.reference || '-'} />
            {deposit.supervisor && <Field label="Superviseur beneficiaire" value={`${deposit.supervisor.firstName} ${deposit.supervisor.lastName}`} />}
            {deposit.observation && <Field label="Observation" value={deposit.observation} full />}
            {deposit.rejectionReason && <Field label="Motif du refus" value={deposit.rejectionReason} full />}
          </dl>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Pieces jointes</p>
            <AttachmentsSection target={{ depositId: deposit.id }} readOnly={deposit.isLocked && !isSuperadmin} />
          </div>

          {(canAct || isSuperadmin) && (
            <div className="flex flex-wrap gap-2 border-t border-concrete pt-4">
              {canAct && (
                <>
                  <Button onClick={() => approveMutation.mutate(deposit.id)} loading={approveMutation.isPending}>
                    <Check className="h-4 w-4" /> Valider le depot
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                </>
              )}
              {isSuperadmin && deposit.status === 'APPROVED' && (
                <Button variant="outline" onClick={() => setCorrecting(true)}>
                  <Pencil className="h-4 w-4" /> Correction administrative
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => rejectMutation.mutate({ id: deposit.id, reason }, { onSuccess: () => setRejecting(false) })}
        title="Refuser ce depot"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />

      <CorrectionDialog
        open={correcting}
        onClose={() => setCorrecting(false)}
        currentAmount={deposit.amount}
        currency={deposit.currency}
        onConfirm={(newAmount, reason) => correctMutation.mutate({ newAmount, reason })}
        isLoading={correctMutation.isPending}
      />
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
