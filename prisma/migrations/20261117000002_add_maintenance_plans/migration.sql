-- CreateEnum
CREATE TYPE "PMTriggerType" AS ENUM ('TIME', 'METER');

-- CreateEnum
CREATE TYPE "PMPlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "assetId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "triggerType" "PMTriggerType" NOT NULL DEFAULT 'TIME',
    "frequency" VARCHAR(100) NOT NULL,
    "status" "PMPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedTeam" VARCHAR(100),
    "estimatedHours" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "lastCompleted" TIMESTAMPTZ,
    "nextDue" TIMESTAMPTZ NOT NULL,
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "compliancePercent" SMALLINT NOT NULL DEFAULT 100,
    "checklist" JSONB,
    "requiredParts" JSONB,
    "requiredLabor" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_code_key" ON "maintenance_plans"("code");

-- CreateIndex
CREATE INDEX "maintenance_plans_branchId_idx" ON "maintenance_plans"("branchId");

-- CreateIndex
CREATE INDEX "maintenance_plans_assetId_idx" ON "maintenance_plans"("assetId");

-- CreateIndex
CREATE INDEX "maintenance_plans_status_idx" ON "maintenance_plans"("status");

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
