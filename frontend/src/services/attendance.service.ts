//frontend/src/services/attendance.service.ts
import { api } from '@/lib/api-client';
import type { ProjectPhase, UpsertWorkDayPayload, WorkDay, WorkMonthView, WorkSummary } from '@/types/models';

export const attendanceService = {
  listPhases: (projectId: string) => api.get<ProjectPhase[]>(`/projects/${projectId}/phases`),

  createPhase: (projectId: string, name: string) => api.post<ProjectPhase>(`/projects/${projectId}/phases`, { name }),

  createDefaultPhases: (projectId: string) => api.post<ProjectPhase[]>(`/projects/${projectId}/phases/defaults`),

  updatePhase: (projectId: string, phaseId: string, payload: { name?: string; isActive?: boolean }) =>
    api.patch<ProjectPhase>(`/projects/${projectId}/phases/${phaseId}`, payload),

  reorderPhases: (projectId: string, orderedIds: string[]) => api.patch<ProjectPhase[]>(`/projects/${projectId}/phases/reorder`, { orderedIds }),

  removePhase: (projectId: string, phaseId: string) => api.delete<{ removed: boolean }>(`/projects/${projectId}/phases/${phaseId}`),

  month: (projectId: string, month: string) => api.get<WorkMonthView>(`/projects/${projectId}/work-days?month=${month}`),

  summary: (projectId: string) => api.get<WorkSummary>(`/projects/${projectId}/work-summary`),

  saveDay: (projectId: string, date: string, payload: UpsertWorkDayPayload) => api.put<WorkDay>(`/projects/${projectId}/work-days/${date}`, payload),

  clearDay: (projectId: string, date: string) => api.delete<{ removed: boolean }>(`/projects/${projectId}/work-days/${date}`),
};
