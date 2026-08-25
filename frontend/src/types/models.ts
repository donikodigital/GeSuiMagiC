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
  createdAt: string;
  wallet?: Wallet;
  client?: { id: string; firstName: string; lastName: string; phone?: string | null };
  supervisors?: { supervisor: SupervisorProfile }[];
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
  rejectionReason?: string | null;
  isLocked: boolean;
  createdAt: string;
  supervisor?: { firstName: string; lastName: string };
  attachments?: Attachment[];
}

export interface ExpenseCategory {
  id: string;
  name: string;
  group?: string | null;
  isActive: boolean;
}

export interface Material {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  category?: ExpenseCategory;
  defaultUnit?: Unit | null;
}

export interface Unit {
  id: string;
  name: string;
  symbol?: string | null;
  isActive: boolean;
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
  status: ExpenseStatus;
  rejectionReason?: string | null;
  paymentStatus: ExpensePaymentStatus;
  amountPaidToSupplier: string;
  balanceDueToSupplier?: string;
  isLocked: boolean;
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

export interface PaginatedResponse<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
