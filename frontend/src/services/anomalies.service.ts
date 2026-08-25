//frontend/src/services/anomalies.service.ts
import { api } from '@/lib/api-client';
import type { Anomaly, AnomalyStatus, PaginatedResponse } from '@/types/models';

export const anomaliesService = {
  listForProject: (projectId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<Anomaly>>(`/projects/${projectId}/anomalies?page=${page}&limit=${limit}`),

  listAll: (page = 1, limit = 20, status?: AnomalyStatus) =>
    api.get<PaginatedResponse<Anomaly>>(`/anomalies?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),

  create: (projectId: string, payload: { category: string; description: string; relatedExpenseId?: string }) =>
    api.post<Anomaly>(`/projects/${projectId}/anomalies`, payload),

  updateStatus: (id: string, status: AnomalyStatus, resolutionNote?: string) =>
    api.patch<Anomaly>(`/anomalies/${id}/status`, { status, resolutionNote }),
};
