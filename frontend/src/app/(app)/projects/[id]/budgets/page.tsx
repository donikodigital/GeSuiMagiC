// frontend/src/app/(app)/projects/[id]/budgets/page.tsx - v2.0
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Tags } from 'lucide-react';
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

export default function ProjectBudgetsPage() {
  const params = useParams<{ id: string }>();
  const { isClient, isSuperadmin } = useAuth();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data: comparison, isLoading, isError } = useQuery({
    queryKey: ['budgets', params.id, 'comparison'],
    queryFn: () => budgetsService.comparison(params.id),
  });

  if (isLoading) return <PageSpinner />;
  if (isError) return <ErrorState message="Impossible de charger les budgets." />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {(isClient || isSuperadmin) && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Definir un budget
          </Button>
        )}
      </div>

      {!comparison || comparison.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Aucun budget defini"
          description="Definissez un budget previsionnel par categorie pour detecter les depassements."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {comparison.map((item) => {
            const budget = parseFloat(item.budgetAmount);
            const spent = parseFloat(item.spentAmount);
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            return (
              <Card key={item.categoryId} className="rounded-2xl">
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
                    {item.isExceeded && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-clay-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Depasse
                      </span>
                    )}
                  </div>

                  <p className={`mt-3 font-ledger text-lg font-bold ${item.isExceeded ? 'text-clay-600' : 'text-ink-900'}`}>
                    {formatMoney(item.spentAmount, '')}
                  </p>
                  <p className="text-xs text-ink-400">depense sur {formatMoney(item.budgetAmount, '')}</p>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-concrete-light">
                    <div
                      className={`h-full rounded-full transition-all ${item.isExceeded ? 'bg-clay' : pct > 80 ? 'bg-safety-400' : 'bg-moss'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-right text-xs text-ink-400">{pct.toFixed(0)}%</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetDialog open={dialogOpen} onClose={() => setDialogOpen(false)} projectId={params.id} />
    </div>
  );
}

function BudgetDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = React.useState('');
  const [amount, setAmount] = React.useState('');

  const mutation = useMutation({
    mutationFn: () => budgetsService.upsert(projectId, categoryId, Number(amount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', projectId] });
      toast.success('Budget enregistre.');
      onClose();
      setCategoryId('');
      setAmount('');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Impossible de definir ce budget.'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Definir un budget par categorie">
      <div className="space-y-4">
        <FormField label="Categorie" htmlFor="budget-category" required>
          <Select id="budget-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Selectionner</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Budget alloue" htmlFor="budget-amount" required>
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