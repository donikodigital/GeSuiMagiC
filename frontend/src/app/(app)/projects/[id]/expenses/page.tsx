'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Check, X } from 'lucide-react';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/hooks/use-expenses';
import { useCategories } from '@/hooks/use-catalog';
import { useAuth } from '@/hooks/use-auth';
import { DataTable } from '@/components/shared/data-table';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { expenseStatusMeta, formatDate, formatMoney } from '@/lib/format';
import type { Expense, ExpenseStatus } from '@/types/models';

export default function ProjectExpensesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isClient, isSupervisor } = useAuth();
  const [status, setStatus] = React.useState<ExpenseStatus | ''>('');
  const [categoryId, setCategoryId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rejectTarget, setRejectTarget] = React.useState<Expense | null>(null);

  const { data, isLoading, isError } = useExpenses(params.id, { page, limit: 20, status: status || undefined, categoryId: categoryId || undefined });
  const { data: categories } = useCategories();
  const approveMutation = useApproveExpense(params.id);
  const rejectMutation = useRejectExpense(params.id);

  const columns = React.useMemo<ColumnDef<Expense, any>[]>(
    () => [
      { header: 'Date', accessorKey: 'date', cell: ({ row }) => formatDate(row.original.date) },
      {
        header: 'Libelle',
        id: 'label',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink-900">{row.original.label}</p>
            <p className="text-xs text-ink-400">{row.original.category?.name}</p>
          </div>
        ),
      },
      {
        header: 'Qte x P.U.',
        id: 'quantity',
        cell: ({ row }) => (
          <span className="font-ledger text-xs text-ink-500">
            {row.original.quantity} {row.original.unit} × {formatMoney(row.original.unitPrice, '')}
          </span>
        ),
      },
      { header: 'Total', id: 'total', cell: ({ row }) => <span className="font-ledger font-medium">{formatMoney(row.original.total, '')}</span> },
      {
        header: 'Statut',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge label={expenseStatusMeta[row.original.status].label} tone={expenseStatusMeta[row.original.status].tone} />,
      },
      ...(isClient
        ? [
            {
              header: '',
              id: 'actions',
              cell: ({ row }: { row: { original: Expense } }) =>
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
    [isClient, approveMutation],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as ExpenseStatus | ''); setPage(1); }} className="w-44">
            <option value="">Tous les statuts</option>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Validees</option>
            <option value="REJECTED">Refusees</option>
            <option value="CANCELLED">Annulees</option>
          </Select>
          <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-48">
            <option value="">Toutes les categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {isSupervisor && (
          <Link href={`/projects/${params.id}/expenses/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nouvelle depense
            </Button>
          </Link>
        )}
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les depenses." />
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyTitle="Aucune depense"
          emptyDescription={isSupervisor ? 'Enregistrez une depense pour ce chantier.' : 'Aucune depense enregistree pour ce chantier.'}
          onRowClick={(row) => router.push(`/projects/${params.id}/expenses/${row.id}`)}
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
        title="Refuser cette depense"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />
    </div>
  );
}
