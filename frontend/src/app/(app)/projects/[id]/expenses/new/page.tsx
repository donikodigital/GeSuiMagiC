// ============================================================================
// app/(app)/projects/[id]/expenses/new/page.tsx - v2.0
// - Option "+ Autre" ajoutee sur Categorie ET Materiau/Element : revele un
//   champ de saisie, cree la categorie/le materiau via catalogService avant
//   d'enregistrer la depense (necessite le controller backend mis a jour
//   pour autoriser SUPERVISOR sur ces creations).
// - "Element personnalise" (deja existant) reste distinct de "+ Autre" :
//   le premier laisse juste taper un libelle sans toucher au catalogue, le
//   second cree une vraie entree reutilisable pour les prochaines depenses.
// - Formulaire redecoupe en sections (meme convention que le formulaire
//   "Nouveau projet" : plusieurs Card avec un sous-titre h3), icones de
//   section, callout total plus visuel.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Layers, Calculator, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateExpense } from '@/hooks/use-expenses';
import { useCategories, useMaterials, useUnits } from '@/hooks/use-catalog';
import { useProject } from '@/hooks/use-projects';
import { catalogService } from '@/services/catalog.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { RequireRole } from '@/components/shared/require-role';

const NEW_OPTION = '__new__';

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

function SectionIcon({ children }: { children: React.ReactNode }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">{children}</div>;
}

function NewExpensePageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const createExpense = useCreateExpense(params.id);
  const { data: project } = useProject(params.id);
  const { data: categories } = useCategories();
  const { data: units } = useUnits();

  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newMaterialName, setNewMaterialName] = React.useState('');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { paymentStatus: 'PAID_FULL', materialId: NEW_OPTION } });

  const categoryId = useWatch({ control, name: 'categoryId' });
  const materialId = useWatch({ control, name: 'materialId' });
  const quantity = useWatch({ control, name: 'quantity' });
  const unitPrice = useWatch({ control, name: 'unitPrice' });
  const paymentStatus = useWatch({ control, name: 'paymentStatus' });

  const { data: materials } = useMaterials(categoryId && categoryId !== NEW_OPTION ? categoryId : undefined);

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => catalogService.categories.create({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const createMaterialMutation = useMutation({
    mutationFn: (payload: { name: string; categoryId: string }) => catalogService.materials.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });

  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const threshold = project ? parseFloat(project.expenseApprovalThreshold) : undefined;
  const willRequireConfirmation = project && (!project.autoApproveExpenses || (threshold !== undefined && total > threshold));

  const newCategoryInvalid = categoryId === NEW_OPTION && !newCategoryName.trim();
  const newMaterialInvalid = materialId === NEW_OPTION && !newMaterialName.trim();

  const onSubmit = async (values: FormValues) => {
    try {
      let resolvedCategoryId = values.categoryId;
      if (resolvedCategoryId === NEW_OPTION) {
        const created = await createCategoryMutation.mutateAsync(newCategoryName.trim());
        resolvedCategoryId = created.id;
      }

      let resolvedMaterialId: string | undefined = values.materialId;
      if (resolvedMaterialId === NEW_OPTION) {
        const created = await createMaterialMutation.mutateAsync({ name: newMaterialName.trim(), categoryId: resolvedCategoryId });
        resolvedMaterialId = created.id;
      } else if (!resolvedMaterialId) {
        resolvedMaterialId = undefined;
      }

      const expense = await createExpense.mutateAsync({
        ...values,
        categoryId: resolvedCategoryId,
        materialId: resolvedMaterialId,
        quantity: Number(values.quantity),
        unitPrice: Number(values.unitPrice),
        amountPaidToSupplier: values.paymentStatus === 'PARTIAL' ? Number(values.amountPaidToSupplier) : undefined,
      });
      router.push(`/projects/${params.id}/expenses/${expense.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "L'enregistrement a echoue.");
    }
  };

  const busy = createExpense.isPending || createCategoryMutation.isPending || createMaterialMutation.isPending;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Nouvelle depense" description="Le total est toujours recalcule et verifie cote serveur." />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <SectionIcon>
                <Layers className="h-4 w-4" />
              </SectionIcon>
              <h3 className="font-display text-sm font-semibold text-ink-700">Categorie et materiau</h3>
            </div>

            <FormField label="Categorie" htmlFor="categoryId" required error={errors.categoryId?.message}>
              <Select
                id="categoryId"
                {...register('categoryId')}
                defaultValue=""
                onChange={(e) => {
                  setValue('categoryId', e.target.value);
                  setValue('materialId', '');
                  if (e.target.value !== NEW_OPTION) setNewCategoryName('');
                }}
              >
                <option value="" disabled>
                  Selectionner une categorie
                </option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_OPTION}>Autre</option>
              </Select>
            </FormField>

            {categoryId === NEW_OPTION && (
              <FormField label="Nom de la nouvelle categorie" htmlFor="newCategoryName" required error={newCategoryInvalid ? 'Ce nom est requis' : undefined}>
                <Input
                  id="newCategoryName"
                  placeholder="Ex: Etancheite"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  autoFocus
                />
              </FormField>
            )}

            <FormField label="Materiau / element" htmlFor="materialId" hint="Choisis 'Autre' pour ajouter un materiau absent de la liste.">
              <Select
                id="materialId"
                {...register('materialId')}
                defaultValue={NEW_OPTION}
                onChange={(e) => {
                  setValue('materialId', e.target.value);
                  if (e.target.value === NEW_OPTION) return;
                  setNewMaterialName('');
                  const material = materials?.find((m) => m.id === e.target.value);
                  if (material) setValue('label', material.name);
                }}
              >
                <option value={NEW_OPTION}>Autre</option>
                {materials?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>

            {materialId === NEW_OPTION && (
              <FormField
                label="Nom du nouveau materiau / element"
                htmlFor="newMaterialName"
                required
                error={newMaterialInvalid ? 'Ce nom est requis' : undefined}
                hint="Sera ajoute au catalogue pour les prochaines depenses."
              >
                <Input
                  id="newMaterialName"
                  placeholder="Ex: Peinture epoxy"
                  value={newMaterialName}
                  onChange={(e) => {
                    setNewMaterialName(e.target.value);
                    setValue('label', e.target.value);
                  }}
                  autoFocus
                />
              </FormField>
            )}

            <FormField label="Libelle" htmlFor="label" required error={errors.label?.message}>
              <Input id="label" placeholder="Ciment 32,5" {...register('label')} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <SectionIcon>
                <Calculator className="h-4 w-4" />
              </SectionIcon>
              <h3 className="font-display text-sm font-semibold text-ink-700">Detail de la depense</h3>
            </div>

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

            <div className="rounded-xl border border-blueprint-100 bg-blueprint-50/60 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-blueprint-600">Total (recalcule par le serveur)</p>
              <p className="mt-0.5 font-ledger text-2xl font-bold text-ink-900">{formatMoney(total, project?.currency)}</p>
            </div>

            {willRequireConfirmation && (
              <div className="flex items-start gap-2 rounded-md border border-safety-200 bg-safety-50 px-3 py-2.5 text-sm text-safety-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Cette depense depasse le seuil configure ({formatMoney(threshold ?? 0, project?.currency)}) : elle restera en attente jusqu&apos;a confirmation du client.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <SectionIcon>
                <Truck className="h-4 w-4" />
              </SectionIcon>
              <h3 className="font-display text-sm font-semibold text-ink-700">Fournisseur et paiement</h3>
            </div>

            <FormField label="Fournisseur" htmlFor="supplier">
              <Input id="supplier" {...register('supplier')} />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Reference facture" htmlFor="invoiceReference">
                <Input id="invoiceReference" {...register('invoiceReference')} />
              </FormField>
              <FormField label="Date" htmlFor="date">
                <Input id="date" type="date" {...register('date')} />
              </FormField>
            </div>

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
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <FormField label="Observation" htmlFor="observation">
              <Textarea id="observation" rows={3} {...register('observation')} />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Annuler
          </Button>
          <Button type="submit" loading={busy} disabled={newCategoryInvalid || newMaterialInvalid}>
            Enregistrer la depense
          </Button>
        </div>
      </form>
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