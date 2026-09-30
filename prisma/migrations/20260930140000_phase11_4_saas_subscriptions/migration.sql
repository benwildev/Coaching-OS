-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_planId_fkey";

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "banglaName" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "maxEmail" INTEGER,
ADD COLUMN     "maxPortalAccounts" INTEGER,
ADD COLUMN     "maxSms" INTEGER,
ADD COLUMN     "maxStaffUsers" INTEGER,
ADD COLUMN     "maxStorageMb" INTEGER,
ADD COLUMN     "maxTeachers" INTEGER,
ADD COLUMN     "maxWhatsapp" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trialDays" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "maxStudents" DROP NOT NULL,
ALTER COLUMN "maxStudents" DROP DEFAULT,
ALTER COLUMN "maxBranches" DROP NOT NULL,
ALTER COLUMN "maxBranches" DROP DEFAULT,
ALTER COLUMN "priceMonthly" SET DEFAULT 0,
ALTER COLUMN "priceYearly" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "overrides" JSONB,
ADD COLUMN     "planSnapshot" JSONB,
ADD COLUMN     "planVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT,
    "coachingCenterId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "platform_audit_logs_coachingCenterId_createdAt_idx" ON "platform_audit_logs"("coachingCenterId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_action_createdAt_idx" ON "platform_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_plans_status_idx" ON "subscription_plans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_coachingCenterId_key" ON "subscriptions"("coachingCenterId");

-- CreateIndex
CREATE INDEX "subscriptions_status_endDate_idx" ON "subscriptions"("status", "endDate");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
