//frontend/src/app/(app)/projects/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
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
  clientId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

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
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { currency: 'GNF' } });

  const onSubmit = async (values: FormValues) => {
    const project = await createProject.mutateAsync({
      ...values,
      surfaceArea: values.surfaceArea === '' ? undefined : Number(values.surfaceArea),
      roomCount: values.roomCount === '' ? undefined : Number(values.roomCount),
      estimatedCost: values.estimatedCost === '' ? undefined : Number(values.estimatedCost),
      budget: Number(values.budget),
    });
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nouveau projet" description="Chaque projet possede son propre portefeuille financier, totalement independant des autres." />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-ink-700">Informations generales</h3>

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

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type de construction" htmlFor="constructionType">
                <Input id="constructionType" placeholder="Villa, immeuble..." {...register('constructionType')} />
              </FormField>
              <FormField label="Type (T2, T3, T4...)" htmlFor="projectType">
                <Input id="projectType" placeholder="T4" {...register('projectType')} />
              </FormField>
            </div>

            <FormField label="Motif" htmlFor="motif">
              <Input id="motif" placeholder="Residence familiale, investissement locatif..." {...register('motif')} />
            </FormField>

            <FormField label="Description" htmlFor="description">
              <Textarea id="description" rows={3} {...register('description')} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-ink-700">Localisation</h3>
            <FormField label="Adresse / lieu-dit" htmlFor="location">
              <Input id="location" {...register('location')} />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Ville" htmlFor="city">
                <Input id="city" placeholder="Conakry" {...register('city')} />
              </FormField>
              <FormField label="Pays" htmlFor="country">
                <Input id="country" placeholder="Guinee" {...register('country')} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Superficie (m²)" htmlFor="surfaceArea">
                <Input id="surfaceArea" type="number" step="0.01" {...register('surfaceArea')} />
              </FormField>
              <FormField label="Nombre de pieces" htmlFor="roomCount">
                <Input id="roomCount" type="number" {...register('roomCount')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-ink-700">Planning et budget</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date de debut prevue" htmlFor="startDate">
                <Input id="startDate" type="date" {...register('startDate')} />
              </FormField>
              <FormField label="Date de fin estimee" htmlFor="endDate">
                <Input id="endDate" type="date" {...register('endDate')} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            <FormField label="Budget alloue" htmlFor="budget" required error={errors.budget?.message} hint="C'est le budget de reference pour le suivi financier du chantier.">
              <Input id="budget" type="number" placeholder="800000000" {...register('budget')} />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Annuler
          </Button>
          <Button type="submit" loading={createProject.isPending}>
            Creer le projet
          </Button>
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
