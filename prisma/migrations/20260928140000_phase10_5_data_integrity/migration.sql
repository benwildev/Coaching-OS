-- Phase 10.5: operational data-integrity fixes.

-- 1. Attendance: a batch may have several CLASS attendance sessions on one
-- date (one per class period), distinguished by classScheduleId — the old
-- (batchId, date, type) unique index blocked every class after the first.
-- classScheduleId+date (unchanged, below) already guarantees one session
-- per actual scheduled occurrence.
DROP INDEX "attendance_sessions_batchId_date_type_key";
CREATE INDEX "attendance_sessions_batchId_date_type_idx" ON "attendance_sessions"("batchId", "date", "type");
-- Non-CLASS sessions (EXAM/SPECIAL, no classScheduleId) still get
-- (batchId, date, type) uniqueness — a PARTIAL index, since only CLASS
-- needed the restriction lifted. Not representable in schema.prisma's DSL
-- (Prisma has no filtered-unique-index syntax), so it will show as "extra"
-- drift on a future `prisma migrate diff` against the live DB — that is
-- expected; do not let a generated diff drop it.
CREATE UNIQUE INDEX "attendance_sessions_batch_date_type_non_class_key"
  ON "attendance_sessions"("batchId", "date", "type")
  WHERE "type" <> 'CLASS';

-- 2. Notifications / communication logs: a guardian's per-event dedup key
-- must include studentId, or two children of the same guardian sharing one
-- broadcast-style sourceId (an exam, a study material, a notice) collapse
-- onto the same row — the second child's notification/SMS silently never
-- gets created (P2002 swallowed by the existing catch blocks).
DROP INDEX "notifications_guardianId_sourceType_sourceId_type_key";
CREATE UNIQUE INDEX "notifications_guardianId_studentId_sourceType_sourceId_type_key"
  ON "notifications"("guardianId", "studentId", "sourceType", "sourceId", "type");

DROP INDEX "communication_logs_guardianId_channel_event_sourceType_sour_key";
CREATE UNIQUE INDEX "communication_logs_guardianId_studentId_channel_event_sourc_key"
  ON "communication_logs"("guardianId", "studentId", "channel", "event", "sourceType", "sourceId");

-- 3. Payments: optional client-generated idempotency key (double-submit /
-- network-retry protection) and a per-tenant-per-method uniqueness on
-- transactionId (catches the same bKash/Nagad/bank reference entered
-- twice). NULL values are never considered duplicates of each other, so
-- payments that omit either field are unaffected.
ALTER TABLE "payments" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "payments_coachingCenterId_idempotencyKey_key" ON "payments"("coachingCenterId", "idempotencyKey");
CREATE UNIQUE INDEX "payments_coachingCenterId_paymentMethod_transactionId_key" ON "payments"("coachingCenterId", "paymentMethod", "transactionId");

-- 4. Student batches: prevent two simultaneously-ACTIVE StudentBatch rows
-- for the same (studentId, batchId) pair at the DB level — the application
-- already tries to check this in assignStudentToBatch, but non-atomically
-- (see lib/services/batch.service.ts). A partial unique index closes the
-- race outright; history (TRANSFERRED/DROPPED rows) is unaffected since
-- they fall outside the WHERE clause. Also not representable in
-- schema.prisma's DSL — same drift note as above.
CREATE UNIQUE INDEX "student_batches_active_membership_key"
  ON "student_batches"("studentId", "batchId")
  WHERE "status" = 'ACTIVE';
