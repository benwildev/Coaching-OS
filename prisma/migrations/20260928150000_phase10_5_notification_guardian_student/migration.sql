-- Phase 10.5 follow-up: separates "which child a GUARDIAN's notification is
-- about" (guardianStudentId) from "this row IS the student's own portal
-- notification" (studentId) on the Notification table. The first version
-- of this fix reused `studentId` for both, which meant two DIFFERENT
-- guardians of the SAME child collided on the pre-existing, unrelated
-- (studentId, sourceType, sourceId, type) unique index — caught before
-- shipping, via the new Phase 10.5 verification script.

-- DropIndex
DROP INDEX "notifications_guardianId_studentId_sourceType_sourceId_type_key";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "guardianStudentId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_guardianStudentId_idx" ON "notifications"("guardianStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_guardianId_guardianStudentId_sourceType_sourc_key" ON "notifications"("guardianId", "guardianStudentId", "sourceType", "sourceId", "type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_guardianStudentId_fkey" FOREIGN KEY ("guardianStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
