//frontend/src/hooks/use-projects.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { projectsService, type CreateProjectPayload, type ProjectFilters, type SupervisorPosition } from '@/services/projects.service';
import type { ProjectStatus } from '@/types/models';
import { ApiError } from '@/lib/api-client';

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: () => projectsService.list(filters),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsService.get(id!),
    enabled: !!id,
  });
}

export function useProjectFinancialSummary(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id, 'financial-summary'],
    queryFn: () => projectsService.financialSummary(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

function handleError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => projectsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projet cree avec succes.');
    },
    onError: (error) => handleError(error, 'Impossible de creer le projet.'),
  });
}

export function useUpdateProjectStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: ProjectStatus) => projectsService.updateStatus(projectId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Statut du projet mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de mettre a jour le statut.'),
  });
}

export function useUpdateProjectBudget(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (budget: number) => projectsService.updateFinancials(projectId, { budget }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'financial-summary'] });
      toast.success('Budget mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de modifier le budget.'),
  });
}

export function useUpdateProjectFinancials(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { budget?: number; autoApproveExpenses?: boolean; expenseApprovalThreshold?: number }) =>
      projectsService.updateFinancials(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'financial-summary'] });
      toast.success('Parametres financiers mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de mettre a jour les parametres financiers.'),
  });
}

export function useAssignSupervisor(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { supervisorId: string; position?: SupervisorPosition }) => projectsService.assignSupervisor(projectId, input.supervisorId, input.position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Superviseur affecte au projet.');
    },
    onError: (error) => handleError(error, "Impossible d'affecter ce superviseur."),
  });
}

export function useUpdateSupervisorPosition(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { supervisorId: string; position: SupervisorPosition }) => projectsService.updateSupervisorPosition(projectId, input.supervisorId, input.position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Fonction mise à jour.');
    },
    onError: (error) => handleError(error, 'Impossible de modifier la fonction.'),
  });
}

export function useRevokeSupervisor(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supervisorId: string) => projectsService.revokeSupervisor(projectId, supervisorId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      const pending = result?.pendingDeposits ?? 0;
      if (pending > 0) {
        toast.warning(
          `Affectation revoquee. ${pending} depot${pending > 1 ? 's' : ''} de ce superviseur ${pending > 1 ? 'restent' : 'reste'} en attente : pensez a ${pending > 1 ? 'les' : 'le'} valider ou rejeter.`,
        );
      } else {
        toast.success('Affectation revoquee.');
      }
    },
    onError: (error) => handleError(error, 'Impossible de revoquer cette affectation.'),
  });
}