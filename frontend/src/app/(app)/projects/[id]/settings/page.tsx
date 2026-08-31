// frontend/src/app/(app)/projects/[id]/settings/page.tsx - v1.3
// - Ajout du garde RequireRole (CLIENT, SUPERADMIN) - absent jusqu'ici,
//   la page etait techniquement accessible par URL directe a un
//   superviseur meme si aucun lien n'y menait pour lui.
// - Champ Budget : visibilite elargie a isClient || isSuperadmin (le
//   backend autorise desormais le client a modifier le budget, seule la
//   devise reste reservee au superadmin) - le libelle "Reserve au
//   superadmin" etait devenu inexact.
// - Seuil de validation : desactive visuellement + hint dynamique quand
//   la validation automatique est desactivee (coherent avec la page
//   Nouveau projet).
// - Deuxieme carte : ajout d'un indicateur "modification non enregistree"
//   via isDirty, meme pattern que ProjectStatusCard, bouton desactive tant
//   que rien n'a change.
// Aucun changement sur ProjectStatusCard, ni sur les mutations/endpoints.
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
import { RequireRole } from '@/components/shared/require-role';
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
      toast.success('Statut du chantier mis à jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise à jour du statut impossible.'),
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
              Un projet crée en Brouillon doit passer à un autre statut pour devenir visible comme actif. Archiver un
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
              <span className="text-xs text-ink-400">Aperçu</span>
              <StatusBadge label={projectStatusMeta[status].label} tone={projectStatusMeta[status].tone} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <p className="text-xs text-ink-400">{changed ? 'Modification non enregistrée.' : 'Aucune modification en attente.'}</p>
            <Button type="button" disabled={!changed} loading={mutation.isPending} onClick={() => mutation.mutate(status)}>
              Enregistrer le statut
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectFinancialsCard({ project, projectId }: { project: NonNullable<ReturnType<typeof useProject>['data']>; projectId: string }) {
  const { isClient, isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const canEditBudget = isClient || isSuperadmin;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty },
  } = useForm<FormValues>();

  const autoApprove = watch('autoApproveExpenses');

  React.useEffect(() => {
    reset({
      autoApproveExpenses: project.autoApproveExpenses,
      expenseApprovalThreshold: parseFloat(project.expenseApprovalThreshold),
      budget: parseFloat(project.budget),
    });
  }, [project, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      projectsService.updateFinancials(projectId, {
        autoApproveExpenses: values.autoApproveExpenses,
        expenseApprovalThreshold: Number(values.expenseApprovalThreshold),
        ...(canEditBudget && values.budget ? { budget: Number(values.budget) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Paramètres mis à jour.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Mise à jour impossible.'),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <SectionIcon>
            <ShieldCheck className="h-4 w-4" />
          </SectionIcon>
          <div>
            <CardTitle>Validation des dépenses</CardTitle>
            <CardDescription>En dessous du seuil, une dépense est validée automatiquement. Au-dessus, votre confirmation est requise.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-concrete bg-paper/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-800">Validation automatique sous le seuil</p>
              <p className="text-xs text-ink-500">{autoApprove ? 'Activee' : 'Desactivee'} — modifiable à tout moment.</p>
            </div>
            <input type="checkbox" className="peer sr-only" {...register('autoApproveExpenses')} />
            <span className="relative h-6 w-11 shrink-0 rounded-full bg-concrete-dark transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-moss peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-blueprint-400 peer-focus-visible:ring-offset-2" />
          </label>

          <FormField
            label="Seuil de validation automatique"
            htmlFor="expenseApprovalThreshold"
            hint={
              autoApprove
                ? 'Au-delà de ce montant, votre confirmation sera demandée pour chaque dépense.'
                : 'Ce seuil est ignoré tant que la validation automatique est desactivée.'
            }
          >
            <div className="relative">
              <Input
                id="expenseApprovalThreshold"
                type="number"
                disabled={!autoApprove}
                className="pr-14"
                {...register('expenseApprovalThreshold', { valueAsNumber: true })}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-400">
                {project.currency}
              </span>
            </div>
          </FormField>

          {canEditBudget && (
            <FormField label="Budget du projet" htmlFor="budget" hint="Budget de référence pour le suivi financier de ce chantier.">
              <div className="relative">
                <Input id="budget" type="number" className="pr-14" {...register('budget', { valueAsNumber: true })} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-400">
                  {project.currency}
                </span>
              </div>
            </FormField>
          )}

          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <p className="text-xs text-ink-400">{isDirty ? 'Modification non enregistrée.' : 'Aucune modification en attente.'}</p>
            <Button type="submit" disabled={!isDirty} loading={mutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProjectSettingsPageContent() {
  const params = useParams<{ id: string }>();
  const { data: project, isLoading, isError } = useProject(params.id);

  if (isLoading) return <PageSpinner />;
  if (isError || !project) return <ErrorState message="Impossible de charger les paramètres." />;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <ProjectStatusCard projectId={params.id} currentStatus={project.status} />
      <ProjectFinancialsCard project={project} projectId={params.id} />
    </div>
  );
}

export default function ProjectSettingsPage() {
  return (
    <RequireRole roles={['CLIENT', 'SUPERADMIN']}>
      <ProjectSettingsPageContent />
    </RequireRole>
  );
}