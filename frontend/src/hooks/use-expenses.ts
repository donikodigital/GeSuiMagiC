//frontend/src/hooks/use-expenses.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesService, type CreateExpensePayload, type ExpenseFilters } from '@/services/expenses.service';
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
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
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
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
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
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
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
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
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
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
      toast.success('Statut de paiement fournisseur mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de mettre a jour le statut de paiement.'),
  });
}
