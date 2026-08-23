import { api } from '@/lib/api-client';
import type { NotificationItem, PaginatedResponse } from '@/types/models';

export const notificationsService = {
  list: (page = 1, limit = 20) => api.get<PaginatedResponse<NotificationItem>>(`/notifications?page=${page}&limit=${limit}`),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
};
