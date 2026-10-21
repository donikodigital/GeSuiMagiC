//frontend/src/services/projects.service.ts
import { api } from '@/lib/api-client';
import type { FinancialSummary, PaginatedResponse, Project, ProjectStatus } from '@/types/models';

export interface CreateProjectPayload {
  name: string;
  description?: string;
  motif?: string;
  constructionType?: string;
  location?: string;
  city?: string;
  country?: string;
  surfaceArea?: number;
  roomCount?: number;
  projectType?: string;
  startDate?: string;
  endDate?: string;
  estimatedDurationDays?: number;
  estimatedCost?: number;
  budget: number;
  currency?: string;
  autoApproveExpenses?: boolean;
  expenseApprovalThreshold?: number;
  clientId?: string; // superadmin uniquement
}

/**
 * Champs acceptes par PATCH /projects/:id. Budget, devise, seuil de validation
 * et client passent par updateFinancials() / sont immuables : le backend
 * rejette tout champ inconnu (400).
 */
export type UpdateProjectPayload = Partial<
  Omit<CreateProjectPayload, 'budget' | 'currency' | 'estimatedCost' | 'autoApproveExpenses' | 'expenseApprovalThreshold' | 'clientId'>
> & { progressPercent?: number };

export interface ProjectFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus;
  clientId?: string;
  city?: string;
  country?: string;
}

function buildQuery(filters: ProjectFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

export const projectsService = {
  list: (filters: ProjectFilters = {}) => api.get<PaginatedResponse<Project>>(`/projects?${buildQuery(filters)}`),

  get: (id: string) => api.get<Project>(`/projects/${id}`),

  financialSummary: (id: string) => api.get<FinancialSummary>(`/projects/${id}/financial-summary`),

  create: (payload: CreateProjectPayload) => api.post<Project>('/projects', payload),

  update: (id: string, payload: UpdateProjectPayload) => api.patch<Project>(`/projects/${id}`, payload),

  updateFinancials: (id: string, payload: { budget?: number; currency?: string; autoApproveExpenses?: boolean; expenseApprovalThreshold?: number }) =>
    api.patch<Project>(`/projects/${id}/financials`, payload),

  updateStatus: (id: string, status: ProjectStatus) => api.patch<Project>(`/projects/${id}/status`, { status }),

  listSupervisors: (id: string) => api.get(`/projects/${id}/supervisors`),

  assignSupervisor: (id: string, supervisorId: string) => api.post(`/projects/${id}/supervisors`, { supervisorId }),

  /** `pendingDeposits` : depots encore en attente de ce superviseur, a traiter par le client. */
  revokeSupervisor: (id: string, supervisorId: string) =>
    api.delete<{ pendingDeposits?: number }>(`/projects/${id}/supervisors/${supervisorId}`),

  remove: (id: string) => api.delete<{ removed: boolean }>(`/projects/${id}`),
};