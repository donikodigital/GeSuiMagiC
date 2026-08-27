// frontend/src/services/messages.service.ts
import { api } from '@/lib/api-client';
import type { Message, MessageStatus, MessageType, PaginatedResponse } from '@/types/models';

export interface CreateMessagePayload {
  type: MessageType;
  subject: string;
  body: string;
  recipientId?: string;
  relatedEntityType?: 'Deposit' | 'Expense';
  relatedEntityId?: string;
}

export interface MessageFilters {
  page?: number;
  limit?: number;
  status?: MessageStatus;
  type?: MessageType;
}

function buildQuery(filters: object) {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export const messagesService = {
  list: (filters: MessageFilters = {}) => api.get<PaginatedResponse<Message>>(`/messages?${buildQuery(filters)}`),

  get: (id: string) => api.get<Message>(`/messages/${id}`),

  create: (payload: CreateMessagePayload) => api.post<Message>('/messages', payload),

  reply: (id: string, body: string) => api.post<Message>(`/messages/${id}/reply`, { body }),

  updateStatus: (id: string, status: MessageStatus) => api.patch<Message>(`/messages/${id}/status`, { status }),

  markAsRead: (id: string) => api.patch(`/messages/${id}/read`),
};