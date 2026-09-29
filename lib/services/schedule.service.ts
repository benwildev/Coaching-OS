import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { dateRangesOverlap, isScheduleActiveOnDate, parseTimeToMinutes, timeRangesOverlap, getCurrentDhakaDateOnly, WEEK_ORDER } from '@/lib/schedule';
import type { ClassScheduleInput } from '@/lib/validations/schedule';
import type { DayOfWeek, Prisma } from '@prisma/client';

export interface ScheduleConflict {
  type: 'TEACHER' | 'ROOM' | 'BATCH';
  message: string;
  conflictingScheduleId: string;
}

interface ConflictCheckInput {
  coachingCenterId: string;
  batchId: string;
  teacherId?: string | null;
  roomId?: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  effectiveStartDate?: Date | null;
  effectiveEndDate?: Date | null;
  excludeScheduleId?: string;
}

/**
 * Detects teacher, room, and batch double-booking for a candidate schedule
 * slot. Pulls only same-day, same-tenant, ACTIVE schedules and compares
 * time + effective-date ranges in-process (Prisma cannot express interval
 * overlap portably across the supported databases).
 */
export async function detectScheduleConflicts(input: ConflictCheckInput): Promise<ScheduleConflict[]> {
  const startMin = parseTimeToMinutes(input.startTime);
  const endMin = parseTimeToMinutes(input.endTime);

  const candidates = await prisma.classSchedule.findMany({
    where: {
      coachingCenterId: input.coachingCenterId,
      dayOfWeek: input.dayOfWeek,
      status: 'ACTIVE',
      ...(input.excludeScheduleId ? { NOT: { id: input.excludeScheduleId } } : {}),
      OR: [
        input.teacherId ? { teacherId: input.teacherId } : undefined,
        input.roomId ? { roomId: input.roomId } : undefined,
        { batchId: input.batchId },
      ].filter(Boolean) as Prisma.ClassScheduleWhereInput[],
    },
    include: {
      batch: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, name: true } },
      room: { select: { id: true, name: true, code: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  const conflicts: ScheduleConflict[] = [];

  for (const c of candidates) {
    const cStart = parseTimeToMinutes(c.startTime);
    const cEnd = parseTimeToMinutes(c.endTime);
    if (!timeRangesOverlap(startMin, endMin, cStart, cEnd)) continue;
    if (
      !dateRangesOverlap(
        input.effectiveStartDate,
        input.effectiveEndDate,
        c.effectiveStartDate,
        c.effectiveEndDate
      )
    )
      continue;

    if (input.teacherId && c.teacherId === input.teacherId) {
      conflicts.push({
        type: 'TEACHER',
        message: `${c.teacher?.name || 'This teacher'} already has a class (${c.subject.name} · ${c.batch.name}) during this time.`,
        conflictingScheduleId: c.id,
      });
    }
    if (input.roomId && c.roomId === input.roomId) {
      conflicts.push({
        type: 'ROOM',
        message: `${c.room?.name || 'This room'} is already assigned to ${c.batch.name} during this time.`,
        conflictingScheduleId: c.id,
      });
    }
    if (c.batchId === input.batchId) {
      conflicts.push({
        type: 'BATCH',
        message: `${c.batch.name} already has a class (${c.subject.name}) during this time.`,
        conflictingScheduleId: c.id,
      });
    }
  }

  return conflicts;
}

export interface StudentBatchConflict {
  conflictingBatchId: string;
  conflictingBatchName: string;
  message: string;
}

/**
 * Phase 10.5: does a candidate batch's weekly schedule genuinely overlap
 * with any batch the student is ALREADY actively enrolled in? Reuses the
 * same time/date-overlap primitives as detectScheduleConflicts, but from
 * the student's perspective — a student may legitimately be in two batches
 * (e.g. a Physics batch and a separate Chemistry batch) as long as their
 * class times don't actually clash on the same day.
 */
export async function detectStudentBatchConflicts(
  coachingCenterId: string,
  studentId: string,
  candidateBatchId: string
): Promise<StudentBatchConflict[]> {
  const otherActiveBatchIds = (
    await prisma.studentBatch.findMany({
      where: { coachingCenterId, studentId, status: 'ACTIVE', batchId: { not: candidateBatchId } },
      select: { batchId: true },
    })
  ).map((sb) => sb.batchId);

  if (otherActiveBatchIds.length === 0) return [];

  const [candidateSchedules, existingSchedules] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { coachingCenterId, batchId: candidateBatchId, status: 'ACTIVE' },
    }),
    prisma.classSchedule.findMany({
      where: { coachingCenterId, batchId: { in: otherActiveBatchIds }, status: 'ACTIVE' },
      include: { batch: { select: { id: true, name: true } } },
    }),
  ]);

  if (candidateSchedules.length === 0 || existingSchedules.length === 0) return [];

  const conflicts: StudentBatchConflict[] = [];
  for (const cand of candidateSchedules) {
    const candStart = parseTimeToMinutes(cand.startTime);
    const candEnd = parseTimeToMinutes(cand.endTime);
    for (const ex of existingSchedules) {
      if (ex.dayOfWeek !== cand.dayOfWeek) continue;
      if (!timeRangesOverlap(candStart, candEnd, parseTimeToMinutes(ex.startTime), parseTimeToMinutes(ex.endTime))) continue;
      if (!dateRangesOverlap(cand.effectiveStartDate, cand.effectiveEndDate, ex.effectiveStartDate, ex.effectiveEndDate)) continue;

      conflicts.push({
        conflictingBatchId: ex.batch.id,
        conflictingBatchName: ex.batch.name,
        message: `Clashes with an existing class in ${ex.batch.name} on ${ex.dayOfWeek} at the same time.`,
      });
    }
  }
  return conflicts;
}

export interface StudentTimetableEntry {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  subjectName: string;
  subjectBanglaName: string | null;
  batchName: string;
  teacherName: string | null;
  roomName: string | null;
}

/**
 * Phase 10.5: the student portal's REAL weekly timetable — built from
 * ClassSchedule for the student's own currently-ACTIVE batch(es), never a
 * static mock. Respects effective dates (a schedule that hasn't started
 * yet, or already ended, is excluded) the same way detectScheduleConflicts
 * and getTodaysClasses do. Grouped by day in the Bangladesh week order
 * (Saturday-first) by the caller; this returns a flat, time-sorted list.
 */
export async function getStudentTimetable(coachingCenterId: string, studentId: string): Promise<StudentTimetableEntry[]> {
  const activeBatchIds = (
    await prisma.studentBatch.findMany({
      where: { coachingCenterId, studentId, status: 'ACTIVE' },
      select: { batchId: true },
    })
  ).map((sb) => sb.batchId);

  if (activeBatchIds.length === 0) return [];

  const today = getCurrentDhakaDateOnly();
  const schedules = await prisma.classSchedule.findMany({
    where: { coachingCenterId, batchId: { in: activeBatchIds }, status: 'ACTIVE' },
    include: {
      batch: { select: { name: true } },
      subject: { select: { name: true, banglaName: true } },
      teacher: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return schedules
    .filter((s) => isScheduleActiveOnDate(s, today))
    .map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      subjectName: s.subject.name,
      subjectBanglaName: s.subject.banglaName,
      batchName: s.batch.name,
      teacherName: s.teacher?.name ?? null,
      roomName: s.room?.name ?? null,
    }))
    .sort((a, b) => {
      const dayDiff = WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek);
      if (dayDiff !== 0) return dayDiff;
      return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
    });
}

export interface ScheduleFilterParams {
  branchId?: string;
  batchId?: string;
  teacherId?: string;
  roomId?: string;
  dayOfWeek?: DayOfWeek;
  status?: string;
}

export async function getSchedulesList(coachingCenterId: string, params: ScheduleFilterParams = {}) {
  const where: Prisma.ClassScheduleWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.batchId && params.batchId !== 'all') where.batchId = params.batchId;
  if (params.teacherId && params.teacherId !== 'all') where.teacherId = params.teacherId;
  if (params.roomId && params.roomId !== 'all') where.roomId = params.roomId;
  if (params.dayOfWeek) where.dayOfWeek = params.dayOfWeek;
  if (params.status && params.status !== 'all') where.status = params.status;
  else where.status = 'ACTIVE';

  return prisma.classSchedule.findMany({
    where,
    include: {
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      subject: { select: { id: true, name: true, banglaName: true } },
      teacher: { select: { id: true, name: true, banglaName: true } },
      room: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

/**
 * Verifies every id referenced by a ClassSchedule actually belongs to this
 * tenant before it's persisted. `assertBranchAccess` alone only checks a
 * branch-locked caller's own branch — it never verifies an id belongs to
 * the caller's tenant at all, and OWNER/ADMIN (or any center-wide caller)
 * bypass it entirely, so without this a valid cuid guessed/known from
 * another tenant would be silently accepted by the database (plain FKs,
 * no tenant-composite constraint).
 */
async function assertScheduleRefsBelongToTenant(
  coachingCenterId: string,
  input: Pick<ClassScheduleInput, 'branchId' | 'subjectId' | 'teacherId' | 'roomId'>
) {
  const [branch, subject, teacher, room] = await Promise.all([
    prisma.branch.findFirst({ where: { id: input.branchId, coachingCenterId } }),
    prisma.subject.findFirst({ where: { id: input.subjectId, coachingCenterId } }),
    input.teacherId ? prisma.teacher.findFirst({ where: { id: input.teacherId, coachingCenterId } }) : null,
    input.roomId ? prisma.room.findFirst({ where: { id: input.roomId, coachingCenterId } }) : null,
  ]);
  if (!branch) throw new Error('BRANCH_NOT_FOUND');
  if (!subject) throw new Error('SUBJECT_NOT_FOUND');
  if (input.teacherId && !teacher) throw new Error('TEACHER_NOT_FOUND');
  if (input.roomId && !room) throw new Error('ROOM_NOT_FOUND');
}

export async function createClassSchedule(
  coachingCenterId: string,
  input: ClassScheduleInput,
  actorId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id: input.batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  await assertScheduleRefsBelongToTenant(coachingCenterId, input);

  const effectiveStartDate = toDate(input.effectiveStartDate);
  const effectiveEndDate = toDate(input.effectiveEndDate);

  if (!input.overrideConflicts) {
    const conflicts = await detectScheduleConflicts({
      coachingCenterId,
      batchId: input.batchId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveStartDate,
      effectiveEndDate,
    });
    if (conflicts.length) {
      const err = new Error(conflicts.map((c) => c.message).join(' '));
      (err as any).conflicts = conflicts;
      throw err;
    }
  }

  const schedule = await prisma.classSchedule.create({
    data: {
      coachingCenterId,
      branchId: input.branchId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveStartDate,
      effectiveEndDate,
      status: input.status ?? 'ACTIVE',
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'SCHEDULE_CREATED',
    entity: 'ClassSchedule',
    entityId: schedule.id,
    details: { batchId: schedule.batchId, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime },
  });

  return schedule;
}

export async function updateClassSchedule(
  coachingCenterId: string,
  scheduleId: string,
  input: ClassScheduleInput,
  actorId?: string
) {
  const existing = await prisma.classSchedule.findFirst({ where: { id: scheduleId, coachingCenterId } });
  if (!existing) throw new Error('SCHEDULE_NOT_FOUND');

  const batch = await prisma.batch.findFirst({ where: { id: input.batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  await assertScheduleRefsBelongToTenant(coachingCenterId, input);

  const effectiveStartDate = toDate(input.effectiveStartDate);
  const effectiveEndDate = toDate(input.effectiveEndDate);

  if (!input.overrideConflicts && input.status !== 'CANCELLED') {
    const conflicts = await detectScheduleConflicts({
      coachingCenterId,
      batchId: input.batchId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveStartDate,
      effectiveEndDate,
      excludeScheduleId: scheduleId,
    });
    if (conflicts.length) {
      const err = new Error(conflicts.map((c) => c.message).join(' '));
      (err as any).conflicts = conflicts;
      throw err;
    }
  }

  const schedule = await prisma.classSchedule.update({
    where: { id: scheduleId },
    data: {
      branchId: input.branchId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: input.teacherId || null,
      roomId: input.roomId || null,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveStartDate,
      effectiveEndDate,
      status: input.status ?? existing.status,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'SCHEDULE_UPDATED',
    entity: 'ClassSchedule',
    entityId: schedule.id,
    details: { batchId: schedule.batchId, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime },
  });

  return schedule;
}

export async function deleteClassSchedule(coachingCenterId: string, scheduleId: string, actorId?: string) {
  const existing = await prisma.classSchedule.findFirst({ where: { id: scheduleId, coachingCenterId } });
  if (!existing) throw new Error('SCHEDULE_NOT_FOUND');

  await prisma.classSchedule.delete({ where: { id: scheduleId } });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'SCHEDULE_DELETED',
    entity: 'ClassSchedule',
    entityId: scheduleId,
    details: { batchId: existing.batchId, dayOfWeek: existing.dayOfWeek, startTime: existing.startTime },
  });
}
