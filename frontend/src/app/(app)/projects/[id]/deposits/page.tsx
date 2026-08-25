// ============================================================================
// app/(app)/projects/[id]/deposits/page.tsx - v1.3
// Colonne Statut retiree du tableau (gardait la ligne trop chargee sur
// mobile) - deja affichee dans la modale de detail, aucun changement
// necessaire de ce cote. Ne reste visible dans le tableau que Date, Motif,
// Montant.
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Check, X } from 'lucide-react';
import { useDeposits, useApproveDeposit, useRejectDeposit } from '@/hooks/use-deposits';
import { useAuth } from '@/hooks/use-auth';
import { DataTable } from '@/components/shared/data-table';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { depositStatusMeta, formatDateTime, formatMoney, paymentMethodLabels } from '@/lib/format';
import type { Deposit, DepositStatus } from '@/types/models';

export default function ProjectDepositsPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const [status, setStatus] = React.useState<DepositStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [rejectTarget, setRejectTarget] = React.useState<Deposit | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Deposit | null>(null);

  const { data, isLoading, isError } = useDeposits(params.id, { page, limit: 20, status: status || undefined });
  const approveMutation = useApproveDeposit(params.id);
  const rejectMutation = useRejectDeposit(params.id);

  const columns = React.useMemo<ColumnDef<Deposit, any>[]>(
    () => [
      {
        header: 'Date',
        accessorKey: 'date',
        cell: ({ row }) => <span className="text-xs sm:text-sm">{new Date(row.original.date).toLocaleDateString('fr-FR')}</span>,
      },
      {
        header: 'Motif',
        accessorKey: 'motif',
        cell: ({ row }) => <span className="block max-w-[90px] truncate text-xs sm:max-w-none sm:text-sm">{row.original.motif || '-'}</span>,
      },
      {
        header: 'Montant',
        id: 'amount',
        cell: ({ row }) => (
          <span className="font-ledger text-xs font-medium sm:text-sm">{formatMoney(row.original.amount, row.original.currency)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Select value={status} onChange={(e) => { setStatus(e.target.value as DepositStatus | ''); setPage(1); }} className="w-48">
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Valides</option>
          <option value="REJECTED">Refuses</option>
        </Select>

        {isClient && (
          <Link href={`/projects/${params.id}/deposits/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nouveau depot
            </Button>
          </Link>
        )}
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les depots." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucun depot"
          emptyDescription={isClient ? 'Enregistrez un depot pour alimenter le portefeuille du chantier.' : 'Aucun depot enregistre pour ce chantier.'}
          onRowClick={(row) => setDetailTarget(row)}
          meta={data?.meta}
          onPageChange={setPage}
        />
      )}

      <ReasonDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason }, { onSuccess: () => setRejectTarget(null) });
        }}
        title="Refuser ce depot"
        description="Un motif de refus est obligatoire et sera communique au client."
        confirmLabel="Refuser le depot"
        danger
        isLoading={rejectMutation.isPending}
      />

      {detailTarget && (
        <Dialog
          open
          onClose={() => setDetailTarget(null)}
          title={formatMoney(detailTarget.amount, detailTarget.currency)}
          description={detailTarget.motif || undefined}
        >
          <dl className="space-y-3 text-sm">
            <Field label="Date" value={formatDateTime(detailTarget.date)} />
            <Field label="Mode de versement" value={paymentMethodLabels[detailTarget.paymentMethod]} />
            {detailTarget.supervisor && (
              <Field label="Superviseur beneficiaire" value={`${detailTarget.supervisor.firstName} ${detailTarget.supervisor.lastName}`} />
            )}
            <Field label="Reference" value={detailTarget.reference || '-'} />
            {detailTarget.observation && <Field label="Observation" value={detailTarget.observation} full />}
            <Field label="Statut" value={depositStatusMeta[detailTarget.status].label} />
          </dl>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-concrete pt-4">
            {isSupervisor && detailTarget.status === 'PENDING' && (
              <>
                <Button
                  onClick={() => approveMutation.mutate(detailTarget.id, { onSuccess: () => setDetailTarget(null) })}
                  loading={approveMutation.isPending}
                >
                  <Check className="h-4 w-4" /> Valider le depot
                </Button>
                <Button variant="outline" onClick={() => { setRejectTarget(detailTarget); setDetailTarget(null); }}>
                  <X className="h-4 w-4" /> Refuser
                </Button>
              </>
            )}
            {(isClient || isSuperadmin) && (
              <Link href={`/projects/${params.id}/deposits/${detailTarget.id}`}>
                <Button variant="outline">Voir le detail complet</Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              Fermer
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? undefined : 'flex items-center justify-between border-b border-concrete-light pb-2'}>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className={full ? 'mt-0.5 text-ink-800' : 'text-ink-800'}>{value}</dd>
    </div>
  );
}