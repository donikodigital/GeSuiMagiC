'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { projectsService } from '@/services/projects.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';

interface FormValues {
  autoApproveExpenses: boolean;
  expenseApprovalThreshold: number;
  budget?: number;
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const { isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: project, isLoading, isError } = useProject(params.id);

  const { register, handleSubmit, reset } = useForm<FormValues>();

  React.useEffect(() => {
    if (project) {
      reset({
        autoApproveExpenses: project.autoApproveExpenses,
        expenseApprovalThreshold: parseFloat(project.expenseApprovalThreshold),
        budget: parseFloat(project.budget),
      });
    }
  }, [project, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      projectsService.updateFinancials(params.id, {
        autoApproveExpenses: values.autoApproveExpenses,
        expenseApprovalThreshold: Number(values.expenseApprovalThreshold),
        ...(isSuperadmin && values.budget ? { budget: Number(values.budget) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', params.id] });
      toast.success('Parametres mis a jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour impossible.'),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !project) return <ErrorState message="Impossible de charger les parametres." />;

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Validation des depenses</CardTitle>
            <CardDescription>En dessous du seuil, une depense est validee automatiquement. Au-dessus, votre confirmation est requise.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="h-4 w-4 rounded border-concrete-dark" {...register('autoApproveExpenses')} />
              Activer la validation automatique sous le seuil
            </label>

            <FormField label="Seuil de validation automatique" htmlFor="expenseApprovalThreshold" hint="Au-dela de ce montant, votre confirmation sera demandee pour chaque depense.">
              <Input id="expenseApprovalThreshold" type="number" {...register('expenseApprovalThreshold')} />
            </FormField>

            {isSuperadmin && (
              <FormField label="Budget du projet" htmlFor="budget" hint="Reserve au superadmin.">
                <Input id="budget" type="number" {...register('budget')} />
              </FormField>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={mutation.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
