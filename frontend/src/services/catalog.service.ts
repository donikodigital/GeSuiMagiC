import { api } from '@/lib/api-client';
import type { ExpenseCategory, Material, Unit } from '@/types/models';

export const catalogService = {
  categories: {
    list: (includeInactive = false) => api.get<ExpenseCategory[]>(`/categories?includeInactive=${includeInactive}`),
    create: (payload: { name: string; group?: string }) => api.post<ExpenseCategory>('/categories', payload),
    update: (id: string, payload: { name?: string; group?: string }) => api.patch<ExpenseCategory>(`/categories/${id}`, payload),
    deactivate: (id: string) => api.patch<ExpenseCategory>(`/categories/${id}/deactivate`),
    reactivate: (id: string) => api.patch<ExpenseCategory>(`/categories/${id}/reactivate`),
  },
  materials: {
    list: (categoryId?: string, includeInactive = false) =>
      api.get<Material[]>(`/materials?includeInactive=${includeInactive}${categoryId ? `&categoryId=${categoryId}` : ''}`),
    create: (payload: { name: string; categoryId: string; defaultUnitId?: string }) => api.post<Material>('/materials', payload),
    update: (id: string, payload: { name?: string; categoryId?: string; defaultUnitId?: string }) =>
      api.patch<Material>(`/materials/${id}`, payload),
    deactivate: (id: string) => api.patch<Material>(`/materials/${id}/deactivate`),
    reactivate: (id: string) => api.patch<Material>(`/materials/${id}/reactivate`),
  },
  units: {
    list: (includeInactive = false) => api.get<Unit[]>(`/units?includeInactive=${includeInactive}`),
    create: (payload: { name: string; symbol?: string }) => api.post<Unit>('/units', payload),
    deactivate: (id: string) => api.patch<Unit>(`/units/${id}/deactivate`),
    reactivate: (id: string) => api.patch<Unit>(`/units/${id}/reactivate`),
  },
};
