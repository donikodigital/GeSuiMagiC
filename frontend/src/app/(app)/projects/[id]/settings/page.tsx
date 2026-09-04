// frontend/src/app/(app)/projects/[id]/settings/page.tsx - v1.4
// Modernisation visuelle (sur demande - page jugee "tres basique") :
// - Statut du chantier : le <Select> natif est remplace par une grille de
//   pastilles cliquables colorees selon le tone de chaque statut
//   (projectStatusMeta[s].tone, memes 5 tons que STATUS_BAR_GRADIENT dans
//   client-dashboard.tsx : moss/safety/clay/ink/blueprint). La pastille
//   selectionnee EST l'apercu (elle prend directement la couleur du
//   statut), donc la ligne "Apercu" + StatusBadge separee disparait -
//   redondante avec ce nouveau rendu. setStatus/mutation inchanges.
// - Chaque carte recoit un bandeau degrade en tete (meme pattern que les
//   cartes de chantier du dashboard), dynamique pour le statut (suit la
//   couleur du statut actuellement selectionne), fixe blueprint pour la
//   carte financiere.
// - Indicateur "modification non enregistree" : ajout d'un point anime
//   (meme langage que les badges d'attente ailleurs dans l'app) en plus
//   du texte existant, sur les deux cartes.
// - Champ Budget : icone Wallet integree, comme les champs de montant
//   ailleurs dans l'app. Suffixe devise en pastille arrondie plutot
//   qu'en simple texte colle a droite.
// - Entree animee (animate-card-in, deja utilise pour ProjectTabCards),
//   legerement decalee entre les deux cartes.
// Aucun changement de logique/mutations/endpoints/roles - uniquement le
// balisage et les classes.
// ============================================================================

'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Check, Settings2, ShieldCheck, Wallet } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { projectsService } from '@/services/projects.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { PageSpinner, ErrorState } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';
import { RequireRole } from '@/components/shared/require-role';
import { projectStatusMeta } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ProjectStatus } from '@/types/models';

interface FormValues {
  autoApproveExpenses: boolean;
  expenseApprovalThreshold: number;
  budget?: number;
}

const STATUS_OPTIONS: ProjectStatus[] = ['DRAFT', 'PLANNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'ARCHIVED'];

const TONE_STYLES: Record<string, { bar: string; chipActive: string }> = {
  moss: { bar: 'from-moss-500 to-moss-300', chipActive: 'border-moss-600 bg-moss-600 text-white' },
  safety: { bar: 'from-safety-500 to-safety-300', chipActive: 'border-safety-500 bg-safety-500 text-white' },
  clay: { bar: 'from-clay-500 to-clay-300', chipActive: 'border-clay-600 bg-clay-600 text-white' },
  ink: { bar: 'from-ink-400 to-ink-200', chipActive: 'border-ink-700 bg-ink-700 text-white' },
  blueprint: { bar: 'from-blueprint-500 to-blueprint-300', chipActive: 'border-blueprint-600 bg-blueprint-600 text-white' },
};

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600 ring-1 ring-blueprint-100">
      {children}
    </div>
  );
}

function UnsavedIndicator({ dirty }: { dirty: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-400">
      {dirty && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-safety-400" />}
      {dirty ? 'Modification non enregistrée.' : 'Aucune modification en attente.'}
    </p>
  );
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
  const currentTone = TONE_STYLES[projectStatusMeta[status].tone] ?? TONE_STYLES.blueprint;

  return (
    <Card className="animate-card-in overflow-hidden">
      <div className={`h-1 w-full bg-gradient-to-r ${currentTone.bar} transition-colors`} />
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STATUS_OPTIONS.map((s) => {
              const meta = projectStatusMeta[s];
              const active = s === status;
              const styles = TONE_STYLES[meta.tone] ?? TONE_STYLES.blueprint;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    active
                      ? `${styles.chipActive} shadow-sm`
                      : 'border-concrete bg-white text-ink-600 hover:border-blueprint-200 hover:bg-blueprint-50/50',
                  )}
                >
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <UnsavedIndicator dirty={changed} />
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
    <Card className="animate-card-in overflow-hidden" style={{ animationDelay: '80ms' }}>
      <div className="h-1 w-full bg-gradient-to-r from-blueprint-500 to-blueprint-300" />
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
          <label
            className={cn(
              'flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors',
              autoApprove ? 'border-moss-200 bg-moss-50' : 'border-concrete bg-paper/60',
            )}
          >
            <div>
              <p className="text-sm font-medium text-ink-800">Validation automatique sous le seuil</p>
              <p className="text-xs text-ink-500">{autoApprove ? 'Activée' : 'Désactivée'} — modifiable à tout moment.</p>
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
                : 'Ce seuil est ignoré tant que la validation automatique est désactivée.'
            }
          >
            <div className="relative">
              <Input
                id="expenseApprovalThreshold"
                type="number"
                disabled={!autoApprove}
                className="pr-16 font-ledger"
                {...register('expenseApprovalThreshold', { valueAsNumber: true })}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded-full bg-concrete-light px-2 text-[11px] font-semibold text-ink-500">
                {project.currency}
              </span>
            </div>
          </FormField>

          {canEditBudget && (
            <FormField label="Budget du projet" htmlFor="budget" hint="Budget de référence pour le suivi financier de ce chantier.">
              <div className="relative">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <Input id="budget" type="number" className="pl-9 pr-16 font-ledger" {...register('budget', { valueAsNumber: true })} />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded-full bg-concrete-light px-2 text-[11px] font-semibold text-ink-500">
                  {project.currency}
                </span>
              </div>
            </FormField>
          )}

          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <UnsavedIndicator dirty={isDirty} />
            <Button type="submit" disabled={!isDirty} loading={mutation.isPending}>
              <Check className="h-4 w-4" /> Enregistrer
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