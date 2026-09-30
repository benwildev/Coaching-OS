-- AlterTable
ALTER TABLE "student_enrollments" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_coachingCenterId_idempotencyKey_key" ON "student_enrollments"("coachingCenterId", "idempotencyKey");
