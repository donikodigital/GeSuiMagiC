//frontend/src/services/clients.service.ts
import { api } from '@/lib/api-client';
import type { ClientProfile, PaginatedResponse, Project } from '@/types/models';

export interface CreateClientPayload {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profession?: string;
  address?: string;
  city?: string;
  country?: string;
  companyName?: string;
  companyAddress?: string;
  firstProject?: {
    name: string;
    budget: number;
    currency?: string;
    motif?: string;
    constructionType?: string;
    location?: string;
    city?: string;
    country?: string;
    projectType?: string;
    surfaceArea?: number;
    roomCount?: number;
  };
}

export const clientsService = {
  list: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<ClientProfile>>(`/clients?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),

  get: (id: string) => api.get<ClientProfile>(`/clients/${id}`),

  me: () => api.get<ClientProfile>('/clients/me'),

  updateMe: (payload: { phone?: string; address?: string; city?: string; profession?: string }) =>
    api.patch<ClientProfile>('/clients/me', payload),

  create: (payload: CreateClientPayload) => api.post<ClientProfile>('/clients', payload),

  update: (id: string, payload: Partial<CreateClientPayload>) => api.patch<ClientProfile>(`/clients/${id}`, payload),

  suspend: (id: string) => api.patch<ClientProfile>(`/clients/${id}/suspend`),

  reactivate: (id: string) => api.patch<ClientProfile>(`/clients/${id}/reactivate`),
};
