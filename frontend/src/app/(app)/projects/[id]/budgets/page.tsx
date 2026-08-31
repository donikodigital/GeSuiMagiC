// frontend/src/app/(app)/projects/[id]/budgets/page.tsx - v2.1
// Cartes budget rendues cliquables (client/superadmin) pour modifier le
// montant d'une categorie deja budgetee, au lieu de devoir redeviner qu'il
// fallait reselectionner la meme categorie via "Definir un budget" (qui
// fonctionnait deja techniquement grace a l'upsert backend, mais n'etait
// pas presente comme une action "modifier"). BudgetDialog accepte
// desormais un mode edition (categorie verrouillee, affichee en texte,
// seul le montant reste modifiable) en plus du mode creation existant.

'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Plus, Tags } from 'lucide-react';
import { budgetsService } from '@/services/budgets.service';
import { useCategories } from '@/hooks/use-catalog';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select } from '@/components/ui/input';
import { PageSpinner, EmptyState, ErrorState } from '@/components/ui/misc';
import { formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import type { BudgetComparison } from '@/types/models';

export default function ProjectBudgetsPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSuperadmin } = useAuth();
  const canManage = isClient || isSuperadmin;
  const [dialogTarget, setDialogTarget] = React.useState<'new' | BudgetComparison | null>(null);

  const { data: comparison, isLoading, isError } = useQuery({
    queryKey: ['budgets', params.id, 'comparison'],
    queryFn: () => budgetsService.comparison(params.id),
  });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger les budgets." />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canManage && (
          <Button size="sm" onClick={() => setDialogTarget('new')}>
            <Plus className="h-4 w-4" /> Définir un budget
          </Button>
        )}
      </div>

      {!comparison || comparison.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Aucun budget défini"
          description="Définissez un budget prévisionnel par catégorie pour détecter les dépassements."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {comparison.map((item) => {
            const budget = parseFloat(item.budgetAmount);
            const spent = parseFloat(item.spentAmount);
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const Wrapper = canManage ? 'button' : 'div';

            return (
              <Wrapper
                key={item.categoryId}
                type={canManage ? 'button' : undefined}
                onClick={canManage ? () => setDialogTarget(item) : undefined}
                className={canManage ? 'text-left transition-transform hover:-translate-y-0.5' : undefined}
              >
                <Card className="rounded-2xl">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            item.isExceeded ? 'bg-clay-50 text-clay-600' : 'bg-blueprint-50 text-blueprint-600'
                          }`}
                        >
                          <Tags className="h-4 w-4" />
                        </span>
                        <p className="truncate font-medium text-ink-900">{item.categoryName}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.isExceeded && (
                          <span className="flex items-center gap-1 text-xs font-medium text-clay-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Dépassé
                          </span>
                        )}
                        {canManage && <Pencil className="h-3.5 w-3.5 text-ink-300" />}
                      </div>
                    </div>

                    <p className={`mt-3 font-ledger text-lg font-bold ${item.isExceeded ? 'text-clay-600' : 'text-ink-900'}`}>
                      {formatMoney(item.spentAmount, '')}
                    </p>
                    <p className="text-xs text-ink-400">dépensé sur {formatMoney(item.budgetAmount, '')}</p>

                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-concrete-light">
                      <div
                        className={`h-full rounded-full transition-all ${item.isExceeded ? 'bg-clay' : pct > 80 ? 'bg-safety-400' : 'bg-moss'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-right text-xs text-ink-400">{pct.toFixed(0)}%</p>
                  </CardContent>
                </Card>
              </Wrapper>
            );
          })}
        </div>
      )}

      <BudgetDialog
        open={dialogTarget !== null}
        onClose={() => setDialogTarget(null)}
        projectId={params.id}
        editing={dialogTarget && dialogTarget !== 'new' ? dialogTarget : null}
      />
    </div>
  );
}

function BudgetDialog({
  open,
  onClose,
  projectId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editing: BudgetComparison | null;
}) {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = React.useState('');
  const [amount, setAmount] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setCategoryId(editing?.categoryId ?? '');
      setAmount(editing?.budgetAmount ?? '');
    }
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: () => budgetsService.upsert(projectId, categoryId, Number(amount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', projectId] });
      toast.success(editing ? 'Budget mis à jour.' : 'Budget enregistré.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer ce budget."),
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Modifier le budget — ${editing.categoryName}` : 'Définir un budget par catégorie'}>
      <div className="space-y-4">
        {editing ? (
          <div className="rounded-md bg-paper px-3 py-2 text-sm text-ink-600">
            Catégorie : <span className="font-medium text-ink-900">{editing.categoryName}</span>
          </div>
        ) : (
          <FormField label="Catégorie" htmlFor="budget-category" required>
            <Select id="budget-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sélectionner</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Budget alloué" htmlFor="budget-amount" required>
          <Input id="budget-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!categoryId || !amount}>
          Enregistrer
        </Button>
      </div>
    </Dialog>
  );
}