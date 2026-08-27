// frontend/src/hooks/use-messages.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { messagesService, type CreateMessagePayload, type MessageFilters } from '@/services/messages.service';
import type { MessageStatus } from '@/types/models';
import { ApiError } from '@/lib/api-client';

function handleError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

export function useMessages(filters: MessageFilters = {}) {
  return useQuery({
    queryKey: ['messages', filters],
    queryFn: () => messagesService.list(filters),
  });
}

export function useMessage(id: string | undefined) {
  return useQuery({
    queryKey: ['messages', 'detail', id],
    queryFn: () => messagesService.get(id!),
    enabled: !!id,
  });
}

export function useCreateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessagePayload) => messagesService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message envoye.');
    },
    onError: (error) => handleError(error, "Impossible d'envoyer le message."),
  });
}

export function useReplyMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => messagesService.reply(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Reponse envoyee.');
    },
    onError: (error) => handleError(error, "Impossible d'envoyer la reponse."),
  });
}

export function useUpdateMessageStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MessageStatus }) => messagesService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Statut mis a jour.');
    },
    onError: (error) => handleError(error, 'Impossible de mettre a jour le statut.'),
  });
}

export function useMarkMessageAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => messagesService.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }),
  });
}