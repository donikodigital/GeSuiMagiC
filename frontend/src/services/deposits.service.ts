//frontend/src/services/deposits.service.ts
import { api } from '@/lib/api-client';
import type { Deposit, DepositStatus, PaginatedResponse, PaymentMethod } from '@/types/models';

export interface CreateDepositPayload {
  supervisorId: string;
  amount: number;
  currency?: string;
  date?: string;
  motif?: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  observation?: string;
}

export interface DepositFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: DepositStatus;
  supervisorId?: string;
  from?: string;
  to?: string;
}

function buildQuery(filters: object) {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export const depositsService = {
  listForProject: (projectId: string, filters: DepositFilters = {}) =>
    api.get<PaginatedResponse<Deposit>>(`/projects/${projectId}/deposits?${buildQuery(filters)}`),

  create: (projectId: string, payload: CreateDepositPayload) => api.post<Deposit>(`/projects/${projectId}/deposits`, payload),

  get: (id: string) => api.get<Deposit>(`/deposits/${id}`),

  approve: (id: string) => api.post<Deposit>(`/deposits/${id}/approve`),

  reject: (id: string, reason: string) => api.post<Deposit>(`/deposits/${id}/reject`, { reason }),

  correct: (id: string, newAmount: number, reason: string) => api.post<Deposit>(`/deposits/${id}/correct`, { newAmount, reason }),
};
