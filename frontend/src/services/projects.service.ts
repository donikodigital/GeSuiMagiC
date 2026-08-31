// frontend/src/services/projects.service.ts - v1.1
// Ajout de autoApproveExpenses et expenseApprovalThreshold a
// CreateProjectPayload, pour les rendre choisissables des la creation.

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

  update: (id: string, payload: Partial<CreateProjectPayload>) => api.patch<Project>(`/projects/${id}`, payload),

  updateFinancials: (id: string, payload: { budget?: number; currency?: string; autoApproveExpenses?: boolean; expenseApprovalThreshold?: number }) =>
    api.patch<Project>(`/projects/${id}/financials`, payload),

  updateStatus: (id: string, status: ProjectStatus) => api.patch<Project>(`/projects/${id}/status`, { status }),

  listSupervisors: (id: string) => api.get(`/projects/${id}/supervisors`),

  assignSupervisor: (id: string, supervisorId: string) => api.post(`/projects/${id}/supervisors`, { supervisorId }),

  revokeSupervisor: (id: string, supervisorId: string) => api.delete(`/projects/${id}/supervisors/${supervisorId}`),
};