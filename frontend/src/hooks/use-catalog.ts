'use client';

import { useQuery } from '@tanstack/react-query';
import { catalogService } from '@/services/catalog.service';

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['categories', includeInactive],
    queryFn: () => catalogService.categories.list(includeInactive),
  });
}

export function useMaterials(categoryId?: string, includeInactive = false) {
  return useQuery({
    queryKey: ['materials', categoryId, includeInactive],
    queryFn: () => catalogService.materials.list(categoryId, includeInactive),
  });
}

export function useUnits(includeInactive = false) {
  return useQuery({
    queryKey: ['units', includeInactive],
    queryFn: () => catalogService.units.list(includeInactive),
  });
}
