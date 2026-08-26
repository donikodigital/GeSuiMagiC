//frontend/src/services/budgets.service.ts
import { api } from '@/lib/api-client';
import type { Budget, BudgetComparison } from '@/types/models';

export const budgetsService = {
  listForProject: (projectId: string) => api.get<Budget[]>(`/projects/${projectId}/budgets`),

  comparison: (projectId: string) => api.get<BudgetComparison[]>(`/projects/${projectId}/budgets/comparison`),

  upsert: (projectId: string, categoryId: string, amount: number) =>
    api.post<Budget>(`/projects/${projectId}/budgets`, { categoryId, amount }),

  remove: (projectId: string, categoryId: string) => api.delete(`/projects/${projectId}/budgets/${categoryId}`),
};
