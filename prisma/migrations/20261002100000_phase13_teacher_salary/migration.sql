-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "teacher_compensations" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "batchTeacherAssignmentId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_periods" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payables" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "salaryPeriodId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "additions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "breakdown" JSONB NOT NULL,
    "notes" TEXT,
    "cancelReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "salaryPayableId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentDate" DATE NOT NULL,
    "transactionId" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "idempotencyKey" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_compensations_coachingCenterId_teacherId_status_idx" ON "teacher_compensations"("coachingCenterId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "teacher_compensations_coachingCenterId_branchId_effectiveFr_idx" ON "teacher_compensations"("coachingCenterId", "branchId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "teacher_compensations_batchTeacherAssignmentId_idx" ON "teacher_compensations"("batchTeacherAssignmentId");

-- CreateIndex
CREATE INDEX "salary_periods_coachingCenterId_status_idx" ON "salary_periods"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_periods_coachingCenterId_branchId_year_month_key" ON "salary_periods"("coachingCenterId", "branchId", "year", "month");

-- CreateIndex
CREATE INDEX "salary_payables_coachingCenterId_teacherId_idx" ON "salary_payables"("coachingCenterId", "teacherId");

-- CreateIndex
CREATE INDEX "salary_payables_coachingCenterId_branchId_status_idx" ON "salary_payables"("coachingCenterId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payables_salaryPeriodId_teacherId_key" ON "salary_payables"("salaryPeriodId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_expenseId_key" ON "salary_payments"("expenseId");

-- CreateIndex
CREATE INDEX "salary_payments_coachingCenterId_salaryPayableId_idx" ON "salary_payments"("coachingCenterId", "salaryPayableId");

-- CreateIndex
CREATE INDEX "salary_payments_coachingCenterId_branchId_paymentDate_idx" ON "salary_payments"("coachingCenterId", "branchId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_coachingCenterId_idempotencyKey_key" ON "salary_payments"("coachingCenterId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_coachingCenterId_code_key" ON "expense_categories"("coachingCenterId", "code");

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_batchTeacherAssignmentId_fkey" FOREIGN KEY ("batchTeacherAssignmentId") REFERENCES "batch_teacher_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_periods" ADD CONSTRAINT "salary_periods_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_periods" ADD CONSTRAINT "salary_periods_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_salaryPeriodId_fkey" FOREIGN KEY ("salaryPeriodId") REFERENCES "salary_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_salaryPayableId_fkey" FOREIGN KEY ("salaryPayableId") REFERENCES "salary_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 13 database-level safety nets (the service layer also validates these).
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_dates_ordered" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "salary_periods" ADD CONSTRAINT "salary_periods_month_range" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_paid_within_net" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "netAmount");
ALTER TABLE "salary_payables" ADD CONSTRAINT "salary_payables_remaining_consistent" CHECK ("remainingAmount" = "netAmount" - "paidAmount");
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_amount_positive" CHECK ("amount" > 0);
