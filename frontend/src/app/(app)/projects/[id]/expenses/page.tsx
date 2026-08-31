// frontend/src/app/(app)/projects/[id]/expenses/page.tsx - v2.1
// Meme harmonisation que la page depots : "Valider la depense" en pleine
// largeur au-dessus, boutons secondaires (Refuser / Voir le detail complet
// / Fermer) en grille adaptative en dessous. Pour un client sur une
// depense PENDING, jusqu'a 3 boutons secondaires s'affichent (Refuser +
// Voir le detail complet + Fermer) - la grille passe alors en 3 colonnes.

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/hooks/use-expenses';
import { useProjectFinancialSummary } from '@/hooks/use-projects';
import { useCategories } from '@/hooks/use-catalog';
import { useAuth } from '@/hooks/use-auth';
import { ExpenseCard } from '@/components/expenses/expense-card';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageSpinner, ErrorState, EmptyState } from '@/components/ui/misc';
import { expenseStatusMeta, formatDate, formatMoney } from '@/lib/format';
import type { Expense, ExpenseStatus } from '@/types/models';

const GRID_COLS_CLASS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

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

  const canApprove = !!detailTarget && isClient && detailTarget.status === 'PENDING';
  const canViewFull = isClient || isSuperadmin;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExpenseStatus | '');
              setPage(1);
            }}
            className="w-full sm:w-44"
          >
            <option value="">Tous les statuts</option>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Validees</option>
            <option value="REJECTED">Refusees</option>
            <option value="CANCELLED">Annulees</option>
          </Select>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-48"
          >
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
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Nouvelle depense
            </Button>
          </Link>
        )}
      </div>

      {isError ? (
        <ErrorState message="Impossible de charger les depenses." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Aucune depense"
          description={isSupervisor ? 'Enregistrez une depense pour ce chantier.' : 'Aucune depense enregistree pour ce chantier.'}
        />
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((expense) => (
              <ExpenseCard key={expense.id} expense={expense} currency={currency} onClick={() => setDetailTarget(expense)} />
            ))}
          </div>

          {data?.meta && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-ink-400">
                {data.meta.total} resultat{data.meta.total > 1 ? 's' : ''} - page {data.meta.page} sur {data.meta.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={data.meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
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
            {detailTarget.observation && <Field label="Observation" value={detailTarget.observation} />}
            <Field label="Statut" value={expenseStatusMeta[detailTarget.status].label} />
          </dl>

          {(() => {
            const secondary: { key: string; node: React.ReactNode }[] = [];
            if (canApprove) {
              secondary.push({
                key: 'reject',
                node: (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(detailTarget);
                      setDetailTarget(null);
                    }}
                  >
                    <X className="h-4 w-4" /> Refuser
                  </Button>
                ),
              });
            }
            if (canViewFull) {
              secondary.push({
                key: 'full',
                node: (
                  <Link href={`/projects/${params.id}/expenses/${detailTarget.id}`} className="w-full">
                    <Button variant="outline" className="w-full">
                      Voir le detail complet
                    </Button>
                  </Link>
                ),
              });
            }
            secondary.push({
              key: 'close',
              node: (
                <Button variant="outline" onClick={() => setDetailTarget(null)}>
                  Fermer
                </Button>
              ),
            });

            return (
              <div className="mt-5 space-y-2 border-t border-concrete pt-4">
                {canApprove && (
                  <Button
                    className="w-full"
                    onClick={() => approveMutation.mutate(detailTarget.id, { onSuccess: () => setDetailTarget(null) })}
                    loading={approveMutation.isPending}
                  >
                    <Check className="h-4 w-4" /> Valider la dépense
                  </Button>
                )}
                <div className={`grid gap-2 ${GRID_COLS_CLASS[secondary.length] ?? 'grid-cols-1'}`}>
                  {secondary.map((s) => (
                    <React.Fragment key={s.key}>{s.node}</React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </Dialog>
      )}
    </div>
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