-- Suite de gestion de chantier : avancement, journal, qualite, avenants, fournisseurs, devis, marches,
-- achats/stock, ouvriers et paie, documents, multi-devises, controles anti-fraude, canaux WhatsApp/SMS.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CHANGE_ORDER_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'CHANGE_ORDER_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'SNAG_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'SNAG_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'PROGRESS_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROGRESS_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'TECH_REVIEW_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_REPORT';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'DELIVERY_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'STATEMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'STATEMENT_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'LOCATION_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'LOW_STOCK_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'SCHEDULE_ALERT';

-- CreateEnum
CREATE TYPE "SupervisorPosition" AS ENUM ('SUPERVISOR', 'SITE_MANAGER', 'ARCHITECT');
CREATE TYPE "WorkStopReason" AS ENUM ('RAIN', 'HOLIDAY', 'MATERIAL_SHORTAGE', 'EQUIPMENT_BREAKDOWN', 'PAYMENT_DELAY', 'SAFETY', 'OTHER');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');
CREATE TYPE "TechReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "WeatherCondition" AS ENUM ('SUNNY', 'CLOUDY', 'RAIN', 'HEAVY_RAIN', 'WINDY');
CREATE TYPE "SnagSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');
CREATE TYPE "SnagStatus" AS ENUM ('OPEN', 'FIXED', 'CLOSED');
CREATE TYPE "ReceptionType" AS ENUM ('PHASE', 'PROVISIONAL', 'FINAL');
CREATE TYPE "ChangeOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "SupplierKind" AS ENUM ('SUPPLIER', 'SUBCONTRACTOR');
CREATE TYPE "QuoteLotStatus" AS ENUM ('OPEN', 'AWARDED', 'CLOSED');
CREATE TYPE "SupplierQuoteStatus" AS ENUM ('SUBMITTED', 'SELECTED', 'REJECTED');
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "StatementStatus" AS ENUM ('SUBMITTED', 'VALIDATED', 'REJECTED');
CREATE TYPE "ContractPaymentType" AS ENUM ('ADVANCE', 'STATEMENT', 'RETENTION_RELEASE', 'OTHER');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ORDERED', 'PARTIAL', 'DELIVERED', 'CANCELLED');
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'LOSS');
CREATE TYPE "ProjectDocumentType" AS ENUM ('PERMIT', 'PLAN', 'CONTRACT', 'INSURANCE', 'WARRANTY', 'TAX', 'OTHER');
CREATE TYPE "PayRunStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable : utilisateurs (canaux de notification)
ALTER TABLE "users" ADD COLUMN "messagingPhone" TEXT,
ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable : projets (anti-fraude)
ALTER TABLE "projects" ADD COLUMN "siteLatitude" DECIMAL(9,6),
ADD COLUMN "siteLongitude" DECIMAL(9,6),
ADD COLUMN "geoFenceMeters" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN "receiptRequiredAbove" DECIMAL(18,2),
ADD COLUMN "technicalReviewAbove" DECIMAL(18,2);

-- AlterTable : affectations (fonction sur le chantier)
ALTER TABLE "project_supervisors" ADD COLUMN "position" "SupervisorPosition" NOT NULL DEFAULT 'SUPERVISOR';

-- AlterTable : depots (envoi depuis l'etranger)
ALTER TABLE "deposits" ADD COLUMN "originalAmount" DECIMAL(18,2),
ADD COLUMN "originalCurrency" TEXT,
ADD COLUMN "exchangeRate" DECIMAL(18,6),
ADD COLUMN "transferFees" DECIMAL(18,2);

-- AlterTable : depenses (rattachements et controles)
ALTER TABLE "expenses" ADD COLUMN "phaseId" TEXT,
ADD COLUMN "supplierId" TEXT,
ADD COLUMN "contractId" TEXT,
ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6),
ADD COLUMN "isOffSite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "distanceMeters" INTEGER,
ADD COLUMN "techReviewStatus" "TechReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "techReviewedById" TEXT,
ADD COLUMN "techReviewedAt" TIMESTAMP(3),
ADD COLUMN "techReviewNote" TEXT,
ADD COLUMN "clientRef" TEXT;

-- AlterTable : pieces jointes (rattachement generique)
ALTER TABLE "attachments" ADD COLUMN "entityType" TEXT,
ADD COLUMN "entityId" TEXT,
ADD COLUMN "capturedAt" TIMESTAMP(3);

-- AlterTable : etapes (budget, planning, avancement)
ALTER TABLE "project_phases" ADD COLUMN "budgetAmount" DECIMAL(18,2),
ADD COLUMN "plannedStart" DATE,
ADD COLUMN "plannedEnd" DATE,
ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable : jours travailles (raison d'arret, position)
ALTER TABLE "work_days" ADD COLUMN "stopReason" "WorkStopReason",
ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6),
ADD COLUMN "isOffSite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "site_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "weather" "WeatherCondition",
    "phaseId" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isOffSite" BOOLEAN DEFAULT false NOT NULL,
    "clientRef" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "phase_progress_updates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "note" TEXT,
    "status" "ReviewStatus" DEFAULT 'PENDING' NOT NULL,
    "submittedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "clientRef" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "phase_progress_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "snags" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "phaseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "severity" "SnagSeverity" DEFAULT 'MINOR' NOT NULL,
    "status" "SnagStatus" DEFAULT 'OPEN' NOT NULL,
    "dueDate" DATE,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "fixedById" TEXT,
    "fixedAt" TIMESTAMP(3),
    "fixNote" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureNote" TEXT,
    "clientRef" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "snags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receptions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "ReceptionType" NOT NULL,
    "phaseId" TEXT,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "attendees" TEXT,
    "reservesSnapshot" JSONB,
    "openSnagsCount" INTEGER DEFAULT 0 NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signerName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "receptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "change_orders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraCost" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "extraDays" INTEGER DEFAULT 0 NOT NULL,
    "phaseId" TEXT,
    "status" "ChangeOrderStatus" DEFAULT 'PENDING' NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedToBudget" BOOLEAN DEFAULT false NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "ownerClientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SupplierKind" DEFAULT 'SUPPLIER' NOT NULL,
    "trade" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "phaseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "QuoteLotStatus" DEFAULT 'OPEN' NOT NULL,
    "awardedQuoteId" TEXT,
    "estimatedAmount" DECIMAL(18,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lot_items" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "position" INTEGER DEFAULT 0 NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "estimatedUnitPrice" DECIMAL(18,2),
    CONSTRAINT "quote_lot_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_quotes" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reference" TEXT,
    "validUntil" DATE,
    "notes" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "status" "SupplierQuoteStatus" DEFAULT 'SUBMITTED' NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_quote_lines" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemId" TEXT,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "supplier_quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "phaseId" TEXT,
    "quoteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "retentionPercent" DECIMAL(5,2) DEFAULT 5 NOT NULL,
    "signedAt" DATE,
    "status" "ContractStatus" DEFAULT 'ACTIVE' NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "progress_statements" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "periodEnd" DATE NOT NULL,
    "cumulativeAmount" DECIMAL(18,2) NOT NULL,
    "amountThisPeriod" DECIMAL(18,2) NOT NULL,
    "retentionAmount" DECIMAL(18,2) NOT NULL,
    "advanceRecovered" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "netPayable" DECIMAL(18,2) NOT NULL,
    "status" "StatementStatus" DEFAULT 'SUBMITTED' NOT NULL,
    "note" TEXT,
    "submittedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "progress_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "statementId" TEXT,
    "type" "ContractPaymentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "expenseId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "contract_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "phaseId" TEXT,
    "reference" TEXT,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "status" "PurchaseOrderStatus" DEFAULT 'ORDERED' NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER DEFAULT 0 NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(18,2),
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "noteReference" TEXT,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isOffSite" BOOLEAN DEFAULT false NOT NULL,
    "clientRef" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_lines" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "stockItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityReceived" DECIMAL(14,3) NOT NULL,
    "quantityRefused" DECIMAL(14,3) DEFAULT 0 NOT NULL,
    "note" TEXT,
    CONSTRAINT "delivery_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minQuantity" DECIMAL(14,3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "phaseId" TEXT,
    "deliveryLineId" TEXT,
    "date" DATE NOT NULL,
    "note" TEXT,
    "clientRef" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProjectDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "notes" TEXT,
    "lastAlertDays" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "trade" TEXT,
    "dailyRate" DECIMAL(18,2),
    "phone" TEXT,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "startedAt" DATE,
    "leftAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_presences" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fraction" DECIMAL(3,2) DEFAULT 1 NOT NULL,
    "phaseId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "worker_presences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_advances" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "worker_advances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pay_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PayRunStatus" DEFAULT 'DRAFT' NOT NULL,
    "categoryId" TEXT,
    "totalGross" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "totalAdvance" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "totalNet" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "expenseId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pay_run_lines" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "daysWorked" DECIMAL(6,2) NOT NULL,
    "dailyRate" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "advanceDeducted" DECIMAL(18,2) DEFAULT 0 NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    CONSTRAINT "pay_run_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_logs_projectId_clientRef_key" ON "site_logs"("projectId", "clientRef");
CREATE INDEX "site_logs_projectId_date_idx" ON "site_logs"("projectId", "date");
CREATE INDEX "site_logs_phaseId_idx" ON "site_logs"("phaseId");
CREATE UNIQUE INDEX "phase_progress_updates_projectId_clientRef_key" ON "phase_progress_updates"("projectId", "clientRef");
CREATE INDEX "phase_progress_updates_phaseId_createdAt_idx" ON "phase_progress_updates"("phaseId", "createdAt");
CREATE INDEX "phase_progress_updates_projectId_status_idx" ON "phase_progress_updates"("projectId", "status");
CREATE UNIQUE INDEX "snags_projectId_number_key" ON "snags"("projectId", "number");
CREATE UNIQUE INDEX "snags_projectId_clientRef_key" ON "snags"("projectId", "clientRef");
CREATE INDEX "snags_projectId_status_idx" ON "snags"("projectId", "status");
CREATE UNIQUE INDEX "receptions_projectId_number_key" ON "receptions"("projectId", "number");
CREATE INDEX "receptions_projectId_type_idx" ON "receptions"("projectId", "type");
CREATE UNIQUE INDEX "change_orders_projectId_number_key" ON "change_orders"("projectId", "number");
CREATE INDEX "change_orders_projectId_status_idx" ON "change_orders"("projectId", "status");
CREATE UNIQUE INDEX "suppliers_ownerClientId_name_key" ON "suppliers"("ownerClientId", "name");
CREATE INDEX "suppliers_ownerClientId_kind_idx" ON "suppliers"("ownerClientId", "kind");
CREATE UNIQUE INDEX "quote_lots_projectId_number_key" ON "quote_lots"("projectId", "number");
CREATE INDEX "quote_lot_items_lotId_position_idx" ON "quote_lot_items"("lotId", "position");
CREATE UNIQUE INDEX "supplier_quotes_lotId_supplierId_key" ON "supplier_quotes"("lotId", "supplierId");
CREATE INDEX "supplier_quote_lines_quoteId_idx" ON "supplier_quote_lines"("quoteId");
CREATE UNIQUE INDEX "contracts_projectId_number_key" ON "contracts"("projectId", "number");
CREATE INDEX "contracts_supplierId_idx" ON "contracts"("supplierId");
CREATE UNIQUE INDEX "progress_statements_contractId_number_key" ON "progress_statements"("contractId", "number");
CREATE INDEX "progress_statements_projectId_status_idx" ON "progress_statements"("projectId", "status");
CREATE UNIQUE INDEX "contract_payments_expenseId_key" ON "contract_payments"("expenseId");
CREATE INDEX "contract_payments_contractId_idx" ON "contract_payments"("contractId");
CREATE INDEX "contract_payments_projectId_idx" ON "contract_payments"("projectId");
CREATE UNIQUE INDEX "purchase_orders_projectId_number_key" ON "purchase_orders"("projectId", "number");
CREATE INDEX "purchase_orders_projectId_status_idx" ON "purchase_orders"("projectId", "status");
CREATE INDEX "purchase_order_lines_orderId_position_idx" ON "purchase_order_lines"("orderId", "position");
CREATE UNIQUE INDEX "deliveries_projectId_clientRef_key" ON "deliveries"("projectId", "clientRef");
CREATE INDEX "deliveries_projectId_date_idx" ON "deliveries"("projectId", "date");
CREATE INDEX "delivery_lines_deliveryId_idx" ON "delivery_lines"("deliveryId");
CREATE UNIQUE INDEX "stock_items_projectId_name_unit_key" ON "stock_items"("projectId", "name", "unit");
CREATE UNIQUE INDEX "stock_movements_projectId_clientRef_key" ON "stock_movements"("projectId", "clientRef");
CREATE INDEX "stock_movements_projectId_date_idx" ON "stock_movements"("projectId", "date");
CREATE INDEX "stock_movements_stockItemId_idx" ON "stock_movements"("stockItemId");
CREATE INDEX "stock_movements_phaseId_idx" ON "stock_movements"("phaseId");
CREATE INDEX "project_documents_projectId_expiresAt_idx" ON "project_documents"("projectId", "expiresAt");
CREATE UNIQUE INDEX "workers_projectId_fullName_key" ON "workers"("projectId", "fullName");
CREATE INDEX "workers_projectId_isActive_idx" ON "workers"("projectId", "isActive");
CREATE UNIQUE INDEX "worker_presences_workerId_date_key" ON "worker_presences"("workerId", "date");
CREATE INDEX "worker_presences_projectId_date_idx" ON "worker_presences"("projectId", "date");
CREATE INDEX "worker_advances_projectId_workerId_idx" ON "worker_advances"("projectId", "workerId");
CREATE UNIQUE INDEX "pay_runs_projectId_number_key" ON "pay_runs"("projectId", "number");
CREATE UNIQUE INDEX "pay_runs_expenseId_key" ON "pay_runs"("expenseId");
CREATE UNIQUE INDEX "pay_run_lines_payRunId_workerId_key" ON "pay_run_lines"("payRunId", "workerId");
CREATE INDEX "expenses_phaseId_idx" ON "expenses"("phaseId");
CREATE INDEX "expenses_supplierId_idx" ON "expenses"("supplierId");
CREATE INDEX "expenses_contractId_idx" ON "expenses"("contractId");
CREATE UNIQUE INDEX "expenses_projectId_clientRef_key" ON "expenses"("projectId", "clientRef");
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "phase_progress_updates" ADD CONSTRAINT "phase_progress_updates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phase_progress_updates" ADD CONSTRAINT "phase_progress_updates_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snags" ADD CONSTRAINT "snags_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snags" ADD CONSTRAINT "snags_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_lots" ADD CONSTRAINT "quote_lots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_lots" ADD CONSTRAINT "quote_lots_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "quote_lot_items" ADD CONSTRAINT "quote_lot_items_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "quote_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "quote_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "supplier_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "quote_lot_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "progress_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_deliveryLineId_fkey" FOREIGN KEY ("deliveryLineId") REFERENCES "delivery_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workers" ADD CONSTRAINT "workers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_presences" ADD CONSTRAINT "worker_presences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_presences" ADD CONSTRAINT "worker_presences_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_presences" ADD CONSTRAINT "worker_presences_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "worker_advances" ADD CONSTRAINT "worker_advances_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_advances" ADD CONSTRAINT "worker_advances_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "pay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
