//frontend/src/types/site.ts
// Types du suivi de chantier : avancement, journal, achats, ouvriers, sous-traitance, qualite, documents.
// Les montants arrivent en chaines de caracteres (decimaux du serveur) ; les quantites aussi.

import type { Attachment } from '@/types/models';

export type SiteRole = 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR' | 'SITE_MANAGER' | 'ARCHITECT';
export type SupervisorPosition = 'SUPERVISOR' | 'SITE_MANAGER' | 'ARCHITECT';
export type ReviewStatus = 'PENDING' | 'VALIDATED' | 'REJECTED';
export type TechReviewStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type WorkStopReason = 'RAIN' | 'HOLIDAY' | 'MATERIAL_SHORTAGE' | 'EQUIPMENT_BREAKDOWN' | 'PAYMENT_DELAY' | 'SAFETY' | 'OTHER';
export type WeatherCondition = 'SUNNY' | 'CLOUDY' | 'RAIN' | 'HEAVY_RAIN' | 'WINDY';

// ---------------------------------------------------------------------------
// Avancement, planning, cout par etape
// ---------------------------------------------------------------------------

export interface PhaseProgress {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  progressPercent: number;
  budgetAmount: string | null;
}

export interface ProgressUpdate {
  id: string;
  projectId: string;
  phaseId: string;
  phaseName: string;
  percent: number;
  note: string | null;
  status: ReviewStatus;
  submittedById: string;
  submittedByName: string | null;
  decidedById?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
}

export interface ProgressOverview {
  projectId: string;
  progressPercent: number;
  phases: PhaseProgress[];
  pendingUpdates: ProgressUpdate[];
}

export type ScheduleStatus = 'DONE' | 'LATE' | 'AT_RISK' | 'ON_TRACK' | 'NOT_STARTED' | 'UNPLANNED';

export interface PlanningPhase {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPercent: number;
  status: ScheduleStatus;
  expectedPercent: number | null;
  delayDays: number;
}

export interface Planning {
  projectId: string;
  today: string;
  startDate: string | null;
  plannedEndDate: string | null;
  projectedEndDate: string | null;
  projectDelayDays: number;
  progressPercent: number;
  lateCount: number;
  atRiskCount: number;
  phases: PlanningPhase[];
  stopReasons: { reason: WorkStopReason | 'UNSPECIFIED'; days: number }[];
  stoppedDays: number;
}

export interface PhaseCost {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  progressPercent: number;
  budgetAmount: string | null;
  spent: string;
  pending: string;
  committed: string;
  remaining: string | null;
  usedPercent: number | null;
  overBudget: boolean;
  forecast: string | null;
  forecastVariance: string | null;
  forecastOverBudget: boolean;
}

export interface PhaseCosts {
  currency: string;
  projectBudget: string;
  progressPercent: number;
  totals: { phaseBudgets: string; unallocatedBudget: string; spent: string; pending: string; committed: string };
  unallocated: { spent: string; pending: string };
  phases: PhaseCost[];
}

// ---------------------------------------------------------------------------
// Avenants
// ---------------------------------------------------------------------------

export type ChangeOrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ChangeOrder {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  extraCost: string;
  extraDays: number;
  phaseId: string | null;
  phaseName: string | null;
  status: ChangeOrderStatus;
  requestedById: string;
  requestedByName: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  appliedToBudget: boolean;
  createdAt: string;
}

export interface ChangeOrderList {
  items: ChangeOrder[];
  summary: { approvedCost: string; approvedDays: number; pendingCost: string; pendingCount: number };
}

export interface CreateChangeOrderPayload {
  title: string;
  description: string;
  extraCost: number;
  extraDays?: number;
  phaseId?: string;
}

// ---------------------------------------------------------------------------
// Journal de chantier
// ---------------------------------------------------------------------------

export interface SiteLog {
  id: string;
  projectId: string;
  date: string;
  title: string;
  content: string;
  weather: WeatherCondition | null;
  phaseId: string | null;
  phaseName: string | null;
  latitude: string | null;
  longitude: string | null;
  isOffSite: boolean;
  createdById: string;
  authorName: string | null;
  createdAt: string;
  attachments: Attachment[];
}

export interface CreateSiteLogPayload {
  date?: string;
  title: string;
  content: string;
  weather?: WeatherCondition;
  phaseId?: string;
  latitude?: number;
  longitude?: number;
  clientRef?: string;
}

// ---------------------------------------------------------------------------
// Qualite et reception
// ---------------------------------------------------------------------------

export type SnagSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type SnagStatus = 'OPEN' | 'FIXED' | 'CLOSED';
export type ReceptionType = 'PHASE' | 'PROVISIONAL' | 'FINAL';

export interface Snag {
  id: string;
  projectId: string;
  number: number;
  phaseId: string | null;
  phaseName: string | null;
  title: string;
  description: string | null;
  location: string | null;
  severity: SnagSeverity;
  status: SnagStatus;
  dueDate: string | null;
  overdue: boolean;
  raisedById: string;
  raisedByName: string | null;
  raisedAt: string;
  fixedByName: string | null;
  fixedAt: string | null;
  fixNote: string | null;
  closedByName: string | null;
  closedAt: string | null;
  closureNote: string | null;
  attachments: Attachment[];
}

export interface SnagList {
  items: Snag[];
  summary: { open: number; fixed: number; closed: number; overdue: number; criticalOpen: number };
}

export interface CreateSnagPayload {
  title: string;
  description?: string;
  location?: string;
  severity?: SnagSeverity;
  phaseId?: string;
  dueDate?: string;
  clientRef?: string;
}

export interface ReservesSnapshotItem {
  number: number;
  title: string;
  severity: string;
  status: string;
  location: string | null;
}

export interface Reception {
  id: string;
  projectId: string;
  number: number;
  type: ReceptionType;
  typeLabel: string;
  phaseId: string | null;
  phaseName: string | null;
  date: string;
  notes: string | null;
  attendees: string | null;
  reservesSnapshot: ReservesSnapshotItem[] | null;
  openSnagsCount: number;
  withReserves: boolean;
  signedAt: string | null;
  signerName: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateReceptionPayload {
  type: ReceptionType;
  phaseId?: string;
  date: string;
  notes?: string;
  attendees?: string;
}

// ---------------------------------------------------------------------------
// Fournisseurs, devis et marches
// ---------------------------------------------------------------------------

export type SupplierKind = 'SUPPLIER' | 'SUBCONTRACTOR';

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  trade: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierPayload {
  name: string;
  kind?: SupplierKind;
  trade?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  isActive?: boolean;
}

export type QuoteLotStatus = 'OPEN' | 'AWARDED' | 'CLOSED';
export type SupplierQuoteStatus = 'SUBMITTED' | 'SELECTED' | 'REJECTED';

export interface QuoteLotSummary {
  id: string;
  number: number;
  phaseId: string | null;
  phaseName: string | null;
  title: string;
  description: string | null;
  status: QuoteLotStatus;
  awardedQuoteId: string | null;
  estimatedAmount: string | null;
  itemCount: number;
  quoteCount: number;
  lowestQuote: string | null;
  createdAt: string;
}

export interface QuoteLotItem {
  id: string;
  position: number;
  label: string;
  unit: string;
  quantity: string;
  estimatedUnitPrice: string | null;
}

export interface QuoteLine {
  id: string;
  itemId: string | null;
  label: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

export interface SupplierQuote {
  id: string;
  lotId: string;
  supplierId: string;
  supplier: { id: string; name: string; trade: string | null };
  reference: string | null;
  validUntil: string | null;
  notes: string | null;
  totalAmount: string;
  status: SupplierQuoteStatus;
  lines: QuoteLine[];
}

export interface QuoteComparison {
  rows: {
    itemId: string;
    label: string;
    unit: string;
    quantity: string;
    estimatedTotal: string | null;
    cells: { quoteId: string; unitPrice: string | null; total: string | null; isLowest: boolean }[];
  }[];
  quotes: {
    quoteId: string;
    supplierName: string;
    totalAmount: string;
    pricedItems: number;
    complete: boolean;
    gapToEstimatePercent: number | null;
    gapToBestPercent: number | null;
  }[];
  bestQuoteId: string | null;
  estimatedAmount: string | null;
}

export interface QuoteLot extends Omit<QuoteLotSummary, 'itemCount' | 'quoteCount' | 'lowestQuote'> {
  items: QuoteLotItem[];
  quotes: SupplierQuote[];
  comparison: QuoteComparison;
}

export interface LotItemPayload {
  id?: string;
  label: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number;
}

export interface CreateLotPayload {
  title: string;
  description?: string;
  phaseId?: string;
  items: LotItemPayload[];
}

export interface QuoteLinePayload {
  itemId?: string;
  label?: string;
  unit?: string;
  quantity?: number;
  unitPrice: number;
}

export interface UpsertQuotePayload {
  supplierId: string;
  reference?: string;
  validUntil?: string;
  notes?: string;
  lines: QuoteLinePayload[];
}

export type ContractStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type StatementStatus = 'SUBMITTED' | 'VALIDATED' | 'REJECTED';
export type ContractPaymentType = 'ADVANCE' | 'STATEMENT' | 'RETENTION_RELEASE' | 'OTHER';

export interface ContractSummary {
  contractAmount: string;
  validatedWorks: string;
  remainingWorks: string;
  retentionHeld: string;
  retentionReleased: string;
  advancesPaid: string;
  advancesRecovered: string;
  advanceOutstanding: string;
  paidTotal: string;
  dueNow: string;
  remainingToPay: string;
  pendingStatements: number;
}

export interface ContractListItem {
  id: string;
  projectId: string;
  number: number;
  supplierId: string;
  phaseId: string | null;
  phaseName: string | null;
  title: string;
  description: string | null;
  amount: string;
  retentionPercent: string;
  signedAt: string | null;
  status: ContractStatus;
  summary: ContractSummary;
  statementCount: number;
  paymentCount: number;
  createdAt: string;
}

export interface ProgressStatement {
  id: string;
  number: number;
  periodEnd: string;
  cumulativeAmount: string;
  amountThisPeriod: string;
  retentionAmount: string;
  advanceRecovered: string;
  netPayable: string;
  status: StatementStatus;
  note: string | null;
  submittedByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  paid: string;
  createdAt: string;
  attachments: Attachment[];
}

export interface ContractPayment {
  id: string;
  statementId: string | null;
  type: ContractPaymentType;
  amount: string;
  date: string;
  reference: string | null;
  note: string | null;
  expenseId: string | null;
  expenseStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | null;
  recordedByName: string | null;
  attachments: Attachment[];
}

export interface Contract extends Omit<ContractListItem, 'statementCount' | 'paymentCount'> {
  supplier: { id: string; name: string; trade: string | null; phone: string | null };
  statements: ProgressStatement[];
  payments: ContractPayment[];
}

export interface CreateContractPayload {
  supplierId: string;
  title: string;
  description?: string;
  amount: number;
  retentionPercent?: number;
  phaseId?: string;
  signedAt?: string;
}

export interface SubmitStatementPayload {
  periodEnd: string;
  cumulativeAmount: number;
  advanceRecovered?: number;
  note?: string;
}

export interface RecordContractPaymentPayload {
  type: ContractPaymentType;
  amount: number;
  categoryId: string;
  date?: string;
  statementId?: string;
  reference?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
  clientRef?: string;
}

// ---------------------------------------------------------------------------
// Achats, livraisons, stock
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus = 'ORDERED' | 'PARTIAL' | 'DELIVERED' | 'CANCELLED';
export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'LOSS';

export interface PurchaseOrderLine {
  id: string;
  position: number;
  label: string;
  unit: string;
  quantityOrdered: string;
  unitPrice: string | null;
  quantityDelivered: string;
  quantityRemaining: string;
}

export interface PurchaseOrder {
  id: string;
  projectId: string;
  number: number;
  supplierId: string | null;
  supplierName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  reference: string | null;
  orderDate: string;
  expectedDate: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  total: string | null;
  lines: PurchaseOrderLine[];
  createdAt: string;
}

export interface CreateOrderPayload {
  supplierId?: string;
  supplierName?: string;
  phaseId?: string;
  reference?: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  lines: { label: string; unit: string; quantityOrdered: number; unitPrice?: number }[];
}

export interface DeliveryLine {
  id: string;
  orderLineId: string | null;
  stockItemId: string;
  label: string;
  unit: string;
  quantityReceived: string;
  quantityRefused: string;
  note: string | null;
}

export interface Delivery {
  id: string;
  projectId: string;
  orderId: string | null;
  orderNumber: number | null;
  supplierId: string | null;
  supplierName: string | null;
  noteReference: string | null;
  date: string;
  notes: string | null;
  latitude: string | null;
  longitude: string | null;
  isOffSite: boolean;
  receivedByName: string | null;
  hasRefusals: boolean;
  lines: DeliveryLine[];
  attachments: Attachment[];
  createdAt: string;
}

export interface CreateDeliveryPayload {
  orderId?: string;
  supplierId?: string;
  supplierName?: string;
  noteReference?: string;
  date?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  clientRef?: string;
  lines: { orderLineId?: string; label?: string; unit?: string; quantityReceived: number; quantityRefused?: number; note?: string }[];
}

export interface StockItem {
  id: string;
  projectId: string;
  name: string;
  unit: string;
  minQuantity: string | null;
  quantity: string;
  totalIn: string;
  totalConsumed: string;
  totalLost: string;
  isLow: boolean;
}

export interface StockMovement {
  id: string;
  stockItemId: string;
  itemName: string;
  unit: string;
  type: StockMovementType;
  quantity: string;
  phaseId: string | null;
  phaseName: string | null;
  date: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface StockMovementPayload {
  type: 'OUT' | 'LOSS' | 'ADJUSTMENT';
  quantity: number;
  phaseId?: string;
  date?: string;
  note?: string;
  clientRef?: string;
}

export interface StockConsumptionPhase {
  phaseId: string | null;
  phaseName: string;
  items: { stockItemId: string; name: string; unit: string; consumed: string; lost: string }[];
}

// ---------------------------------------------------------------------------
// Ouvriers, presences, avances, paie
// ---------------------------------------------------------------------------

export interface Worker {
  id: string;
  projectId: string;
  fullName: string;
  trade: string | null;
  dailyRate: string | null;
  phone: string | null;
  isActive: boolean;
  startedAt: string | null;
  leftAt: string | null;
  notes: string | null;
  advanceBalance: string;
  totalDays: string;
}

export interface WorkerPayload {
  fullName?: string;
  trade?: string;
  dailyRate?: number;
  phone?: string;
  startedAt?: string;
  leftAt?: string;
  isActive?: boolean;
  notes?: string;
}

export interface PresenceDay {
  date: string;
  entries: { workerId: string; fraction: string; phaseId: string | null }[];
  totalDays: string;
}

export interface SetPresencesPayload {
  date: string;
  entries: { workerId: string; fraction: 0 | 0.5 | 1; phaseId?: string }[];
}

export interface WorkerAdvance {
  id: string;
  workerId: string;
  amount: string;
  date: string;
  note: string | null;
  createdAt: string;
}

export type PayRunStatus = 'DRAFT' | 'SUBMITTED';

export interface PayRunLine {
  id: string;
  workerId: string;
  workerName: string;
  trade: string | null;
  daysWorked: string;
  dailyRate: string;
  grossAmount: string;
  advanceDeducted: string;
  netAmount: string;
  note: string | null;
}

export interface PayRun {
  id: string;
  projectId: string;
  number: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  categoryId: string | null;
  totalGross: string;
  totalAdvance: string;
  totalNet: string;
  expenseId: string | null;
  expenseStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | null;
  submittedAt: string | null;
  lines: PayRunLine[];
  createdAt: string;
}

export interface PayLineEdit {
  workerId: string;
  daysWorked?: number;
  dailyRate?: number;
  taskAmount?: number;
  advanceDeducted?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Documents reglementaires, rapport mensuel, devises, notifications
// ---------------------------------------------------------------------------

export type ProjectDocumentType = 'PERMIT' | 'PLAN' | 'CONTRACT' | 'INSURANCE' | 'WARRANTY' | 'TAX' | 'OTHER';
export type DocumentExpiryStatus = 'NO_EXPIRY' | 'VALID' | 'EXPIRING' | 'EXPIRED';

export interface ProjectDocument {
  id: string;
  projectId: string;
  type: ProjectDocumentType;
  title: string;
  reference: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  status: DocumentExpiryStatus;
  daysLeft: number | null;
  attachments: Attachment[];
  createdAt: string;
}

export interface ProjectDocumentPayload {
  type?: ProjectDocumentType;
  title?: string;
  reference?: string;
  issuedAt?: string;
  expiresAt?: string;
  notes?: string;
}

export interface MonthlyReport {
  projectId: string;
  projectName: string;
  clientName: string;
  currency: string;
  month: string;
  monthLabel: string;
  generatedAt: string;
  finance: {
    depositsAmount: string;
    depositsCount: number;
    expensesAmount: string;
    expensesCount: number;
    pendingExpenses: number;
    balance: string;
    totalDeposited: string;
    totalSpent: string;
    budget: string;
    budgetConsumedPercent: number;
    topCategories: { name: string; amount: string }[];
  };
  attendance: { workedDays: number; workerDays: number; unrecordedDays: number; attendanceRate: number; namedWorkerDays: number; stopReasons: { reason: string; label: string; days: number }[] };
  progress: { percent: number; delayDays: number; plannedEndDate: string | null; projectedEndDate: string | null; phases: { name: string; percent: number; status: ScheduleStatus; delayDays: number }[] };
  quality: { openSnags: number; snagsRaised: number };
  changeOrders: { number: number; title: string; extraCost: string; extraDays: number }[];
  contracts: { count: number; amount: string };
}

export interface CurrencyBucket {
  originalCurrency: string;
  count: number;
  sentOriginal: string;
  fees: string;
  credited: string;
  averageEffectiveRate: string;
  minRate: string;
  maxRate: string;
}

export interface CurrencySummary {
  projectCurrency: string | null;
  currencies: CurrencyBucket[];
}

export interface NotificationPreferences {
  messagingPhone: string | null;
  whatsappOptIn: boolean;
  smsOptIn: boolean;
  whatsappAvailable: boolean;
  smsAvailable: boolean;
}
