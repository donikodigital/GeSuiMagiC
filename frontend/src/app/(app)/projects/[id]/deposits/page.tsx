'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Check, X } from 'lucide-react';
import { useDeposits, useApproveDeposit, useRejectDeposit } from '@/hooks/use-deposits';
import { useAuth } from '@/hooks/use-auth';
import { DataTable } from '@/components/shared/data-table';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { depositStatusMeta, formatDate, formatMoney, paymentMethodLabels } from '@/lib/format';
import type { Deposit, DepositStatus } from '@/types/models';

export default function ProjectDepositsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isClient, isSupervisor } = useAuth();
  const [status, setStatus] = React.useState<DepositStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [rejectTarget, setRejectTarget] = React.useState<Deposit | null>(null);

  const { data, isLoading, isError } = useDeposits(params.id, { page, limit: 20, status: status || undefined });
  const approveMutation = useApproveDeposit(params.id);
  const rejectMutation = useRejectDeposit(params.id);

  const columns = React.useMemo<ColumnDef<Deposit, any>[]>(
    () => [
      { header: 'Date', accessorKey: 'date', cell: ({ row }) => formatDate(row.original.date) },
      {
        header: 'Superviseur',
        id: 'supervisor',
        cell: ({ row }) => (row.original.supervisor ? `${row.original.supervisor.firstName} ${row.original.supervisor.lastName}` : '-'),
      },
      { header: 'Motif', accessorKey: 'motif', cell: ({ row }) => row.original.motif || '-' },
      { header: 'Mode', id: 'mode', cell: ({ row }) => paymentMethodLabels[row.original.paymentMethod] },
      {
        header: 'Montant',
        id: 'amount',
        cell: ({ row }) => <span className="font-ledger font-medium">{formatMoney(row.original.amount, row.original.currency)}</span>,
      },
      {
        header: 'Statut',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge label={depositStatusMeta[row.original.status].label} tone={depositStatusMeta[row.original.status].tone} />,
      },
      ...(isSupervisor
        ? [
            {
              header: '',
              id: 'actions',
              cell: ({ row }: { row: { original: Deposit } }) =>
                row.original.status === 'PENDING' ? (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(row.original.id)} loading={approveMutation.isPending}>
                      <Check className="h-3.5 w-3.5 text-moss-600" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectTarget(row.original)}>
                      <X className="h-3.5 w-3.5 text-clay-600" />
                    </Button>
                  </div>
                ) : null,
            },
          ]
        : []),
    ],
    [isSupervisor, approveMutation],
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
          onRowClick={(row) => router.push(`/projects/${params.id}/deposits/${row.id}`)}
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
    </div>
  );
}
