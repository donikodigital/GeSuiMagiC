-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'CLIENT', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectSupervisorStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpensePaymentStatus" AS ENUM ('PAID_FULL', 'PARTIAL', 'CREDIT');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_INVITATION', 'PASSWORD_RESET', 'DEPOSIT_CREATED', 'DEPOSIT_APPROVED', 'DEPOSIT_REJECTED', 'EXPENSE_CREATED', 'EXPENSE_PENDING_APPROVAL', 'EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'LOW_BALANCE_ALERT', 'BUDGET_EXCEEDED_ALERT', 'LARGE_EXPENSE_ALERT', 'ADMIN_CORRECTION', 'ANOMALY_REPORTED', 'ANOMALY_UPDATED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE_SOFT', 'APPROVE', 'REJECT', 'CANCEL', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('GLOBAL', 'PROJECT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "invitationTokenHash" TEXT,
    "invitationTokenExpiresAt" TIMESTAMP(3),
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "profession" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "taxId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "address" TEXT,
    "profession" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "idDocumentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "motif" TEXT,
    "constructionType" TEXT,
    "location" TEXT,
    "city" TEXT,
    "country" TEXT,
    "surfaceArea" DECIMAL(14,2),
    "roomCount" INTEGER,
    "projectType" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "estimatedDurationDays" INTEGER,
    "estimatedCost" DECIMAL(18,2),
    "budget" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GNF',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "autoApproveExpenses" BOOLEAN NOT NULL DEFAULT true,
    "expenseApprovalThreshold" DECIMAL(18,2) NOT NULL DEFAULT 5000000,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_supervisors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "status" "ProjectSupervisorStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "project_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalDeposited" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GNF',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GNF',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "observation" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "defaultUnitId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,
    "materialId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "observation" TEXT,
    "supplier" TEXT,
    "invoiceReference" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "paymentStatus" "ExpensePaymentStatus" NOT NULL DEFAULT 'PAID_FULL',
    "amountPaidToSupplier" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "projectId" TEXT,
    "depositId" TEXT,
    "expenseId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_corrections" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" DECIMAL(18,2) NOT NULL,
    "newValue" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "relatedExpenseId" TEXT,
    "description" TEXT NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" "UserRole",
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "scope" "SettingScope" NOT NULL DEFAULT 'GLOBAL',
    "projectId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_userId_key" ON "client_profiles"("userId");

-- CreateIndex
CREATE INDEX "client_profiles_lastName_firstName_idx" ON "client_profiles"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_profiles_userId_key" ON "supervisor_profiles"("userId");

-- CreateIndex
CREATE INDEX "supervisor_profiles_clientId_idx" ON "supervisor_profiles"("clientId");

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "project_supervisors_supervisorId_idx" ON "project_supervisors"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "project_supervisors_projectId_supervisorId_key" ON "project_supervisors"("projectId", "supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_projectId_key" ON "wallets"("projectId");

-- CreateIndex
CREATE INDEX "deposits_projectId_status_idx" ON "deposits"("projectId", "status");

-- CreateIndex
CREATE INDEX "deposits_supervisorId_idx" ON "deposits"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_name_categoryId_key" ON "materials"("name", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE INDEX "expenses_projectId_status_idx" ON "expenses"("projectId", "status");

-- CreateIndex
CREATE INDEX "expenses_supervisorId_idx" ON "expenses"("supervisorId");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_projectId_categoryId_key" ON "budgets"("projectId", "categoryId");

-- CreateIndex
CREATE INDEX "attachments_projectId_idx" ON "attachments"("projectId");

-- CreateIndex
CREATE INDEX "attachments_depositId_idx" ON "attachments"("depositId");

-- CreateIndex
CREATE INDEX "attachments_expenseId_idx" ON "attachments"("expenseId");

-- CreateIndex
CREATE INDEX "financial_corrections_entityType_entityId_idx" ON "financial_corrections"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "anomalies_projectId_status_idx" ON "anomalies"("projectId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_projectId_key" ON "settings"("key", "projectId");

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_profiles" ADD CONSTRAINT "supervisor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_profiles" ADD CONSTRAINT "supervisor_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_supervisors" ADD CONSTRAINT "project_supervisors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_supervisors" ADD CONSTRAINT "project_supervisors_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_corrections" ADD CONSTRAINT "financial_corrections_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
