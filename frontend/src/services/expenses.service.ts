import { api } from '@/lib/api-client';
import type { Expense, ExpensePaymentStatus, ExpenseStatus, PaginatedResponse } from '@/types/models';

export interface CreateExpensePayload {
  date?: string;
  categoryId: string;
  materialId?: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  observation?: string;
  supplier?: string;
  invoiceReference?: string;
  paymentStatus?: ExpensePaymentStatus;
  amountPaidToSupplier?: number;
}

export interface ExpenseFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExpenseStatus;
  categoryId?: string;
  materialId?: string;
  supplier?: string;
  supervisorId?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
}

function buildQuery(filters: object) {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export const expensesService = {
  listForProject: (projectId: string, filters: ExpenseFilters = {}) =>
    api.get<PaginatedResponse<Expense>>(`/projects/${projectId}/expenses?${buildQuery(filters)}`),

  create: (projectId: string, payload: CreateExpensePayload) => api.post<Expense>(`/projects/${projectId}/expenses`, payload),

  get: (id: string) => api.get<Expense>(`/expenses/${id}`),

  approve: (id: string) => api.post<Expense>(`/expenses/${id}/approve`),

  reject: (id: string, reason: string) => api.post<Expense>(`/expenses/${id}/reject`, { reason }),

  cancel: (id: string, reason: string) => api.post<Expense>(`/expenses/${id}/cancel`, { reason }),

  correct: (id: string, newTotal: number, reason: string) => api.post<Expense>(`/expenses/${id}/correct`, { newTotal, reason }),

  updatePaymentStatus: (id: string, paymentStatus: ExpensePaymentStatus, amountPaidToSupplier?: number) =>
    api.patch<Expense>(`/expenses/${id}/payment-status`, { paymentStatus, amountPaidToSupplier }),
};
