//frontend/src/services/site.service.ts
import { api, downloadFile } from '@/lib/api-client';
import type { PaginatedResponse } from '@/types/models';
import type {
  ChangeOrder,
  ChangeOrderList,
  ChangeOrderStatus,
  Contract,
  ContractListItem,
  CreateChangeOrderPayload,
  CreateContractPayload,
  CreateDeliveryPayload,
  CreateLotPayload,
  CreateOrderPayload,
  CreateReceptionPayload,
  CreateSiteLogPayload,
  CreateSnagPayload,
  CurrencySummary,
  Delivery,
  MonthlyReport,
  NotificationPreferences,
  PayLineEdit,
  PayRun,
  Planning,
  PhaseCosts,
  PresenceDay,
  ProgressOverview,
  ProgressUpdate,
  ProjectDocument,
  ProjectDocumentPayload,
  PurchaseOrder,
  QuoteLot,
  QuoteLotSummary,
  RecordContractPaymentPayload,
  Reception,
  SetPresencesPayload,
  SiteLog,
  Snag,
  SnagList,
  SnagStatus,
  StockConsumptionPhase,
  StockItem,
  StockMovement,
  StockMovementPayload,
  SubmitStatementPayload,
  Supplier,
  SupplierKind,
  SupplierPayload,
  UpsertQuotePayload,
  Worker,
  WorkerAdvance,
  WorkerPayload,
} from '@/types/site';
import type { Expense } from '@/types/models';

const p = (projectId: string) => `/projects/${projectId}`;

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const siteService = {
  // ---- Avancement, planning, cout par etape ------------------------------
  progress: (projectId: string) => api.get<ProgressOverview>(`${p(projectId)}/progress`),
  progressHistory: (projectId: string, filters: { phaseId?: string; status?: string } = {}) => api.get<ProgressUpdate[]>(`${p(projectId)}/progress/updates${query(filters)}`),
  submitProgress: (projectId: string, payload: { phaseId: string; percent: number; note?: string; clientRef?: string }) => api.post<ProgressUpdate>(`${p(projectId)}/progress`, payload),
  decideProgress: (projectId: string, updateId: string, payload: { decision: 'VALIDATED' | 'REJECTED'; note?: string }) =>
    api.post<ProgressUpdate>(`${p(projectId)}/progress/updates/${updateId}/decision`, payload),
  planning: (projectId: string) => api.get<Planning>(`${p(projectId)}/planning`),
  phaseCosts: (projectId: string) => api.get<PhaseCosts>(`${p(projectId)}/phase-costs`),

  // ---- Avenants ------------------------------------------------------------
  changeOrders: (projectId: string, status?: ChangeOrderStatus) => api.get<ChangeOrderList>(`${p(projectId)}/change-orders${query({ status })}`),
  createChangeOrder: (projectId: string, payload: CreateChangeOrderPayload) => api.post<ChangeOrder>(`${p(projectId)}/change-orders`, payload),
  decideChangeOrder: (projectId: string, id: string, payload: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
    api.post<ChangeOrder>(`${p(projectId)}/change-orders/${id}/decision`, payload),
  cancelChangeOrder: (projectId: string, id: string, reason: string) => api.post<ChangeOrder>(`${p(projectId)}/change-orders/${id}/cancel`, { reason }),

  // ---- Journal de chantier -------------------------------------------------
  siteLogs: (projectId: string, filters: { page?: number; limit?: number; phaseId?: string; from?: string; to?: string; search?: string } = {}) =>
    api.get<PaginatedResponse<SiteLog>>(`${p(projectId)}/site-logs${query(filters)}`),
  updateSiteLog: (projectId: string, id: string, payload: { title?: string; content?: string; weather?: string; phaseId?: string | null }) => api.patch<SiteLog>(`${p(projectId)}/site-logs/${id}`, payload),
  deleteSiteLog: (projectId: string, id: string) => api.delete(`${p(projectId)}/site-logs/${id}`),

  // ---- Qualite et reception ------------------------------------------------
  snags: (projectId: string, filters: { status?: SnagStatus; severity?: string; phaseId?: string } = {}) => api.get<SnagList>(`${p(projectId)}/snags${query(filters)}`),
  transitionSnag: (projectId: string, id: string, payload: { to: SnagStatus; note?: string }) => api.post<Snag>(`${p(projectId)}/snags/${id}/transition`, payload),
  receptions: (projectId: string) => api.get<Reception[]>(`${p(projectId)}/receptions`),
  createReception: (projectId: string, payload: CreateReceptionPayload) => api.post<Reception>(`${p(projectId)}/receptions`, payload),
  signReception: (projectId: string, id: string) => api.post<Reception>(`${p(projectId)}/receptions/${id}/sign`),
  receptionPdf: (projectId: string, id: string, number: number) => downloadFile(`${p(projectId)}/receptions/${id}/pdf`, `pv-reception-${number}.pdf`),

  // ---- Fournisseurs et sous-traitants --------------------------------------
  suppliers: (projectId: string, filters: { kind?: SupplierKind; includeInactive?: boolean; search?: string } = {}) => api.get<Supplier[]>(`${p(projectId)}/suppliers${query(filters)}`),
  createSupplier: (projectId: string, payload: SupplierPayload) => api.post<Supplier>(`${p(projectId)}/suppliers`, payload),
  updateSupplier: (projectId: string, id: string, payload: Partial<SupplierPayload>) => api.patch<Supplier>(`${p(projectId)}/suppliers/${id}`, payload),

  // ---- Devis et metres -----------------------------------------------------
  quoteLots: (projectId: string) => api.get<QuoteLotSummary[]>(`${p(projectId)}/quote-lots`),
  quoteLot: (projectId: string, id: string) => api.get<QuoteLot>(`${p(projectId)}/quote-lots/${id}`),
  createQuoteLot: (projectId: string, payload: CreateLotPayload) => api.post<QuoteLot>(`${p(projectId)}/quote-lots`, payload),
  upsertQuote: (projectId: string, lotId: string, payload: UpsertQuotePayload) => api.put<QuoteLot>(`${p(projectId)}/quote-lots/${lotId}/quotes`, payload),
  deleteQuote: (projectId: string, lotId: string, quoteId: string) => api.delete<QuoteLot>(`${p(projectId)}/quote-lots/${lotId}/quotes/${quoteId}`),
  awardLot: (projectId: string, lotId: string, payload: { quoteId: string; createContract?: { retentionPercent?: number } }) => api.post<QuoteLot>(`${p(projectId)}/quote-lots/${lotId}/award`, payload),
  closeLot: (projectId: string, lotId: string) => api.post<QuoteLot>(`${p(projectId)}/quote-lots/${lotId}/close`),

  // ---- Marches, situations, paiements --------------------------------------
  contracts: (projectId: string) => api.get<ContractListItem[]>(`${p(projectId)}/contracts`),
  contract: (projectId: string, id: string) => api.get<Contract>(`${p(projectId)}/contracts/${id}`),
  createContract: (projectId: string, payload: CreateContractPayload) => api.post<Contract>(`${p(projectId)}/contracts`, payload),
  completeContract: (projectId: string, id: string) => api.post<Contract>(`${p(projectId)}/contracts/${id}/complete`),
  cancelContract: (projectId: string, id: string, reason: string) => api.post<Contract>(`${p(projectId)}/contracts/${id}/cancel`, { reason }),
  submitStatement: (projectId: string, id: string, payload: SubmitStatementPayload) => api.post<Contract>(`${p(projectId)}/contracts/${id}/statements`, payload),
  decideStatement: (projectId: string, id: string, statementId: string, payload: { decision: 'VALIDATED' | 'REJECTED'; note?: string }) =>
    api.post<Contract>(`${p(projectId)}/contracts/${id}/statements/${statementId}/decision`, payload),

  // ---- Achats, livraisons, stock -------------------------------------------
  orders: (projectId: string, status?: string) => api.get<PurchaseOrder[]>(`${p(projectId)}/purchase-orders${query({ status })}`),
  createOrder: (projectId: string, payload: CreateOrderPayload) => api.post<PurchaseOrder>(`${p(projectId)}/purchase-orders`, payload),
  cancelOrder: (projectId: string, id: string, reason: string) => api.post<PurchaseOrder>(`${p(projectId)}/purchase-orders/${id}/cancel`, { reason }),
  deliveries: (projectId: string) => api.get<Delivery[]>(`${p(projectId)}/deliveries`),
  stockItems: (projectId: string) => api.get<StockItem[]>(`${p(projectId)}/stock/items`),
  createStockItem: (projectId: string, payload: { name: string; unit: string; minQuantity?: number }) => api.post<StockItem>(`${p(projectId)}/stock/items`, payload),
  updateStockItem: (projectId: string, itemId: string, payload: { minQuantity: number | null }) => api.patch<StockItem>(`${p(projectId)}/stock/items/${itemId}`, payload),
  stockMovements: (projectId: string, filters: { stockItemId?: string; phaseId?: string; type?: string } = {}) => api.get<StockMovement[]>(`${p(projectId)}/stock/movements${query(filters)}`),
  stockConsumption: (projectId: string) => api.get<StockConsumptionPhase[]>(`${p(projectId)}/stock/consumption`),

  // ---- Ouvriers, presences, avances, paie ----------------------------------
  workers: (projectId: string, includeInactive = false) => api.get<Worker[]>(`${p(projectId)}/workers${query({ includeInactive: includeInactive || undefined })}`),
  createWorker: (projectId: string, payload: WorkerPayload) => api.post<Worker>(`${p(projectId)}/workers`, payload),
  updateWorker: (projectId: string, id: string, payload: WorkerPayload) => api.patch<Worker>(`${p(projectId)}/workers/${id}`, payload),
  presences: (projectId: string, from: string, to: string) => api.get<PresenceDay[]>(`${p(projectId)}/worker-presences${query({ from, to })}`),
  advances: (projectId: string, workerId: string) => api.get<WorkerAdvance[]>(`${p(projectId)}/workers/${workerId}/advances`),
  createAdvance: (projectId: string, workerId: string, payload: { amount: number; date?: string; note?: string }) => api.post<WorkerAdvance>(`${p(projectId)}/workers/${workerId}/advances`, payload),
  payRuns: (projectId: string) => api.get<PayRun[]>(`${p(projectId)}/pay-runs`),
  payRun: (projectId: string, id: string) => api.get<PayRun>(`${p(projectId)}/pay-runs/${id}`),
  createPayRun: (projectId: string, payload: { label: string; periodStart: string; periodEnd: string }) => api.post<PayRun>(`${p(projectId)}/pay-runs`, payload),
  editPayRunLines: (projectId: string, id: string, lines: PayLineEdit[]) => api.put<PayRun>(`${p(projectId)}/pay-runs/${id}/lines`, { lines }),
  submitPayRun: (projectId: string, id: string, payload: { categoryId: string; note?: string; clientRef?: string }) => api.post<PayRun>(`${p(projectId)}/pay-runs/${id}/submit`, payload),
  deletePayRun: (projectId: string, id: string) => api.delete(`${p(projectId)}/pay-runs/${id}`),

  // ---- Documents reglementaires et rapport mensuel -------------------------
  documents: (projectId: string) => api.get<ProjectDocument[]>(`${p(projectId)}/documents`),
  createDocument: (projectId: string, payload: ProjectDocumentPayload) => api.post<ProjectDocument>(`${p(projectId)}/documents`, payload),
  updateDocument: (projectId: string, id: string, payload: ProjectDocumentPayload) => api.patch<ProjectDocument>(`${p(projectId)}/documents/${id}`, payload),
  monthlyReport: (projectId: string, month?: string) => api.get<MonthlyReport>(`${p(projectId)}/monthly-report${query({ month })}`),
  monthlyReportPdf: (projectId: string, month: string, projectName: string) => downloadFile(`${p(projectId)}/monthly-report/pdf${query({ month })}`, `rapport-mensuel-${projectName}-${month}.pdf`),

  // ---- Depenses : validation technique et imputation -----------------------
  techReview: (expenseId: string, payload: { decision: 'APPROVED' | 'REJECTED'; note?: string }) => api.post<Expense>(`/expenses/${expenseId}/technical-review`, payload),
  allocateExpense: (expenseId: string, payload: { phaseId?: string | null; supplierId?: string | null }) => api.patch<Expense>(`/expenses/${expenseId}/allocation`, payload),

  // ---- Devises des depots --------------------------------------------------
  currencySummary: (projectId: string) => api.get<CurrencySummary>(`${p(projectId)}/deposits/currency-summary`),

  // ---- Preferences WhatsApp / SMS -----------------------------------------
  notificationPreferences: () => api.get<NotificationPreferences>('/notifications/preferences'),
  updateNotificationPreferences: (payload: { messagingPhone?: string | null; whatsappOptIn?: boolean; smsOptIn?: boolean }) => api.patch<NotificationPreferences>('/notifications/preferences', payload),
  sendTestMessage: (channel: 'WHATSAPP' | 'SMS') => api.post<{ sent: boolean }>('/notifications/preferences/test', { channel }),
};
