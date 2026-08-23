import { api } from '@/lib/api-client';

export const settingsService = {
  listForProject: (projectId: string) => api.get(`/projects/${projectId}/settings`),
  upsertForProject: (projectId: string, key: string, value: unknown) =>
    api.post(`/projects/${projectId}/settings`, { key, value }),
};
