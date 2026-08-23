'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import { useCreateExpense } from '@/hooks/use-expenses';
import { useCategories, useMaterials, useUnits } from '@/hooks/use-catalog';
import { useProject } from '@/hooks/use-projects';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { RequireRole } from '@/components/shared/require-role';

const schema = z.object({
  categoryId: z.string().min(1, 'Selectionnez une categorie'),
  materialId: z.string().optional(),
  label: z.string().min(1, 'Le libelle est requis'),
  quantity: z.coerce.number().positive('La quantite doit etre superieure a 0'),
  unit: z.string().min(1, "L'unite est requise"),
  unitPrice: z.coerce.number().positive('Le prix unitaire doit etre superieur a 0'),
  date: z.string().optional(),
  supplier: z.string().optional(),
  invoiceReference: z.string().optional(),
  observation: z.string().optional(),
  paymentStatus: z.enum(['PAID_FULL', 'PARTIAL', 'CREDIT']),
  amountPaidToSupplier: z.coerce.number().optional(),
});
type FormValues = z.infer<typeof schema>;

function NewExpensePageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const createExpense = useCreateExpense(params.id);
  const { data: project } = useProject(params.id);
  const { data: categories } = useCategories();
  const { data: units } = useUnits();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { paymentStatus: 'PAID_FULL' } });

  const categoryId = useWatch({ control, name: 'categoryId' });
  const quantity = useWatch({ control, name: 'quantity' });
  const unitPrice = useWatch({ control, name: 'unitPrice' });
  const paymentStatus = useWatch({ control, name: 'paymentStatus' });

  const { data: materials } = useMaterials(categoryId || undefined);

  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const threshold = project ? parseFloat(project.expenseApprovalThreshold) : undefined;
  const willRequireConfirmation = project && (!project.autoApproveExpenses || (threshold !== undefined && total > threshold));

  const onSubmit = async (values: FormValues) => {
    const expense = await createExpense.mutateAsync({
      ...values,
      quantity: Number(values.quantity),
      unitPrice: Number(values.unitPrice),
      amountPaidToSupplier: values.paymentStatus === 'PARTIAL' ? Number(values.amountPaidToSupplier) : undefined,
    });
    router.push(`/projects/${params.id}/expenses/${expense.id}`);
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Nouvelle depense" description="Le total est toujours recalcule et verifie cote serveur." />

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Categorie" htmlFor="categoryId" required error={errors.categoryId?.message}>
              <Select id="categoryId" {...register('categoryId')} defaultValue="" onChange={(e) => { setValue('categoryId', e.target.value); setValue('materialId', ''); }}>
                <option value="" disabled>
                  Selectionner une categorie
                </option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Materiau / element" htmlFor="materialId" hint="Optionnel - remplit automatiquement le libelle">
              <Select
                id="materialId"
                {...register('materialId')}
                defaultValue=""
                onChange={(e) => {
                  setValue('materialId', e.target.value);
                  const material = materials?.find((m) => m.id === e.target.value);
                  if (material) setValue('label', material.name);
                }}
              >
                <option value="">Element personnalise</option>
                {materials?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Libelle" htmlFor="label" required error={errors.label?.message}>
              <Input id="label" placeholder="Ciment 32,5" {...register('label')} />
            </FormField>

            <div className="grid grid-cols-3 gap-3">
              <FormField label="Quantite" htmlFor="quantity" required error={errors.quantity?.message}>
                <Input id="quantity" type="number" step="0.01" {...register('quantity')} />
              </FormField>
              <FormField label="Unite" htmlFor="unit" required error={errors.unit?.message}>
                <Select id="unit" {...register('unit')} defaultValue="">
                  <option value="" disabled>
                    -
                  </option>
                  {units?.map((u) => (
                    <option key={u.id} value={u.symbol || u.name}>
                      {u.symbol || u.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Prix unitaire" htmlFor="unitPrice" required error={errors.unitPrice?.message}>
                <Input id="unitPrice" type="number" {...register('unitPrice')} />
              </FormField>
            </div>

            <div className="rounded-md bg-paper px-3 py-2.5">
              <p className="text-xs text-ink-400">Total (recalcule par le serveur)</p>
              <p className="font-ledger text-lg font-semibold text-ink-900">{formatMoney(total, project?.currency)}</p>
            </div>

            {willRequireConfirmation && (
              <div className="flex items-start gap-2 rounded-md border border-safety-200 bg-safety-50 px-3 py-2.5 text-sm text-safety-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Cette depense depasse le seuil configure ({formatMoney(threshold ?? 0, project?.currency)}) : elle restera en attente jusqu&apos;a confirmation du client.</span>
              </div>
            )}

            <FormField label="Fournisseur" htmlFor="supplier">
              <Input id="supplier" {...register('supplier')} />
            </FormField>

            <FormField label="Reference facture" htmlFor="invoiceReference">
              <Input id="invoiceReference" {...register('invoiceReference')} />
            </FormField>

            <FormField label="Date" htmlFor="date">
              <Input id="date" type="date" {...register('date')} />
            </FormField>

            <FormField label="Statut de paiement fournisseur" htmlFor="paymentStatus" hint="N'affecte jamais le solde du chantier - suivi du reste a payer uniquement.">
              <Select id="paymentStatus" {...register('paymentStatus')}>
                <option value="PAID_FULL">Paye totalement</option>
                <option value="PARTIAL">Acompte / avance</option>
                <option value="CREDIT">A credit / differe</option>
              </Select>
            </FormField>

            {paymentStatus === 'PARTIAL' && (
              <FormField label="Montant deja verse au fournisseur" htmlFor="amountPaidToSupplier" required>
                <Input id="amountPaidToSupplier" type="number" {...register('amountPaidToSupplier')} />
              </FormField>
            )}

            <FormField label="Observation" htmlFor="observation">
              <Textarea id="observation" rows={3} {...register('observation')} />
            </FormField>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Annuler
              </Button>
              <Button type="submit" loading={createExpense.isPending}>
                Enregistrer la depense
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <RequireRole roles={['SUPERVISOR']}>
      <NewExpensePageContent />
    </RequireRole>
  );
}
