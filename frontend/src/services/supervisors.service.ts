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

  create: (payload: CreateSupervisorPayload) => api.post<SupervisorProfile>('/supervisors', payload),

  update: (id: string, payload: Partial<CreateSupervisorPayload>) => api.patch<SupervisorProfile>(`/supervisors/${id}`, payload),

  setStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') =>
    api.patch<SupervisorProfile>(`/supervisors/${id}/status`, { status }),
};
