//frontend/src/services/audit.service.ts
import { api } from '@/lib/api-client';
import type { AuditLogEntry, PaginatedResponse } from '@/types/models';

export interface AuditFilters {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export const auditService = {
  list: (filters: AuditFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
    return api.get<PaginatedResponse<AuditLogEntry>>(`/audit-logs?${params.toString()}`);
  },
};
