//frontend/src/hooks/use-queued-submit.ts
'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { submitOrQueue, type QueueableRequest, type SubmitResult } from '@/lib/offline/outbox';
import { errorText } from '@/hooks/use-site';

/**
 * Enregistre une saisie de terrain : envoyee tout de suite si le reseau repond, sinon gardee sur l'appareil avec ses photos
 * et envoyee au retour du reseau. Renvoie null en cas de refus du serveur (la fenetre reste ouverte pour corriger).
 */
export function useQueuedSubmit(projectId: string) {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);

  const submit = React.useCallback(
    async <T extends { id?: string }>(input: Omit<QueueableRequest, 'userId' | 'projectId'>, successMessage: string): Promise<SubmitResult<T> | null> => {
      if (!userId) return null;
      setPending(true);
      try {
        const result = await submitOrQueue<T>({ ...input, userId, projectId });
        if (result.queued) toast.info('Hors ligne : enregistré sur cet appareil, envoi automatique au retour du réseau.');
        else toast.success(result.pendingFiles ? `${successMessage} Les photos partiront dès que le réseau le permettra.` : successMessage);
        void queryClient.invalidateQueries({ queryKey: ['site', projectId] });
        void queryClient.invalidateQueries({ queryKey: ['expenses'] });
        void queryClient.invalidateQueries({ queryKey: ['attendance', projectId] });
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
        return result;
      } catch (error) {
        toast.error(errorText(error, 'Enregistrement impossible.'));
        return null;
      } finally {
        setPending(false);
      }
    },
    [userId, projectId, queryClient],
  );

  return { submit, pending };
}
