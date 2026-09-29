-- AlterTable
ALTER TABLE "communication_logs" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryable" BOOLEAN;

-- CreateIndex
CREATE INDEX "communication_logs_status_nextRetryAt_idx" ON "communication_logs"("status", "nextRetryAt");

