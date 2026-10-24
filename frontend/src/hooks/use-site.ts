//frontend/src/hooks/use-site.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { siteService } from '@/services/site.service';
import { ApiError } from '@/lib/api-client';
import { sitePermissions } from '@/lib/site-access';
import { useProject } from '@/hooks/use-projects';
import type { ChangeOrderStatus, SnagStatus, SupplierKind } from '@/types/site';

export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Droits de l'utilisateur connecte sur ce chantier. */
export function useSitePermissions(projectId: string) {
  const { data: project } = useProject(projectId);
  return sitePermissions(project?.siteRole);
}

const key = (projectId: string, ...rest: unknown[]) => ['site', projectId, ...rest] as const;

// ---- Lectures ---------------------------------------------------------------
export const useProgress = (projectId: string) => useQuery({ queryKey: key(projectId, 'progress'), queryFn: () => siteService.progress(projectId), enabled: !!projectId });
export const useProgressHistory = (projectId: string, phaseId?: string) =>
  useQuery({ queryKey: key(projectId, 'progress-history', phaseId ?? 'all'), queryFn: () => siteService.progressHistory(projectId, { phaseId }), enabled: !!projectId });
export const usePlanning = (projectId: string) => useQuery({ queryKey: key(projectId, 'planning'), queryFn: () => siteService.planning(projectId), enabled: !!projectId });
export const usePhaseCosts = (projectId: string) => useQuery({ queryKey: key(projectId, 'phase-costs'), queryFn: () => siteService.phaseCosts(projectId), enabled: !!projectId });
export const useChangeOrders = (projectId: string, status?: ChangeOrderStatus) =>
  useQuery({ queryKey: key(projectId, 'change-orders', status ?? 'all'), queryFn: () => siteService.changeOrders(projectId, status), enabled: !!projectId });
export const useSiteLogs = (projectId: string, filters: { page?: number; phaseId?: string; search?: string } = {}) =>
  useQuery({ queryKey: key(projectId, 'site-logs', filters), queryFn: () => siteService.siteLogs(projectId, { limit: 15, ...filters }), enabled: !!projectId });
export const useSnags = (projectId: string, filters: { status?: SnagStatus; phaseId?: string } = {}) =>
  useQuery({ queryKey: key(projectId, 'snags', filters), queryFn: () => siteService.snags(projectId, filters), enabled: !!projectId });
export const useReceptions = (projectId: string) => useQuery({ queryKey: key(projectId, 'receptions'), queryFn: () => siteService.receptions(projectId), enabled: !!projectId });
export const useSuppliers = (projectId: string, kind?: SupplierKind, includeInactive = false) =>
  useQuery({ queryKey: key(projectId, 'suppliers', kind ?? 'all', includeInactive), queryFn: () => siteService.suppliers(projectId, { kind, includeInactive }), enabled: !!projectId });
export const useQuoteLots = (projectId: string) => useQuery({ queryKey: key(projectId, 'quote-lots'), queryFn: () => siteService.quoteLots(projectId), enabled: !!projectId });
export const useQuoteLot = (projectId: string, id: string | null) => useQuery({ queryKey: key(projectId, 'quote-lot', id), queryFn: () => siteService.quoteLot(projectId, id!), enabled: !!projectId && !!id });
export const useContracts = (projectId: string) => useQuery({ queryKey: key(projectId, 'contracts'), queryFn: () => siteService.contracts(projectId), enabled: !!projectId });
export const useContract = (projectId: string, id: string | null) => useQuery({ queryKey: key(projectId, 'contract', id), queryFn: () => siteService.contract(projectId, id!), enabled: !!projectId && !!id });
export const useOrders = (projectId: string) => useQuery({ queryKey: key(projectId, 'orders'), queryFn: () => siteService.orders(projectId), enabled: !!projectId });
export const useDeliveries = (projectId: string) => useQuery({ queryKey: key(projectId, 'deliveries'), queryFn: () => siteService.deliveries(projectId), enabled: !!projectId });
export const useStockItems = (projectId: string) => useQuery({ queryKey: key(projectId, 'stock-items'), queryFn: () => siteService.stockItems(projectId), enabled: !!projectId });
export const useStockMovements = (projectId: string, stockItemId?: string) =>
  useQuery({ queryKey: key(projectId, 'stock-movements', stockItemId ?? 'all'), queryFn: () => siteService.stockMovements(projectId, { stockItemId }), enabled: !!projectId });
export const useStockConsumption = (projectId: string) => useQuery({ queryKey: key(projectId, 'stock-consumption'), queryFn: () => siteService.stockConsumption(projectId), enabled: !!projectId });
export const useWorkers = (projectId: string, includeInactive = false) =>
  useQuery({ queryKey: key(projectId, 'workers', includeInactive), queryFn: () => siteService.workers(projectId, includeInactive), enabled: !!projectId });
export const usePresences = (projectId: string, from: string, to: string) =>
  useQuery({ queryKey: key(projectId, 'presences', from, to), queryFn: () => siteService.presences(projectId, from, to), enabled: !!projectId });
export const useAdvances = (projectId: string, workerId: string | null) =>
  useQuery({ queryKey: key(projectId, 'advances', workerId), queryFn: () => siteService.advances(projectId, workerId!), enabled: !!projectId && !!workerId });
export const usePayRuns = (projectId: string) => useQuery({ queryKey: key(projectId, 'pay-runs'), queryFn: () => siteService.payRuns(projectId), enabled: !!projectId });
export const usePayRun = (projectId: string, id: string | null) => useQuery({ queryKey: key(projectId, 'pay-run', id), queryFn: () => siteService.payRun(projectId, id!), enabled: !!projectId && !!id });
export const useProjectDocuments = (projectId: string) => useQuery({ queryKey: key(projectId, 'documents'), queryFn: () => siteService.documents(projectId), enabled: !!projectId });
export const useMonthlyReport = (projectId: string, month: string) => useQuery({ queryKey: key(projectId, 'monthly-report', month), queryFn: () => siteService.monthlyReport(projectId, month), enabled: !!projectId });
export const useCurrencySummary = (projectId: string) => useQuery({ queryKey: key(projectId, 'currency-summary'), queryFn: () => siteService.currencySummary(projectId), enabled: !!projectId });
export const useNotificationPreferences = () => useQuery({ queryKey: ['notification-preferences'], queryFn: () => siteService.notificationPreferences() });

// ---- Ecritures --------------------------------------------------------------
/**
 * Mutation standard du suivi de chantier : toast de succes/echec, puis rafraichissement de tout ce qui depend du chantier
 * (une depense creee par une paie ou un marche change aussi le solde, les couts par etape, etc.).
 */
export function useSiteMutation<TVars, TData>(projectId: string, fn: (vars: TVars) => Promise<TData>, messages: { success?: string | ((data: TData) => string); error: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['site', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['attachments'] });
      const text = typeof messages.success === 'function' ? messages.success(data) : messages.success;
      if (text) toast.success(text);
    },
    onError: (error) => toast.error(errorText(error, messages.error)),
  });
}
