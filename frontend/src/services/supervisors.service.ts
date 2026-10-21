//frontend/src/services/supervisors.service.ts
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

/** Champs acceptes par PATCH /supervisors/:id (l'email n'est pas modifiable). */
export type UpdateSupervisorPayload = Partial<Omit<CreateSupervisorPayload, 'email'>>;

export const supervisorsService = {
  list: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<SupervisorProfile>>(`/supervisors?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),

  get: (id: string) => api.get<SupervisorProfile>(`/supervisors/${id}`),

  me: () => api.get<SupervisorProfile>('/supervisors/me'),

  updateMe: (payload: { phone?: string; address?: string; profession?: string }) =>
    api.patch<SupervisorProfile>('/supervisors/me', payload),

  create: (payload: CreateSupervisorPayload) => api.post<SupervisorProfile>('/supervisors', payload),

  update: (id: string, payload: UpdateSupervisorPayload) => api.patch<SupervisorProfile>(`/supervisors/${id}`, payload),

  setStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') =>
    api.patch<SupervisorProfile>(`/supervisors/${id}/status`, { status }),

  resendInvitation: (id: string) => api.patch<{ sent: boolean }>(`/supervisors/${id}/resend-invitation`),
};