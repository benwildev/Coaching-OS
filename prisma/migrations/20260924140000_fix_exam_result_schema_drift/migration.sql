-- Pre-existing schema drift correction (not part of Phase 9): schema.prisma
-- already declared Exam.status/publishedAt/academicGroupId/updatedAt and
-- Result.status/updatedAt (plus a nullable Result.marksObtained) from an
-- earlier phase, but no migration ever created these columns in the
-- database. Discovered while diffing the live DB against schema.prisma for
-- the Phase 9 migration. The database has zero rows in both tables
-- (verified before writing this), so backfilling defaults is safe.

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "academicGroupId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "results" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PRESENT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "marksObtained" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "exams_coachingCenterId_branchId_idx" ON "exams"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "exams_coachingCenterId_status_idx" ON "exams"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "exams_coachingCenterId_academicSessionId_idx" ON "exams"("coachingCenterId", "academicSessionId");

-- CreateIndex
CREATE INDEX "exams_coachingCenterId_batchId_idx" ON "exams"("coachingCenterId", "batchId");

-- CreateIndex
CREATE INDEX "results_studentId_idx" ON "results"("studentId");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
