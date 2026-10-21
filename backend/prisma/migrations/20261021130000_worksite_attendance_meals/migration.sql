-- Suivi des jours travailles (etapes + calendrier) et de l'alimentation des ouvriers.
-- Ne modifie aucune donnee existante : uniquement des nouvelles tables et 2 valeurs d'enum.

-- 1) Nouvelles valeurs de notification
ALTER TYPE "NotificationType" ADD VALUE 'MEAL_ACCOUNT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'MEAL_ACCOUNT_ANSWERED';

-- 2) Enum
CREATE TYPE "MealRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- 3) Tables
CREATE TABLE "project_phases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_days" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isWorked" BOOLEAN NOT NULL,
    "workersCount" INTEGER NOT NULL DEFAULT 0,
    "phaseId" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meal_envelopes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "mealUnitCost" DECIMAL(18,2) NOT NULL,
    "categoryId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meal_carry_overs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "toMonth" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_carry_overs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meal_account_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "MealRequestStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "requestedById" TEXT NOT NULL,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_account_requests_pkey" PRIMARY KEY ("id")
);

-- 4) Index
CREATE UNIQUE INDEX "project_phases_projectId_name_key" ON "project_phases"("projectId", "name");
CREATE INDEX "project_phases_projectId_position_idx" ON "project_phases"("projectId", "position");

CREATE UNIQUE INDEX "work_days_projectId_date_key" ON "work_days"("projectId", "date");
CREATE INDEX "work_days_phaseId_idx" ON "work_days"("phaseId");

CREATE UNIQUE INDEX "meal_envelopes_projectId_month_key" ON "meal_envelopes"("projectId", "month");

CREATE INDEX "meal_carry_overs_projectId_fromMonth_idx" ON "meal_carry_overs"("projectId", "fromMonth");
CREATE INDEX "meal_carry_overs_projectId_toMonth_idx" ON "meal_carry_overs"("projectId", "toMonth");

CREATE INDEX "meal_account_requests_projectId_month_idx" ON "meal_account_requests"("projectId", "month");
CREATE INDEX "meal_account_requests_projectId_status_idx" ON "meal_account_requests"("projectId", "status");

-- 5) Cles etrangeres
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_days" ADD CONSTRAINT "work_days_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_days" ADD CONSTRAINT "work_days_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "meal_envelopes" ADD CONSTRAINT "meal_envelopes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meal_envelopes" ADD CONSTRAINT "meal_envelopes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "meal_carry_overs" ADD CONSTRAINT "meal_carry_overs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meal_account_requests" ADD CONSTRAINT "meal_account_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
