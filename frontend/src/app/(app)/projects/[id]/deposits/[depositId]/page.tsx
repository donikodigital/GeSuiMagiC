// frontend/src/app/(app)/projects/[id]/deposits/[depositId]/page.tsx - v1.2
// Ajout du bouton "Contacter le superadmin" (visible pour isClient), qui
// ouvre ComposeMessageDialog directement depuis la page de detail, pre-
// rempli avec relatedEntityType/relatedEntityId et un sujet reprenant le
// montant/la date du depot - le client n'a plus a retaper le contexte
// manuellement depuis /contact.

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Archive, ArchiveRestore, Check, MessageCircle, X, Pencil, Trash2 } from 'lucide-react';
import { useDeposit, useApproveDeposit, useRejectDeposit, useUpdateDeposit, useRemoveDeposit, useToggleArchiveDeposit } from '@/hooks/use-deposits';
import { useCreateMessage } from '@/hooks/use-messages';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { CorrectionDialog } from '@/components/shared/correction-dialog';
import { EditDepositDialog } from '@/components/deposits/edit-deposit-dialog';
import { ComposeMessageDialog } from '@/components/messages/compose-message-dialog';
import { depositStatusMeta, formatDateTime, formatMoney, paymentMethodLabels } from '@/lib/format';
import { depositsService } from '@/services/deposits.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export default function DepositDetailPage() {
  const params = useParams<{ id: string; depositId: string }>();
  const router = useRouter();
  const { isSupervisor, isSuperadmin, isClient } = useAuth();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);
  const [correcting, setCorrecting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [contacting, setContacting] = React.useState(false);

  const { data: deposit, isLoading, isError } = useDeposit(params.depositId);
  const approveMutation = useApproveDeposit(params.id);
  const rejectMutation = useRejectDeposit(params.id);
  const updateMutation = useUpdateDeposit(params.id);
  const removeMutation = useRemoveDeposit(params.id);
  const archiveMutation = useToggleArchiveDeposit(params.id);
  const createMessageMutation = useCreateMessage();

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
    <div className="mx-auto max-w-2xl pb-4">
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
            <div className="flex items-center gap-2">
              {deposit.isArchived && <StatusBadge label="Archive" tone="ink" />}
              <StatusBadge label={depositStatusMeta[deposit.status].label} tone={depositStatusMeta[deposit.status].tone} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Date" value={formatDateTime(deposit.date)} />
            <Field label="Mode de versement" value={paymentMethodLabels[deposit.paymentMethod]} />
            <Field label="Motif" value={deposit.motif || '-'} />
            <Field label="Reference" value={deposit.reference || '-'} />
            {deposit.supervisor && <Field label="Superviseur beneficiaire" value={`${deposit.supervisor.firstName} ${deposit.supervisor.lastName}`} />}
            {deposit.observation && <Field label="Observation" value={deposit.observation} full />}
            {deposit.rejectionReason && <Field label="Motif du refus/suppression" value={deposit.rejectionReason} full />}
          </dl>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Pieces jointes</p>
            <AttachmentsSection target={{ depositId: deposit.id }} readOnly={deposit.isLocked && !isSuperadmin} />
          </div>

          {(canAct || isSuperadmin || isClient) && (
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
              {isClient && (
                <Button variant="outline" onClick={() => setContacting(true)}>
                  <MessageCircle className="h-4 w-4" /> Contacter le superadmin
                </Button>
              )}
              {isSuperadmin && (
                <>
                  {deposit.status === 'APPROVED' && (
                    <Button variant="outline" onClick={() => setCorrecting(true)}>
                      <Pencil className="h-4 w-4" /> Correction du montant
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                  <Button
                    variant="outline"
                    loading={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate({ id: deposit.id, archive: !deposit.isArchived })}
                  >
                    {deposit.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {deposit.isArchived ? 'Desarchiver' : 'Archiver'}
                  </Button>
                  {deposit.status !== 'CANCELLED' && (
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

      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => rejectMutation.mutate({ id: deposit.id, reason }, { onSuccess: () => setRejecting(false) })}
        title="Refuser ce depot"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />

      <ReasonDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={(reason) => removeMutation.mutate({ id: deposit.id, reason }, { onSuccess: () => setDeleting(false) })}
        title="Supprimer ce depot"
        description="Le depot ne sera jamais efface physiquement : il passe en statut Annule et reste consultable dans l'historique. Le client sera notifie."
        confirmLabel="Supprimer le depot"
        danger
        isLoading={removeMutation.isPending}
      />

      <CorrectionDialog
        open={correcting}
        onClose={() => setCorrecting(false)}
        currentAmount={deposit.amount}
        currency={deposit.currency}
        onConfirm={(newAmount, reason) => correctMutation.mutate({ newAmount, reason })}
        isLoading={correctMutation.isPending}
      />

      <EditDepositDialog
        open={editing}
        onClose={() => setEditing(false)}
        deposit={deposit}
        onConfirm={(payload) => updateMutation.mutate({ id: deposit.id, payload }, { onSuccess: () => setEditing(false) })}
        isLoading={updateMutation.isPending}
      />

      <ComposeMessageDialog
        open={contacting}
        onClose={() => setContacting(false)}
        isSuperadmin={false}
        isLoading={createMessageMutation.isPending}
        defaultValues={{
          type: 'MODIFICATION_REQUEST',
          subject: `Depot du ${formatDateTime(deposit.date)} - ${formatMoney(deposit.amount, deposit.currency)}`,
          relatedEntityType: 'Deposit',
          relatedEntityId: deposit.id,
        }}
        onSubmit={(payload) => createMessageMutation.mutate(payload, { onSuccess: () => setContacting(false) })}
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