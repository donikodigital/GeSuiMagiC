// frontend/src/hooks/use-expenses.ts - v1.2
// Fix : toutes les mutations invalidaient uniquement ['expenses', projectId],
// ce qui ne matche jamais la clé de la query detail (['expenses', 'detail', id]).
// Consequence : succes API + toast de succes, mais la page detail restait
// sur les anciennes valeurs en cache (d'ou l'impression que la modification
// "revient comme avant"). On invalide desormais ['expenses'] au sens large,
// meme motif que correctMutation dans la page detail, qui elle fonctionnait
// deja correctement.
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesService, type CreateExpensePayload, type ExpenseFilters, type UpdateExpensePayload } from '@/services/expenses.service';
import type { ExpensePaymentStatus } from '@/types/models';
import { ApiError } from '@/lib/api-client';

function handleError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

export function useExpenses(projectId: string, filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: ['expenses', projectId, filters],
    queryFn: () => expensesService.listForProject(projectId, filters),
    enabled: !!projectId,
  });
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ['expenses', 'detail', id],
    queryFn: () => expensesService.get(id!),
    enabled: !!id,
  });
}

export function useCreateExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpensePayload) => expensesService.create(projectId, payload),
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success(
        expense.status === 'APPROVED' ? 'Depense enregistree et validee automatiquement.' : 'Depense enregistree, en attente de validation du client.',
      );
    },
    onError: (error) => handleError(error, "Impossible d'enregistrer la depense."),
  });
}

export function useApproveExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesService.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depense validee, le solde a ete mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de valider cette depense.'),
  });
}

export function useRejectExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expensesService.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Depense refusee.');
    },
    onError: (error) => handleError(error, 'Impossible de refuser cette depense.'),
  });
}

export function useCancelExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expensesService.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depense annulee, le solde a ete recalcule.');
    },
    onError: (error) => handleError(error, "Impossible d'annuler cette depense."),
  });
}

export function useUpdateExpensePayment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paymentStatus, amountPaidToSupplier }: { id: string; paymentStatus: ExpensePaymentStatus; amountPaidToSupplier?: number }) =>
      expensesService.updatePaymentStatus(id, paymentStatus, amountPaidToSupplier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Statut de paiement fournisseur mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de mettre a jour le statut de paiement.'),
  });
}

export function useUpdateExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateExpensePayload }) => expensesService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depense modifiee.');
    },
    onError: (error) => handleError(error, 'Impossible de modifier cette depense.'),
  });
}

export function useRemoveExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expensesService.remove(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Depense supprimee.');
    },
    onError: (error) => handleError(error, "Impossible de supprimer cette depense."),
  });
}

export function useToggleArchiveExpense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => (archive ? expensesService.archive(id) : expensesService.unarchive(id)),
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(archive ? 'Depense archivee.' : 'Depense desarchivee.');
    },
    onError: (error) => handleError(error, "Impossible de modifier l'archivage."),
  });
}