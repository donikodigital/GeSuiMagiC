// frontend/src/hooks/use-deposits.ts - v1.1
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { depositsService, type CreateDepositPayload, type DepositFilters, type UpdateDepositPayload } from '@/services/deposits.service';
import { ApiError } from '@/lib/api-client';

function handleError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

export function useDeposits(projectId: string, filters: DepositFilters = {}) {
  return useQuery({
    queryKey: ['deposits', projectId, filters],
    queryFn: () => depositsService.listForProject(projectId, filters),
    enabled: !!projectId,
  });
}

export function useDeposit(id: string | undefined) {
  return useQuery({
    queryKey: ['deposits', 'detail', id],
    queryFn: () => depositsService.get(id!),
    enabled: !!id,
  });
}

export function useCreateDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDepositPayload) => depositsService.create(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      toast.success('Depot enregistre. Le superviseur va etre notifie.');
    },
    onError: (error) => handleError(error, "Impossible d'enregistrer le depot."),
  });
}

export function useApproveDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => depositsService.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depot valide, le solde a ete mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de valider ce depot.'),
  });
}

export function useRejectDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => depositsService.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      toast.success('Depot refuse.');
    },
    onError: (error) => handleError(error, 'Impossible de refuser ce depot.'),
  });
}

export function useUpdateDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDepositPayload }) => depositsService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depot modifie.');
    },
    onError: (error) => handleError(error, 'Impossible de modifier ce depot.'),
  });
}

export function useRemoveDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => depositsService.remove(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depot supprime.');
    },
    onError: (error) => handleError(error, 'Impossible de supprimer ce depot.'),
  });
}

export function useToggleArchiveDeposit(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => (archive ? depositsService.archive(id) : depositsService.unarchive(id)),
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['deposits', projectId] });
      toast.success(archive ? 'Depot archive.' : 'Depot desarchive.');
    },
    onError: (error) => handleError(error, "Impossible de modifier l'archivage."),
  });
}