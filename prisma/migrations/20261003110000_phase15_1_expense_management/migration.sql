-- Phase 15.1: Expense Management & Category Safety

-- 1. Add isActive to expense_categories (allows active/inactive category management without deleting historical records)
ALTER TABLE "expense_categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- 2. Add idempotencyKey to expenses and tenant-scoped unique constraint for duplicate submission prevention
ALTER TABLE "expenses" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "expenses_coachingCenterId_idempotencyKey_key" ON "expenses"("coachingCenterId", "idempotencyKey");

-- 3. Update categoryId foreign key from CASCADE to RESTRICT to protect financial records
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_categoryId_fkey";

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
