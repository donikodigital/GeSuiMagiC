//frontend/src/types/models.ts
// ============================================================================
// Types partages - miroir des enums/entites Prisma du backend.
// Toute modification du schema backend doit se refleter ici.
// ============================================================================

export type UserRole = 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export type ProjectStatus = 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'ARCHIVED';

export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'OTHER';

export type ExpenseStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ExpensePaymentStatus = 'PAID_FULL' | 'PARTIAL' | 'CREDIT';

export type AnomalyStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';

export type MessageType = 'MODIFICATION_REQUEST' | 'DELETION_REQUEST' | 'ARCHIVE_REQUEST' | 'OTHER' | 'BROADCAST';
export type MessageStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface ClientProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  profession?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  isActive: boolean;
  createdAt: string;
  user?: { email: string; status: UserStatus; lastLoginAt?: string | null };
  _count?: { projects: number; supervisors: number };
}

export interface SupervisorProfile {
  id: string;
  userId: string;
  clientId: string;
  firstName: string;
  lastName: string;
  address?: string | null;
  profession?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  user?: { email: string; status: UserStatus; lastLoginAt?: string | null };
  projectAssignments?: { project: { id: string; name: string; status?: ProjectStatus } }[];
}

export interface Wallet {
  id: string;
  projectId: string;
  totalDeposited: string;
  totalSpent: string;
  balance: string;
  currency: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  motif?: string | null;
  constructionType?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  surfaceArea?: string | null;
  roomCount?: number | null;
  projectType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimatedDurationDays?: number | null;
  estimatedCost?: string | null;
  budget: string;
  currency: string;
  status: ProjectStatus;
  autoApproveExpenses: boolean;
  expenseApprovalThreshold: string;
  progressPercent: number;
  /** Position GPS du chantier et rayon (m) de controle de presence des saisies geolocalisees. */
  siteLatitude?: string | null;
  siteLongitude?: string | null;
  geoFenceMeters?: number;
  /** Au-dela de ces montants : justificatif obligatoire / validation technique prealable. */
  receiptRequiredAbove?: string | null;
  technicalReviewAbove?: string | null;
  /** Fonction de l'utilisateur connecte sur CE chantier. */
  siteRole?: 'SUPERADMIN' | 'CLIENT' | 'SUPERVISOR' | 'SITE_MANAGER' | 'ARCHITECT' | null;
  createdAt: string;
  wallet?: Wallet;
  client?: { id: string; firstName: string; lastName: string; phone?: string | null };
  supervisors?: { position?: 'SUPERVISOR' | 'SITE_MANAGER' | 'ARCHITECT'; supervisor: SupervisorProfile }[];
}

export interface FinancialSummary {
  projectName: string;
  currency: string;
  budget: string;
  totalDeposited: string;
  totalSpent: string;
  balance: string;
  budgetUsedPercent: number;
  pendingDepositsAmount: string;
  pendingDepositsCount: number;
  pendingExpensesAmount: string;
  pendingExpensesCount: number;
}

export interface Deposit {
  id: string;
  projectId: string;
  clientId: string;
  supervisorId: string;
  amount: string;
  currency: string;
  date: string;
  motif?: string | null;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  observation?: string | null;
  status: DepositStatus;
  /** Depot envoye dans une autre devise : montant d'origine, taux applique et frais de transfert. */
  originalAmount?: string | null;
  originalCurrency?: string | null;
  exchangeRate?: string | null;
  transferFees?: string | null;
  /** Analyse du change calculee par le serveur pour un depot envoye de l'etranger. */
  foreign?: { expectedAmount: string; gapPercent: number; totalPaidOriginal: string; effectiveRate: string; feesPercent: number } | null;
  rejectionReason?: string | null;
  isLocked: boolean;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  supervisor?: { firstName: string; lastName: string };
  attachments?: Attachment[];
}

/** ownerClientId : null/absent = entree globale du catalogue ; sinon entree privee d'un client. */
export interface ExpenseCategory {
  id: string;
  name: string;
  group?: string | null;
  isActive: boolean;
  ownerClientId?: string | null;
}

export interface Material {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  ownerClientId?: string | null;
  category?: ExpenseCategory;
  defaultUnit?: Unit | null;
}

export interface Unit {
  id: string;
  name: string;
  symbol?: string | null;
  isActive: boolean;
  ownerClientId?: string | null;
}

export interface Expense {
  id: string;
  projectId: string;
  supervisorId: string;
  date: string;
  categoryId: string;
  materialId?: string | null;
  label: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  observation?: string | null;
  supplier?: string | null;
  invoiceReference?: string | null;
  phaseId?: string | null;
  supplierId?: string | null;
  contractId?: string | null;
  /** Validation technique prealable (conducteur de travaux / architecte) au-dessus du seuil du projet. */
  techReviewStatus?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  techReviewedAt?: string | null;
  techReviewNote?: string | null;
  /** Justificatif obligatoire (montant au-dessus du seuil du projet) et present ou non. */
  receiptRequired?: boolean;
  hasReceipt?: boolean;
  latitude?: string | null;
  longitude?: string | null;
  isOffSite?: boolean;
  status: ExpenseStatus;
  rejectionReason?: string | null;
  paymentStatus: ExpensePaymentStatus;
  amountPaidToSupplier: string;
  balanceDueToSupplier?: string;
  isLocked: boolean;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  category?: ExpenseCategory;
  material?: Material | null;
  supervisor?: { firstName: string; lastName: string };
  attachments?: Attachment[];
}

export interface Budget {
  id: string;
  projectId: string;
  categoryId: string;
  amount: string;
  category?: ExpenseCategory;
}

export interface BudgetComparison {
  categoryId: string;
  categoryName: string;
  budgetAmount: string;
  spentAmount: string;
  remaining: string;
  isExceeded: boolean;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  kind: string;
  projectId?: string | null;
  depositId?: string | null;
  expenseId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Instant de la prise de vue (photo horodatee). */
  capturedAt?: string | null;
  createdAt: string;
}

export interface Anomaly {
  id: string;
  projectId: string;
  clientId: string;
  category: string;
  relatedExpenseId?: string | null;
  description: string;
  status: AnomalyStatus;
  resolutionNote?: string | null;
  createdAt: string;
  project?: { name: string };
  client?: { firstName: string; lastName: string };
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  userRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  createdAt: string;
  user?: { id: string; email: string; role: UserRole };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface MessageParticipant {
  id: string;
  email: string;
  role?: UserRole;
  clientProfile?: { firstName: string; lastName: string } | null;
}

export interface Message {
  id: string;
  type: MessageType;
  status: MessageStatus;
  subject: string;
  body: string;
  senderId: string;
  sender?: MessageParticipant;
  recipientId?: string | null;
  recipient?: MessageParticipant | null;
  relatedEntityType?: 'Deposit' | 'Expense' | null;
  relatedEntityId?: string | null;
  parentId?: string | null;
  replies?: Message[];
  isRead: boolean;
  emailSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ----------------------------------------------------------------------------
// Suivi de chantier : etapes, jours travailles, alimentation des ouvriers
// ----------------------------------------------------------------------------

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isActive: boolean;
  /** Budget prevu, planning prevu et avancement valide (0-100) de l'etape. */
  budgetAmount?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  progressPercent?: number;
  /** Jours travailles sur cette etape depuis le debut du chantier. */
  workedDays: number;
  /** Jours-ouvriers cumules (somme des effectifs). */
  workerDays: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface WorkDay {
  id: string;
  /** Date calendaire AAAA-MM-JJ. */
  date: string;
  isWorked: boolean;
  workersCount: number;
  phaseId: string | null;
  phaseName: string | null;
  note: string | null;
  stopReason?: 'RAIN' | 'HOLIDAY' | 'MATERIAL_SHORTAGE' | 'EQUIPMENT_BREAKDOWN' | 'PAYMENT_DELAY' | 'SAFETY' | 'OTHER' | null;
  isOffSite?: boolean;
  recordedById: string;
  updatedAt: string;
}

export interface AttendanceStats {
  workedDays: number;
  notWorkedDays: number;
  recordedDays: number;
  workerDays: number;
}

export interface MonthAttendance extends AttendanceStats {
  month: string;
  daysInMonth: number;
  elapsedDays: number;
  unrecordedDays: number;
  /** Part des jours ecoules travailles, en %. */
  attendanceRate: number;
}

export interface WorkMonthView {
  month: string;
  days: WorkDay[];
  summary: MonthAttendance;
}

export interface WorkSummary {
  totals: AttendanceStats & { firstWorkedDate: string | null; lastWorkedDate: string | null };
  byPhase: { phaseId: string; name: string; isActive: boolean; workedDays: number; workerDays: number; firstDate: string | null; lastDate: string | null }[];
  byMonth: (AttendanceStats & { month: string })[];
}

export interface UpsertWorkDayPayload {
  isWorked: boolean;
  workersCount?: number;
  phaseId?: string;
  note?: string;
  stopReason?: 'RAIN' | 'HOLIDAY' | 'MATERIAL_SHORTAGE' | 'EQUIPMENT_BREAKDOWN' | 'PAYMENT_DELAY' | 'SAFETY' | 'OTHER';
  latitude?: number;
  longitude?: number;
}

export type MealRequestStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface MealAccountRequest {
  id: string;
  projectId: string;
  month: string;
  message: string;
  status: MealRequestStatus;
  response: string | null;
  requestedById: string;
  answeredById: string | null;
  answeredAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface MealEnvelope {
  id: string;
  allocatedAmount: string;
  mealUnitCost: string;
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
  updatedAt: string;
}

export interface MealAmounts {
  allocatedAmount: string;
  mealUnitCost: string;
  carriedInAmount: string;
  carriedOutAmount: string;
  /** Enveloppe + reports recus - reports envoyes. */
  availableAmount: string;
  /** Jours-ouvriers x cout d'un repas : ce que les presences justifient. */
  justifiedAmount: string;
  spentAmount: string;
  pendingAmount: string;
  /** Disponible - depenses validees. */
  remainingAmount: string;
  /** Depense - justifie (positif = depense au-dela des presences). */
  gapAmount: string;
  carryableAmount: string;
}

export interface MealMonthReport {
  month: string;
  currency: string;
  envelope: MealEnvelope | null;
  attendance: MonthAttendance;
  amounts: MealAmounts;
  carryOversIn: { id: string; fromMonth: string; amount: string; reason: string | null; createdAt: string }[];
  carryOversOut: { id: string; toMonth: string; amount: string; reason: string | null; createdAt: string }[];
  requests: MealAccountRequest[];
  openRequestsCount: number;
}

export interface UpsertMealEnvelopePayload {
  allocatedAmount: number;
  mealUnitCost: number;
  categoryId?: string;
  note?: string;
}
