// frontend/src/app/(app)/projects/new/page.tsx - v2.1
// Ajout d'une carte "Validation des depenses" : le client choisit son
// autoApproveExpenses et son expenseApprovalThreshold des la creation, au
// lieu de subir silencieusement le defaut Prisma (5 000 000). Ce defaut ne
// s'applique plus que si le champ est laisse vide (garde-fou technique
// pour la colonne NOT NULL en base, plus une valeur figee).

'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarRange, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { useCreateProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { clientsService } from '@/services/clients.service';
import { RequireRole } from '@/components/shared/require-role';

const schema = z.object({
  name: z.string().min(2, 'Le nom du projet est requis'),
  description: z.string().optional(),
  motif: z.string().optional(),
  constructionType: z.string().optional(),
  projectType: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  surfaceArea: z.coerce.number().positive().optional().or(z.literal('')),
  roomCount: z.coerce.number().int().positive().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedCost: z.coerce.number().positive().optional().or(z.literal('')),
  budget: z.coerce.number().positive('Le budget doit etre superieur a 0'),
  currency: z.string().default('GNF'),
  autoApproveExpenses: z.boolean().default(true),
  expenseApprovalThreshold: z.coerce.number().positive().optional().or(z.literal('')),
  clientId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function SectionIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function NewProjectPageContent() {
  const router = useRouter();
  const { isSuperadmin } = useAuth();
  const createProject = useCreateProject();

  const clientsQuery = useQuery({
    queryKey: ['clients', 'select-list'],
    queryFn: () => clientsService.list(1, 200),
    enabled: isSuperadmin,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { currency: 'GNF', autoApproveExpenses: true } });

  const currency = watch('currency');
  const autoApproveExpenses = watch('autoApproveExpenses');

  const onSubmit = async (values: FormValues) => {
    const project = await createProject.mutateAsync({
      ...values,
      surfaceArea: values.surfaceArea === '' ? undefined : Number(values.surfaceArea),
      roomCount: values.roomCount === '' ? undefined : Number(values.roomCount),
      estimatedCost: values.estimatedCost === '' ? undefined : Number(values.estimatedCost),
      budget: Number(values.budget),
      expenseApprovalThreshold: values.expenseApprovalThreshold === '' ? undefined : Number(values.expenseApprovalThreshold),
    });
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl pb-4">
      <PageHeader title="Nouveau projet" description="Chaque projet possede son propre portefeuille financier, totalement independant des autres." />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={Building2} />
            <div>
              <CardTitle>Informations générales</CardTitle>
              <CardDescription>Le nom et la nature du chantier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSuperadmin && (
              <FormField label="Client" htmlFor="clientId" required error={errors.clientId?.message}>
                <Select id="clientId" {...register('clientId')} defaultValue="">
                  <option value="" disabled>
                    Selectionner un client
                  </option>
                  {clientsQuery.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            <FormField label="Nom du projet" htmlFor="name" required error={errors.name?.message}>
              <Input id="name" placeholder="Villa T4 - Conakry" {...register('name')} />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Type de construction" htmlFor="constructionType">
                <Input id="constructionType" placeholder="Villa, immeuble..." {...register('constructionType')} />
              </FormField>
              <FormField label="Type (T2, T3, T4...)" htmlFor="projectType">
                <Input id="projectType" placeholder="T4" {...register('projectType')} />
              </FormField>
            </div>

            <FormField label="Motif" htmlFor="motif">
              <Input id="motif" placeholder="Résidence familiale, investissement locatif..." {...register('motif')} />
            </FormField>

            <FormField label="Description" htmlFor="description">
              <Textarea id="description" rows={3} {...register('description')} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={MapPin} />
            <div>
              <CardTitle>Localisation</CardTitle>
              <CardDescription>Où se trouve le chantier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Adresse / lieu-dit" htmlFor="location">
              <Input id="location" {...register('location')} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Ville" htmlFor="city">
                <Input id="city" placeholder="Conakry" {...register('city')} />
              </FormField>
              <FormField label="Pays" htmlFor="country">
                <Input id="country" placeholder="Guinée" {...register('country')} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Superficie" htmlFor="surfaceArea">
                <div className="relative">
                  <Input id="surfaceArea" type="number" step="0.01" className="pr-10" {...register('surfaceArea')} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">m²</span>
                </div>
              </FormField>
              <FormField label="Nombre de pieces" htmlFor="roomCount">
                <Input id="roomCount" type="number" {...register('roomCount')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={CalendarRange} />
            <div>
              <CardTitle>Planning</CardTitle>
              <CardDescription>Dates previsionnelles du chantier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Date de début prevue" htmlFor="startDate">
                <Input id="startDate" type="date" {...register('startDate')} />
              </FormField>
              <FormField label="Date de fin estimée" htmlFor="endDate">
                <Input id="endDate" type="date" {...register('endDate')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blueprint-200 bg-blueprint-50/40">
          <CardHeader className="items-start gap-3 border-blueprint-200">
            <SectionIcon icon={Wallet} />
            <div>
              <CardTitle>Budget</CardTitle>
              <CardDescription>Le budget de référence pour le suivi financier du chantier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Cout estimatif" htmlFor="estimatedCost">
                <Input id="estimatedCost" type="number" {...register('estimatedCost')} />
              </FormField>
              <FormField label="Devise" htmlFor="currency">
                <Select id="currency" {...register('currency')}>
                  <option value="GNF">GNF</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </Select>
              </FormField>
            </div>

            <FormField label="Budget alloue" htmlFor="budget" required error={errors.budget?.message} hint="C'est le budget de référence pour le suivi financier du chantier.">
              <div className="relative">
                <Input
                  id="budget"
                  type="number"
                  placeholder="800000000"
                  className="pr-16 font-ledger text-base font-semibold"
                  {...register('budget')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-blueprint-600">
                  {currency || 'GNF'}
                </span>
              </div>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-start gap-3">
            <SectionIcon icon={ShieldCheck} />
            <div>
              <CardTitle>Validation des dépenses</CardTitle>
              <CardDescription>Comment les dépenses du superviseur seront validées sur ce chantier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-card border border-concrete bg-paper/60 p-4">
              <input
                type="checkbox"
                {...register('autoApproveExpenses')}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-concrete-dark text-blueprint-600 focus:ring-blueprint-400"
              />
              <span>
                <span className="block text-sm font-medium text-ink-800">Validation automatique en dessous du seuil</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Si desactivé, chaque dépense necessitera votre confirmation, quel que soit son montant.
                </span>
              </span>
            </label>

            <FormField
              label="Seuil de confirmation client"
              htmlFor="expenseApprovalThreshold"
              hint={
                autoApproveExpenses
                  ? "Au-delà de ce montant, une dépense necessitera votre confirmation. Laisse vide, une valeur de securité s'applique."
                  : 'Ce seuil est ignoré tant que la validation automatique est desactivée.'
              }
            >
              <div className="relative">
                <Input
                  id="expenseApprovalThreshold"
                  type="number"
                  placeholder="5000000"
                  disabled={!autoApproveExpenses}
                  className="pr-16"
                  {...register('expenseApprovalThreshold')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-400">
                  {currency || 'GNF'}
                </span>
              </div>
            </FormField>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-concrete bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Annuler
            </Button>
            <Button type="submit" loading={createProject.isPending}>
              Créer le projet
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <RequireRole roles={['CLIENT', 'SUPERADMIN']}>
      <NewProjectPageContent />
    </RequireRole>
  );
}