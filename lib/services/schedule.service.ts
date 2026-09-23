import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { dateRangesOverlap, parseTimeToMinutes, timeRangesOverlap } from '@/lib/schedule';
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

export async function createClassSchedule(
  coachingCenterId: string,
  input: ClassScheduleInput,
  actorId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id: input.batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');

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
