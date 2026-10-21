//frontend/src/hooks/use-meals.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mealsService } from '@/services/meals.service';
import { ApiError } from '@/lib/api-client';
import type { UpsertMealEnvelopePayload } from '@/types/models';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function useMealMonths(projectId: string | undefined) {
  return useQuery({
    queryKey: ['meals', projectId, 'months'],
    queryFn: () => mealsService.months(projectId!),
    enabled: !!projectId,
  });
}

export function useMealMonth(projectId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['meals', projectId, 'month', month],
    queryFn: () => mealsService.month(projectId!, month),
    enabled: !!projectId,
  });
}

export function useMealActions(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['meals', projectId] });
  const fail = (fallback: string) => (error: unknown) => toast.error(errorMessage(error, fallback));

  const saveEnvelope = useMutation({
    mutationFn: ({ month, payload }: { month: string; payload: UpsertMealEnvelopePayload }) => mealsService.saveEnvelope(projectId, month, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Enveloppe du mois enregistrée.');
    },
    onError: fail("Impossible d'enregistrer l'enveloppe."),
  });

  const carryOver = useMutation({
    mutationFn: ({ fromMonth, payload }: { fromMonth: string; payload: { toMonth: string; amount: number; reason?: string } }) =>
      mealsService.carryOver(projectId, fromMonth, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Reliquat reporté.');
    },
    onError: fail('Impossible de reporter ce reliquat.'),
  });

  const cancelCarryOver = useMutation({
    mutationFn: ({ carryOverId, reason }: { carryOverId: string; reason: string }) => mealsService.cancelCarryOver(projectId, carryOverId, reason),
    onSuccess: () => {
      invalidate();
      toast.success('Report annulé.');
    },
    onError: fail("Impossible d'annuler ce report."),
  });

  const createRequest = useMutation({
    mutationFn: ({ month, message }: { month: string; message: string }) => mealsService.createRequest(projectId, month, message),
    onSuccess: () => {
      invalidate();
      toast.success('Demande envoyée au superviseur.');
    },
    onError: fail("Impossible d'envoyer cette demande."),
  });

  const answerRequest = useMutation({
    mutationFn: ({ requestId, response }: { requestId: string; response: string }) => mealsService.answerRequest(projectId, requestId, response),
    onSuccess: () => {
      invalidate();
      toast.success('Réponse envoyée au client.');
    },
    onError: fail("Impossible d'envoyer cette réponse."),
  });

  const closeRequest = useMutation({
    mutationFn: (requestId: string) => mealsService.closeRequest(projectId, requestId),
    onSuccess: () => {
      invalidate();
      toast.success('Demande clôturée.');
    },
    onError: fail('Impossible de clôturer cette demande.'),
  });

  return { saveEnvelope, carryOver, cancelCarryOver, createRequest, answerRequest, closeRequest };
}
