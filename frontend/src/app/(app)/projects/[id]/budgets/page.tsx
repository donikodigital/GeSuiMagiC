'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus } from 'lucide-react';
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
  const queryClient = useQueryClient();
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
        <EmptyState title="Aucun budget defini" description="Definissez un budget previsionnel par categorie pour detecter les depassements." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {comparison.map((item) => {
            const budget = parseFloat(item.budgetAmount);
            const spent = parseFloat(item.spentAmount);
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            return (
              <Card key={item.categoryId}>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink-900">{item.categoryName}</p>
                    {item.isExceeded && (
                      <span className="flex items-center gap-1 text-xs font-medium text-clay-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Depasse
                      </span>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-concrete-light">
                    <div className={`h-full rounded-full ${item.isExceeded ? 'bg-clay' : pct > 80 ? 'bg-safety-400' : 'bg-moss'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-ink-500">
                    <span>{formatMoney(item.spentAmount, '')} depense</span>
                    <span>sur {formatMoney(item.budgetAmount, '')}</span>
                  </div>
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
