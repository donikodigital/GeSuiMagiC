// ============================================================================
// app/(app)/projects/[id]/expenses/page.tsx - v1.3
// Fix : le total affichait "1 500 000" sans devise (formatMoney appele avec
// une devise vide en dur, faute d'un champ currency sur Expense - contrairement
// a Deposit, une depense herite de la devise du projet parent). Ajout d'un
// appel a useProjectFinancialSummary (deja utilise sur la page Apercu) pour
// recuperer summary.currency, reutilise partout ou formatMoney(..., '')
// etait appele en dur : colonne Total, Qte x P.U. et Total dans la modale.
// ============================================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Check, X } from 'lucide-react';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/hooks/use-expenses';
import { useProjectFinancialSummary } from '@/hooks/use-projects';
import { useCategories } from '@/hooks/use-catalog';
import { useAuth } from '@/hooks/use-auth';
import { DataTable } from '@/components/shared/data-table';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/misc';
import { expenseStatusMeta, formatDate, formatMoney } from '@/lib/format';
import type { Expense, ExpenseStatus } from '@/types/models';

export default function ProjectExpensesPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSuperadmin, isSupervisor } = useAuth();
  const [status, setStatus] = React.useState<ExpenseStatus | ''>('');
  const [categoryId, setCategoryId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rejectTarget, setRejectTarget] = React.useState<Expense | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Expense | null>(null);

  const { data, isLoading, isError } = useExpenses(params.id, { page, limit: 20, status: status || undefined, categoryId: categoryId || undefined });
  const { data: summary } = useProjectFinancialSummary(params.id);
  const currency = summary?.currency ?? '';
  const { data: categories } = useCategories();
  const approveMutation = useApproveExpense(params.id);
  const rejectMutation = useRejectExpense(params.id);

  const columns = React.useMemo<ColumnDef<Expense, any>[]>(
    () => [
      { header: 'Date', accessorKey: 'date', cell: ({ row }) => <span className="text-xs sm:text-sm">{formatDate(row.original.date)}</span> },
      {
        header: 'Libelle',
        id: 'label',
        cell: ({ row }) => (
          <div className="max-w-[110px] sm:max-w-none">
            <p className="truncate text-xs font-medium text-ink-900 sm:text-sm">{row.original.label}</p>
            <p className="truncate text-[10px] text-ink-400 sm:text-xs">{row.original.category?.name}</p>
          </div>
        ),
      },
      {
        header: 'Total',
        id: 'total',
        cell: ({ row }) => <span className="font-ledger text-xs font-medium sm:text-sm">{formatMoney(row.original.total, currency)}</span>,
      },
    ],
    [currency],
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
        title="Refuser cette depense"
        confirmLabel="Refuser"
        danger
        isLoading={rejectMutation.isPending}
      />

      {detailTarget && (
        <Dialog open onClose={() => setDetailTarget(null)} title={detailTarget.label} description={detailTarget.category?.name}>
          <dl className="space-y-3 text-sm">
            <Field label="Date" value={formatDate(detailTarget.date)} />
            <Field label="Quantite" value={`${detailTarget.quantity} ${detailTarget.unit} × ${formatMoney(detailTarget.unitPrice, currency)}`} />
            <Field label="Total" value={formatMoney(detailTarget.total, currency)} />
            <Field label="Fournisseur" value={detailTarget.supplier || '-'} />
            <Field label="Reference facture" value={detailTarget.invoiceReference || '-'} />
            {detailTarget.observation && <Field label="Observation" value={detailTarget.observation} full />}
            <Field label="Statut" value={expenseStatusMeta[detailTarget.status].label} />
          </dl>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-concrete pt-4">
            {isClient && detailTarget.status === 'PENDING' && (
              <>
                <Button
                  onClick={() => approveMutation.mutate(detailTarget.id, { onSuccess: () => setDetailTarget(null) })}
                  loading={approveMutation.isPending}
                >
                  <Check className="h-4 w-4" /> Valider la depense
                </Button>
                <Button variant="outline" onClick={() => { setRejectTarget(detailTarget); setDetailTarget(null); }}>
                  <X className="h-4 w-4" /> Refuser
                </Button>
              </>
            )}
            {(isClient || isSuperadmin) && (
              <Link href={`/projects/${params.id}/expenses/${detailTarget.id}`}>
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