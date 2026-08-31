// frontend/src/components/deposits/pending-deposit-action-dialog.tsx
'use client';

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { depositStatusMeta, formatDateTime, formatMoney, paymentMethodLabels } from '@/lib/format';
import { depositsService } from '@/services/deposits.service';
import { ApiError } from '@/lib/api-client';
import type { Deposit } from '@/types/models';

/**
 * Modale d'action rapide pour un depot en attente, declenchee depuis le
 * raccourci du tableau de bord superviseur. Disposition demandee : bouton
 * Valider en pleine largeur au-dessus, Refuser/Fermer sur la meme ligne
 * en dessous - distincte de la modale de l'onglet Depots du projet.
 */
export function PendingDepositActionDialog({ deposit, projectName, onClose }: { deposit: Deposit; projectName?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);

  const approveMutation = useMutation({
    mutationFn: () => depositsService.approve(deposit.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Depot valide, le solde a ete mis a jour.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de valider ce depot.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => depositsService.reject(deposit.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      toast.success('Depot refuse.');
      setRejecting(false);
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de refuser ce depot.'),
  });

  return (
    <>
      <Dialog open onClose={onClose} title={formatMoney(deposit.amount, deposit.currency)} description={deposit.motif || undefined}>
        <dl className="space-y-3 text-sm">
          {projectName && <Field label="Chantier" value={projectName} />}
          <Field label="Date" value={formatDateTime(deposit.date)} />
          <Field label="Mode de versement" value={paymentMethodLabels[deposit.paymentMethod]} />
          <Field label="Reference" value={deposit.reference || '-'} />
          {deposit.observation && <Field label="Observation" value={deposit.observation} />}
          <div className="flex items-center justify-between border-b border-concrete-light pb-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Statut</dt>
            <dd>
              <StatusBadge label={depositStatusMeta[deposit.status].label} tone={depositStatusMeta[deposit.status].tone} />
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-2 border-t border-concrete pt-4">
          <Button className="w-full" onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
            <Check className="h-4 w-4" /> Valider le dépôt
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setRejecting(true)}>
              <X className="h-4 w-4" /> Réfuser
            </Button>
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
      </Dialog>

      <ReasonDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => rejectMutation.mutate(reason)}
        title="Refuser ce depot"
        description="Un motif de refus est obligatoire et sera communique au client."
        confirmLabel="Refuser le depot"
        danger
        isLoading={rejectMutation.isPending}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-concrete-light pb-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-ink-800">{value}</dd>
    </div>
  );
}