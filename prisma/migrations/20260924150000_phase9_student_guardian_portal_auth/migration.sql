-- CreateEnum
CREATE TYPE "PortalAccountType" AS ENUM ('STUDENT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "PortalAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "guardianId" TEXT,
ADD COLUMN     "studentId" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "guardianId" TEXT,
ADD COLUMN     "studentId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "portal_accounts" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "portalType" "PortalAccountType" NOT NULL,
    "studentId" TEXT,
    "guardianId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "status" "PortalAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_auth_tokens" (
    "id" TEXT NOT NULL,
    "portalAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_studentId_key" ON "portal_accounts"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_guardianId_key" ON "portal_accounts"("guardianId");

-- CreateIndex
CREATE INDEX "portal_accounts_coachingCenterId_phone_idx" ON "portal_accounts"("coachingCenterId", "phone");

-- CreateIndex
CREATE INDEX "portal_accounts_coachingCenterId_email_idx" ON "portal_accounts"("coachingCenterId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_auth_tokens_tokenHash_key" ON "portal_auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_auth_tokens_portalAccountId_purpose_idx" ON "portal_auth_tokens"("portalAccountId", "purpose");

-- CreateIndex
CREATE INDEX "notifications_studentId_isRead_idx" ON "notifications"("studentId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_guardianId_isRead_idx" ON "notifications"("guardianId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_studentId_sourceType_sourceId_type_key" ON "notifications"("studentId", "sourceType", "sourceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_guardianId_sourceType_sourceId_type_key" ON "notifications"("guardianId", "sourceType", "sourceId", "type");

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_auth_tokens" ADD CONSTRAINT "portal_auth_tokens_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: a PortalAccount belongs to exactly one identity (AGENTS.md §4)
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_exactly_one_identity" CHECK (
  (("studentId" IS NOT NULL) AND ("guardianId" IS NULL)) OR
  (("studentId" IS NULL) AND ("guardianId" IS NOT NULL))
);
