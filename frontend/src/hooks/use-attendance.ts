//frontend/src/hooks/use-attendance.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { attendanceService } from '@/services/attendance.service';
import { ApiError } from '@/lib/api-client';
import type { UpsertWorkDayPayload } from '@/types/models';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function usePhases(projectId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', projectId, 'phases'],
    queryFn: () => attendanceService.listPhases(projectId!),
    enabled: !!projectId,
  });
}

export function useWorkMonth(projectId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['attendance', projectId, 'month', month],
    queryFn: () => attendanceService.month(projectId!, month),
    enabled: !!projectId,
  });
}

export function useWorkSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', projectId, 'summary'],
    queryFn: () => attendanceService.summary(projectId!),
    enabled: !!projectId,
  });
}

/** Une saisie de presence change les jours travailles, les totaux par etape et les chiffres de l'alimentation. */
function useInvalidateAttendance(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['attendance', projectId] });
    queryClient.invalidateQueries({ queryKey: ['meals', projectId] });
    queryClient.invalidateQueries({ queryKey: ['site', projectId] });
  };
}

export function useSaveWorkDay(projectId: string) {
  const invalidate = useInvalidateAttendance(projectId);
  return useMutation({
    mutationFn: ({ date, payload }: { date: string; payload: UpsertWorkDayPayload }) => attendanceService.saveDay(projectId, date, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Journée enregistrée.');
    },
    onError: (error) => toast.error(errorMessage(error, "Impossible d'enregistrer cette journée.")),
  });
}

export function useClearWorkDay(projectId: string) {
  const invalidate = useInvalidateAttendance(projectId);
  return useMutation({
    mutationFn: (date: string) => attendanceService.clearDay(projectId, date),
    onSuccess: () => {
      invalidate();
      toast.success('Saisie supprimée.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Impossible de supprimer cette saisie.')),
  });
}

export function usePhaseActions(projectId: string) {
  const invalidate = useInvalidateAttendance(projectId);
  const fail = (fallback: string) => (error: unknown) => toast.error(errorMessage(error, fallback));

  const create = useMutation({
    mutationFn: (name: string) => attendanceService.createPhase(projectId, name),
    onSuccess: () => {
      invalidate();
      toast.success('Étape ajoutée.');
    },
    onError: fail("Impossible d'ajouter cette étape."),
  });

  const createDefaults = useMutation({
    mutationFn: () => attendanceService.createDefaultPhases(projectId),
    onSuccess: () => {
      invalidate();
      toast.success('Étapes par défaut ajoutées.');
    },
    onError: fail("Impossible d'ajouter les étapes par défaut."),
  });

  const update = useMutation({
    mutationFn: ({ phaseId, payload }: { phaseId: string; payload: { name?: string; isActive?: boolean; budgetAmount?: number | null; plannedStart?: string | null; plannedEnd?: string | null } }) =>
      attendanceService.updatePhase(projectId, phaseId, payload),
    onSuccess: invalidate,
    onError: fail('Impossible de modifier cette étape.'),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => attendanceService.reorderPhases(projectId, orderedIds),
    onSuccess: invalidate,
    onError: fail("Impossible de réordonner les étapes."),
  });

  const remove = useMutation({
    mutationFn: (phaseId: string) => attendanceService.removePhase(projectId, phaseId),
    onSuccess: () => {
      invalidate();
      toast.success('Étape supprimée.');
    },
    onError: fail('Impossible de supprimer cette étape.'),
  });

  return { create, createDefaults, update, reorder, remove };
}
