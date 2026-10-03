-- Phase 15.2 foundation: Expense lifecycle status (additive; existing rows become ACTIVE).
ALTER TABLE "expenses" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelReason" TEXT;

-- CreateIndex
CREATE INDEX "expenses_coachingCenterId_branchId_date_idx" ON "expenses"("coachingCenterId", "branchId", "date");

-- CreateIndex
CREATE INDEX "expenses_coachingCenterId_status_date_idx" ON "expenses"("coachingCenterId", "status", "date");

-- CreateIndex
CREATE INDEX "expenses_coachingCenterId_categoryId_idx" ON "expenses"("coachingCenterId", "categoryId");

-- Integrity backstops (same style as Phase 13)
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_status_valid" CHECK ("status" IN ('ACTIVE','CANCELLED'));
