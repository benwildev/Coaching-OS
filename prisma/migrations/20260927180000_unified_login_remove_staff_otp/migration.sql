-- Unified email + password sign-in: the staff Mobile + OTP flow is removed,
-- so its challenge table is obsolete.
-- DropForeignKey
ALTER TABLE "staff_login_otps" DROP CONSTRAINT "staff_login_otps_coachingCenterId_fkey";

-- DropForeignKey
ALTER TABLE "staff_login_otps" DROP CONSTRAINT "staff_login_otps_userId_fkey";

-- DropTable
DROP TABLE "staff_login_otps";

-- Staff sign-in lockout (same policy as portal_accounts).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
