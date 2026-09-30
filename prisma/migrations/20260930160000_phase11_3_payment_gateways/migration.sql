-- CreateEnum
CREATE TYPE "PaymentGatewayProviderType" AS ENUM ('BKASH', 'SSLCOMMERZ');

-- CreateEnum
CREATE TYPE "GatewayTransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ManualPaymentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "provider" "PaymentGatewayProviderType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isSandbox" BOOLEAN NOT NULL DEFAULT true,
    "credentialsEncrypted" TEXT NOT NULL,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_payment_instructions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "accountType" TEXT,
    "accountNumber" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "routingNumber" TEXT,
    "accountTitle" TEXT,
    "instructions" TEXT,
    "instructionsBn" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_transactions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "provider" "PaymentGatewayProviderType" NOT NULL,
    "merchantTransactionId" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "GatewayTransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_payment_submissions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "transactionId" TEXT,
    "referenceNumber" TEXT,
    "senderMobile" TEXT,
    "bankName" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studentNote" TEXT,
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_coachingCenterId_provider_key" ON "payment_gateway_configs"("coachingCenterId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_instructions_coachingCenterId_paymentMethod_key" ON "manual_payment_instructions"("coachingCenterId", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_transactions_paymentId_key" ON "payment_gateway_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_coachingCenterId_provider_prov_idx" ON "payment_gateway_transactions"("coachingCenterId", "provider", "providerTransactionId");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_coachingCenterId_invoiceId_idx" ON "payment_gateway_transactions"("coachingCenterId", "invoiceId");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_coachingCenterId_studentId_idx" ON "payment_gateway_transactions"("coachingCenterId", "studentId");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_coachingCenterId_status_idx" ON "payment_gateway_transactions"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_transactions_coachingCenterId_merchantTrans_key" ON "payment_gateway_transactions"("coachingCenterId", "merchantTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_submissions_paymentId_key" ON "manual_payment_submissions"("paymentId");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_coachingCenterId_invoiceId_idx" ON "manual_payment_submissions"("coachingCenterId", "invoiceId");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_coachingCenterId_studentId_idx" ON "manual_payment_submissions"("coachingCenterId", "studentId");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_coachingCenterId_status_idx" ON "manual_payment_submissions"("coachingCenterId", "status");

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_instructions" ADD CONSTRAINT "manual_payment_instructions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_instructions" ADD CONSTRAINT "manual_payment_instructions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_submissions" ADD CONSTRAINT "manual_payment_submissions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
