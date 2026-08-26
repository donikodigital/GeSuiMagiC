// frontend/src/services/supervisors.service.ts - v1.1
// Ajout de me() et updateMe(), memes conventions que clientsService.

import { api } from '@/lib/api-client';
import type { PaginatedResponse, SupervisorProfile } from '@/types/models';

export interface CreateSupervisorPayload {
  email: string;
  firstName: string;
  lastName: string;
  address?: string;
  profession?: string;
  phone?: string;
  notes?: string;
}

export const supervisorsService = {
  list: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<SupervisorProfile>>(`/supervisors?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),

  get: (id: string) => api.get<SupervisorProfile>(`/supervisors/${id}`),

  me: () => api.get<SupervisorProfile>('/supervisors/me'),

  updateMe: (payload: { phone?: string; address?: string; profession?: string }) =>
    api.patch<SupervisorProfile>('/supervisors/me', payload),

  create: (payload: CreateSupervisorPayload) => api.post<SupervisorProfile>('/supervisors', payload),

  update: (id: string, payload: Partial<CreateSupervisorPayload>) => api.patch<SupervisorProfile>(`/supervisors/${id}`, payload),

  setStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') =>
    api.patch<SupervisorProfile>(`/supervisors/${id}/status`, { status }),
};