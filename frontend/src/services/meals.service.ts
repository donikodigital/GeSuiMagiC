//frontend/src/services/meals.service.ts
import { api } from '@/lib/api-client';
import type { MealAccountRequest, MealMonthReport, MealRequestStatus, UpsertMealEnvelopePayload } from '@/types/models';

export const mealsService = {
  months: (projectId: string) => api.get<MealMonthReport[]>(`/projects/${projectId}/meals/months`),

  month: (projectId: string, month: string) => api.get<MealMonthReport>(`/projects/${projectId}/meals/months/${month}`),

  saveEnvelope: (projectId: string, month: string, payload: UpsertMealEnvelopePayload) =>
    api.put<MealMonthReport>(`/projects/${projectId}/meals/months/${month}`, payload),

  carryOver: (projectId: string, fromMonth: string, payload: { toMonth: string; amount: number; reason?: string }) =>
    api.post<MealMonthReport>(`/projects/${projectId}/meals/months/${fromMonth}/carry-over`, payload),

  cancelCarryOver: (projectId: string, carryOverId: string, reason: string) =>
    api.delete<MealMonthReport>(`/projects/${projectId}/meals/carry-overs/${carryOverId}`, { reason }),

  requests: (projectId: string, status?: MealRequestStatus) =>
    api.get<MealAccountRequest[]>(`/projects/${projectId}/meals/requests${status ? `?status=${status}` : ''}`),

  createRequest: (projectId: string, month: string, message: string) =>
    api.post<MealAccountRequest>(`/projects/${projectId}/meals/months/${month}/requests`, { message }),

  answerRequest: (projectId: string, requestId: string, response: string) =>
    api.post<MealAccountRequest>(`/projects/${projectId}/meals/requests/${requestId}/answer`, { response }),

  closeRequest: (projectId: string, requestId: string) =>
    api.post<MealAccountRequest>(`/projects/${projectId}/meals/requests/${requestId}/close`),
};
