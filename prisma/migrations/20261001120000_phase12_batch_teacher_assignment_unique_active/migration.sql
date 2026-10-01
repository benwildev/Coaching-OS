-- Phase 12: prevent duplicate active teaching assignments for the same
-- (teacherId, batchId, subjectId) tuple at the database level.
-- Historical rows (status = 'ENDED') are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "batch_teacher_assignments_active_key"
  ON "batch_teacher_assignments"("teacherId", "batchId", "subjectId")
  WHERE "status" = 'ACTIVE';
