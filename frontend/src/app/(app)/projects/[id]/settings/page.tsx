//frontend/src/app/(app)/projects/[id]/settings/page.tsx
// ============================================================================
// app/(app)/projects/[id]/reglages/page.tsx - v1.2
// Polish visuel des deux cartes : icone de section, apercu du badge de
// statut en direct (avant meme d'enregistrer), toggle personnalise au lieu
// de la case a cocher brute, champ de seuil avec suffixe de devise. Les
// deux toasts de confirmation (statut + parametres) etaient deja presents,
// aucune logique metier ou mutation n'a change.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Settings2, ShieldCheck } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { projectsService } from '@/services/projects.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/input';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';
import { StatusBadge } from '@/components/ui/badge';
import { projectStatusMeta } from '@/lib/format';
import type { ProjectStatus } from '@/types/models';

interface FormValues {
  autoApproveExpenses: boolean;
  expenseApprovalThreshold: number;
  budget?: number;
}

const STATUS_OPTIONS: ProjectStatus[] = ['DRAFT', 'PLANNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'ARCHIVED'];

function SectionIcon({ children }: { children: React.ReactNode }) {
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">{children}</div>;
}

function ProjectStatusCard({ projectId, currentStatus }: { projectId: string; currentStatus: ProjectStatus }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<ProjectStatus>(currentStatus);

  React.useEffect(() => setStatus(currentStatus), [currentStatus]);

  const mutation = useMutation({
    mutationFn: (next: ProjectStatus) => projectsService.updateStatus(projectId, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Statut du chantier mis a jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise a jour du statut impossible.'),
  });

  const changed = status !== currentStatus;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <SectionIcon>
            <Settings2 className="h-4 w-4" />
          </SectionIcon>
          <div>
            <CardTitle>Statut du chantier</CardTitle>
            <CardDescription>
              Un projet cree en Brouillon doit passer a un autre statut pour devenir visible comme actif. Archiver un
              projet le retire de la liste active sans en supprimer l&apos;historique.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex-1">
              <FormField label="Statut" htmlFor="project-status">
                <Select
                  id="project-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {projectStatusMeta[s].label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="flex items-center gap-2 pb-2.5 sm:pb-0.5">
              <span className="text-xs text-ink-400">Apercu</span>
              <StatusBadge label={projectStatusMeta[status].label} tone={projectStatusMeta[status].tone} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <p className="text-xs text-ink-400">{changed ? 'Modification non enregistree.' : 'Aucune modification en attente.'}</p>
            <Button type="button" disabled={!changed} loading={mutation.isPending} onClick={() => mutation.mutate(status)}>
              Enregistrer le statut
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const { isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: project, isLoading, isError } = useProject(params.id);

  const {
    register,
    handleSubmit,
    watch,
    reset,
  } = useForm<FormValues>();

  const autoApprove = watch('autoApproveExpenses');

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
    <div className="mx-auto max-w-lg space-y-6">
      <ProjectStatusCard projectId={params.id} currentStatus={project.status} />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <SectionIcon>
              <ShieldCheck className="h-4 w-4" />
            </SectionIcon>
            <div>
              <CardTitle>Validation des depenses</CardTitle>
              <CardDescription>En dessous du seuil, une depense est validee automatiquement. Au-dessus, votre confirmation est requise.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-5">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-concrete bg-paper/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink-800">Validation automatique sous le seuil</p>
                <p className="text-xs text-ink-500">{autoApprove ? 'Activee' : 'Desactivee'} — modifiable a tout moment.</p>
              </div>
              <input type="checkbox" className="peer sr-only" {...register('autoApproveExpenses')} />
              <span className="relative h-6 w-11 shrink-0 rounded-full bg-concrete-dark transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-moss peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-blueprint-400 peer-focus-visible:ring-offset-2" />
            </label>

            <FormField
              label="Seuil de validation automatique"
              htmlFor="expenseApprovalThreshold"
              hint="Au-dela de ce montant, votre confirmation sera demandee pour chaque depense."
            >
              <div className="relative">
                <Input id="expenseApprovalThreshold" type="number" className="pr-14" {...register('expenseApprovalThreshold')} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-400">
                  {project.currency}
                </span>
              </div>
            </FormField>

            {isSuperadmin && (
              <FormField label="Budget du projet" htmlFor="budget" hint="Reserve au superadmin.">
                <div className="relative">
                  <Input id="budget" type="number" className="pr-14" {...register('budget')} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-400">
                    {project.currency}
                  </span>
                </div>
              </FormField>
            )}

            <div className="flex justify-end border-t border-concrete pt-4">
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