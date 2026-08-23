'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { projectsService, type CreateProjectPayload, type ProjectFilters } from '@/services/projects.service';
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

export function useAssignSupervisor(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supervisorId: string) => projectsService.assignSupervisor(projectId, supervisorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Superviseur affecte au projet.');
    },
    onError: (error) => handleError(error, "Impossible d'affecter ce superviseur."),
  });
}

export function useRevokeSupervisor(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supervisorId: string) => projectsService.revokeSupervisor(projectId, supervisorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Affectation revoquee.');
    },
    onError: (error) => handleError(error, 'Impossible de revoquer cette affectation.'),
  });
}
