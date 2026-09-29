-- Phase 11: getStudentsList's default (no-filter) query sorts by
-- createdAt desc with no matching index — every other filter/sort column
-- on this table already has one. Purely additive; safe on any existing
-- row count.
CREATE INDEX "students_coachingCenterId_createdAt_idx" ON "students"("coachingCenterId", "createdAt");
