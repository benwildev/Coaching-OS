import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { getSystemSettings, updateSystemSetting } from './settings.service';
import { notifyStudentGuardians } from './guardian-notify.service';
import {
  getCurrentDhakaDateOnly,
  getCurrentDhakaDayOfWeek,
  isScheduleActiveOnDate,
  toDateOnly,
} from '@/lib/schedule';
import { DEFAULT_ATTENDANCE_THRESHOLD } from '@/lib/validations/attendance';
import type { AttendanceStatus, Prisma } from '@prisma/client';

// StudentBatch.joinedAt/endDate are full timestamps (not @db.Date), so a
// student who joins/leaves partway through the calendar day of a class must
// still compare correctly against that class's date-only value. We treat
// eligibility at day granularity: "occurred on or before this calendar day"
// is expressed as "before the START of the NEXT calendar day", never as
// "<=" the target's midnight instant (which would wrongly exclude a
// same-day join whose timestamp has a non-zero time-of-day).
function startOfNextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

// ==========================================
// THRESHOLD (SystemSetting-backed, never hard-coded)
// ==========================================

export async function getAttendanceThreshold(coachingCenterId: string): Promise<number> {
  const settings = await getSystemSettings(coachingCenterId);
  const raw = settings['attendance_threshold'];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_ATTENDANCE_THRESHOLD;
}

export async function setAttendanceThreshold(coachingCenterId: string, threshold: number, actorId?: string) {
  return updateSystemSetting(coachingCenterId, 'attendance_threshold', String(threshold), 'ATTENDANCE', actorId);
}

// ==========================================
// TODAY'S CLASSES (ClassSchedule -> AttendanceSession bridge)
// ==========================================

export interface TodaysClassesParams {
  branchId?: string;
  teacherId?: string; // scopes to a single teacher (self-service)
  date?: string; // defaults to today in Asia/Dhaka
}

export async function getTodaysClasses(coachingCenterId: string, params: TodaysClassesParams = {}) {
  const date = params.date ? toDateOnly(params.date) : getCurrentDhakaDateOnly();
  const dayOfWeek = getCurrentDhakaDayOfWeek(date);

  const where: Prisma.ClassScheduleWhereInput = {
    coachingCenterId,
    status: 'ACTIVE',
    dayOfWeek,
  };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.teacherId) where.teacherId = params.teacherId;

  const schedules = await prisma.classSchedule.findMany({
    where,
    include: {
      batch: { select: { id: true, name: true, banglaName: true, code: true, status: true } },
      subject: { select: { id: true, name: true, banglaName: true } },
      teacher: { select: { id: true, name: true, banglaName: true } },
      room: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const active = schedules.filter((s) => isScheduleActiveOnDate(s, date) && s.batch.status === 'ACTIVE');
  if (active.length === 0) return [];

  const [sessions, eligibleCounts] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { coachingCenterId, classScheduleId: { in: active.map((s) => s.id) }, date },
      select: { id: true, classScheduleId: true, status: true, isIncomplete: true },
    }),
    prisma.studentBatch.groupBy({
      by: ['batchId'],
      where: {
        coachingCenterId,
        batchId: { in: Array.from(new Set(active.map((s) => s.batchId))) },
        joinedAt: { lt: startOfNextDay(date) },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      _count: { _all: true },
    }),
  ]);

  const sessionByScheduleId = new Map(sessions.map((s) => [s.classScheduleId, s]));
  const eligibleByBatch = new Map(eligibleCounts.map((c) => [c.batchId, c._count._all]));

  return active.map((s) => ({
    schedule: s,
    session: sessionByScheduleId.get(s.id) || null,
    eligibleStudentCount: eligibleByBatch.get(s.batchId) || 0,
  }));
}

// ==========================================
// STUDENT ELIGIBILITY (StudentBatch date-window)
// ==========================================

/**
 * Students actively assigned to `batchId` as of `date`, per StudentBatch's
 * joinedAt/endDate window. A student who left before `date` or joined after
 * `date` never appears — this is what keeps historical attendance accurate.
 */
export async function getEligibleStudentsForBatchOnDate(
  coachingCenterId: string,
  batchId: string,
  date: Date
) {
  const memberships = await prisma.studentBatch.findMany({
    where: {
      coachingCenterId,
      batchId,
      joinedAt: { lt: startOfNextDay(date) },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    include: {
      student: {
        select: { id: true, studentIdCode: true, name: true, banglaName: true, status: true },
      },
    },
    orderBy: { student: { name: 'asc' } },
  });
  return memberships.map((m) => m.student);
}

// ==========================================
// ATTENDANCE SESSION LIFECYCLE
// ==========================================

/**
 * Finds or atomically creates the single AttendanceSession for a scheduled
 * class occurrence (classScheduleId + date). Never creates a duplicate for
 * the same occurrence — a second call with the same inputs returns the same
 * row (protected by the (classScheduleId, date) unique constraint).
 */
export async function getOrCreateAttendanceSession(
  coachingCenterId: string,
  classScheduleId: string,
  dateInput: string,
  actorId?: string
) {
  const schedule = await prisma.classSchedule.findFirst({
    where: { id: classScheduleId, coachingCenterId },
  });
  if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');

  const date = toDateOnly(dateInput);

  const existing = await prisma.attendanceSession.findFirst({
    where: { classScheduleId, date },
  });
  if (existing) return existing;

  try {
    const session = await prisma.attendanceSession.create({
      data: {
        coachingCenterId,
        branchId: schedule.branchId,
        batchId: schedule.batchId,
        classScheduleId: schedule.id,
        subjectId: schedule.subjectId,
        teacherId: schedule.teacherId,
        roomId: schedule.roomId,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        date,
        type: 'CLASS',
        status: 'OPEN',
        markedById: actorId,
      },
    });

    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'ATTENDANCE_SESSION_CREATED',
      entity: 'AttendanceSession',
      entityId: session.id,
      details: { batchId: session.batchId, date: dateInput, classScheduleId },
    });

    return session;
  } catch (err) {
    // Race: another request created the same occurrence first — return it instead of failing.
    const race = await prisma.attendanceSession.findFirst({ where: { classScheduleId, date } });
    if (race) return race;
    throw err;
  }
}

export async function getAttendanceSessionDetail(coachingCenterId: string, sessionId: string) {
  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, coachingCenterId },
    include: {
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      subject: { select: { id: true, name: true, banglaName: true } },
      teacher: { select: { id: true, name: true, banglaName: true } },
      room: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
      markedBy: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
      reopenedBy: { select: { id: true, name: true } },
      studentAttendances: true,
    },
  });
  if (!session) return null;

  const eligible = await getEligibleStudentsForBatchOnDate(coachingCenterId, session.batchId, session.date);
  const markByStudent = new Map(session.studentAttendances.map((sa) => [sa.studentId, sa]));

  const students = eligible.map((student) => {
    const mark = markByStudent.get(student.id);
    return {
      student,
      attendance: mark
        ? { id: mark.id, status: mark.status, remarks: mark.remarks, markedAt: mark.markedAt }
        : null,
    };
  });

  const counts = { total: students.length, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  for (const s of students) {
    if (!s.attendance) counts.unmarked++;
    else if (s.attendance.status === 'PRESENT') counts.present++;
    else if (s.attendance.status === 'ABSENT') counts.absent++;
    else if (s.attendance.status === 'LATE') counts.late++;
    else if (s.attendance.status === 'EXCUSED') counts.excused++;
  }

  const { studentAttendances, ...sessionRest } = session;
  return { session: sessionRest, students, counts };
}

function assertSessionEditable(session: { status: string }) {
  if (session.status === 'COMPLETED') {
    throw new Error('SESSION_COMPLETED — reopen this session before editing attendance');
  }
}

export async function markStudentAttendance(
  coachingCenterId: string,
  sessionId: string,
  studentId: string,
  data: { status: AttendanceStatus; remarks?: string | null },
  actorId?: string
) {
  const session = await prisma.attendanceSession.findFirst({ where: { id: sessionId, coachingCenterId } });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  assertSessionEditable(session);

  const eligible = await getEligibleStudentsForBatchOnDate(coachingCenterId, session.batchId, session.date);
  if (!eligible.some((s) => s.id === studentId)) {
    throw new Error('STUDENT_NOT_ELIGIBLE — student was not assigned to this batch on the class date');
  }

  const existing = await prisma.studentAttendance.findUnique({
    where: { attendanceSessionId_studentId: { attendanceSessionId: sessionId, studentId } },
  });

  const mark = await prisma.studentAttendance.upsert({
    where: { attendanceSessionId_studentId: { attendanceSessionId: sessionId, studentId } },
    update: { status: data.status, remarks: data.remarks?.trim() || null, markedAt: new Date() },
    create: {
      attendanceSessionId: sessionId,
      studentId,
      status: data.status,
      remarks: data.remarks?.trim() || null,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: existing ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_MARKED',
    entity: 'StudentAttendance',
    entityId: mark.id,
    details: { sessionId, studentId, status: data.status },
  });

  if (data.status === 'ABSENT' || data.status === 'LATE') {
    const [student, batch] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { name: true } }),
      prisma.batch.findUnique({ where: { id: session.batchId }, select: { name: true } }),
    ]);
    await notifyStudentGuardians({
      coachingCenterId,
      branchId: session.branchId,
      studentId,
      event: data.status === 'ABSENT' ? 'ATTENDANCE_ABSENT' : 'ATTENDANCE_LATE',
      vars: { studentName: student?.name, batchName: batch?.name },
      triggeredById: actorId,
      sourceType: 'StudentAttendance',
      sourceId: mark.id,
    });
  }

  return mark;
}

export async function bulkMarkAttendance(
  coachingCenterId: string,
  sessionId: string,
  data: { marks: Array<{ studentId: string; status: AttendanceStatus; remarks?: string | null }>; markAllPresent?: boolean },
  actorId?: string
) {
  const session = await prisma.attendanceSession.findFirst({ where: { id: sessionId, coachingCenterId } });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  assertSessionEditable(session);

  const eligible = await getEligibleStudentsForBatchOnDate(coachingCenterId, session.batchId, session.date);
  const eligibleIds = new Set(eligible.map((s) => s.id));

  const entries = data.markAllPresent
    ? eligible.map((s) => ({ studentId: s.id, status: 'PRESENT' as AttendanceStatus, remarks: null as string | null }))
    : data.marks.filter((m) => eligibleIds.has(m.studentId));

  if (entries.length === 0) return { updated: 0 };

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.studentAttendance.upsert({
        where: { attendanceSessionId_studentId: { attendanceSessionId: sessionId, studentId: entry.studentId } },
        update: { status: entry.status, remarks: entry.remarks?.trim() || null, markedAt: new Date() },
        create: {
          attendanceSessionId: sessionId,
          studentId: entry.studentId,
          status: entry.status,
          remarks: entry.remarks?.trim() || null,
        },
      })
    )
  );

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'ATTENDANCE_MARKED',
    entity: 'AttendanceSession',
    entityId: sessionId,
    details: { count: entries.length, markAllPresent: !!data.markAllPresent },
  });

  return { updated: entries.length };
}

export async function completeAttendanceSession(
  coachingCenterId: string,
  sessionId: string,
  allowIncomplete: boolean,
  actorId?: string
) {
  const session = await prisma.attendanceSession.findFirst({ where: { id: sessionId, coachingCenterId } });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status === 'COMPLETED') throw new Error('SESSION_ALREADY_COMPLETED');

  const [eligible, marked] = await Promise.all([
    getEligibleStudentsForBatchOnDate(coachingCenterId, session.batchId, session.date),
    prisma.studentAttendance.findMany({ where: { attendanceSessionId: sessionId }, select: { studentId: true } }),
  ]);
  const markedIds = new Set(marked.map((m) => m.studentId));
  const unmarkedCount = eligible.filter((s) => !markedIds.has(s.id)).length;

  if (unmarkedCount > 0 && !allowIncomplete) {
    const err = new Error('UNMARKED_STUDENTS');
    (err as any).unmarkedCount = unmarkedCount;
    throw err;
  }

  const updated = await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      isIncomplete: unmarkedCount > 0,
      completedAt: new Date(),
      completedById: actorId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'ATTENDANCE_COMPLETED',
    entity: 'AttendanceSession',
    entityId: sessionId,
    details: { isIncomplete: unmarkedCount > 0, unmarkedCount },
  });

  await notifyLowAttendanceForSession(coachingCenterId, session.batchId, sessionId, marked.map((m) => m.studentId), actorId);

  return updated;
}

/**
 * After a session completes, checks the students just marked in it against
 * the running attendance threshold and notifies guardians who newly fall
 * below it. sourceId is the session id, so re-completing the same session
 * (blocked by SESSION_ALREADY_COMPLETED unless reopened first) never
 * double-fires for the same completion event.
 */
async function notifyLowAttendanceForSession(
  coachingCenterId: string,
  batchId: string,
  sessionId: string,
  markedStudentIds: string[],
  actorId?: string
) {
  if (markedStudentIds.length === 0) return;
  const threshold = await getAttendanceThreshold(coachingCenterId);

  const [batch, marks] = await Promise.all([
    prisma.batch.findUnique({ where: { id: batchId }, select: { name: true, branchId: true } }),
    prisma.studentAttendance.findMany({
      where: {
        studentId: { in: markedStudentIds },
        attendanceSession: { coachingCenterId, status: 'COMPLETED', batchId },
      },
      select: { studentId: true, status: true },
    }),
  ]);

  const byStudent = new Map<string, { present: number; absent: number; late: number }>();
  for (const m of marks) {
    const bucket = byStudent.get(m.studentId) || { present: 0, absent: 0, late: 0 };
    if (m.status === 'PRESENT') bucket.present++;
    else if (m.status === 'ABSENT') bucket.absent++;
    else if (m.status === 'LATE') bucket.late++;
    byStudent.set(m.studentId, bucket);
  }

  for (const studentId of markedStudentIds) {
    const bucket = byStudent.get(studentId);
    if (!bucket) continue;
    const percentage = computePercentage(bucket);
    const total = bucket.present + bucket.absent + bucket.late;
    if (total === 0 || percentage >= threshold) continue;

    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true } });
    await notifyStudentGuardians({
      coachingCenterId,
      branchId: batch?.branchId,
      studentId,
      event: 'ATTENDANCE_LOW',
      vars: { studentName: student?.name, batchName: batch?.name },
      triggeredById: actorId,
      sourceType: 'AttendanceSession',
      sourceId: sessionId,
    });
  }
}

export async function reopenAttendanceSession(
  coachingCenterId: string,
  sessionId: string,
  reason: string,
  actorId?: string
) {
  const session = await prisma.attendanceSession.findFirst({ where: { id: sessionId, coachingCenterId } });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'COMPLETED') throw new Error('SESSION_NOT_COMPLETED');

  const updated = await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: {
      status: 'OPEN',
      reopenedAt: new Date(),
      reopenedById: actorId,
      reopenReason: reason.trim(),
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'ATTENDANCE_REOPENED',
    entity: 'AttendanceSession',
    entityId: sessionId,
    details: { reason: reason.trim() },
  });

  return updated;
}

// ==========================================
// HISTORY
// ==========================================

export interface AttendanceHistoryParams {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  academicSessionId?: string;
  programId?: string;
  classId?: string;
  groupId?: string;
  batchId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getAttendanceHistory(coachingCenterId: string, params: AttendanceHistoryParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.AttendanceSessionWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.batchId && params.batchId !== 'all') where.batchId = params.batchId;
  if (params.subjectId && params.subjectId !== 'all') where.subjectId = params.subjectId;
  if (params.teacherId && params.teacherId !== 'all') where.teacherId = params.teacherId;
  if (params.status && params.status !== 'all') where.status = params.status;
  if (params.dateFrom || params.dateTo) {
    where.date = {};
    if (params.dateFrom) where.date.gte = toDateOnly(params.dateFrom);
    if (params.dateTo) where.date.lte = toDateOnly(params.dateTo);
  }
  if (params.academicSessionId || params.programId || params.classId || params.groupId) {
    where.batch = {
      ...(params.academicSessionId && params.academicSessionId !== 'all' ? { academicSessionId: params.academicSessionId } : {}),
      ...(params.programId && params.programId !== 'all' ? { academicProgramId: params.programId } : {}),
      ...(params.classId && params.classId !== 'all' ? { academicClassId: params.classId } : {}),
      ...(params.groupId && params.groupId !== 'all' ? { academicGroupId: params.groupId } : {}),
    };
  }

  const [total, sessions] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: 'desc' },
      include: {
        batch: { select: { id: true, name: true, banglaName: true, code: true } },
        subject: { select: { id: true, name: true, banglaName: true } },
        teacher: { select: { id: true, name: true, banglaName: true } },
        room: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true } },
        studentAttendances: { select: { status: true } },
      },
    }),
  ]);

  const enriched = sessions.map((s) => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const sa of s.studentAttendances) {
      if (sa.status === 'PRESENT') counts.present++;
      else if (sa.status === 'ABSENT') counts.absent++;
      else if (sa.status === 'LATE') counts.late++;
      else if (sa.status === 'EXCUSED') counts.excused++;
    }
    const { studentAttendances, ...rest } = s;
    return { ...rest, counts, markedCount: s.studentAttendances.length };
  });

  return { sessions: enriched, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ==========================================
// ATTENDANCE PERCENTAGE
// ==========================================
//
// Attendance percentage = (PRESENT + LATE) / (PRESENT + LATE + ABSENT),
// counted only across COMPLETED sessions where the student actually has a
// recorded mark, for batches the student was assigned to on that session's
// date (per StudentBatch's join/leave window).
//
// EXCUSED sessions are excluded entirely from both numerator and
// denominator — an excused absence never counts against the student.
// Unmarked sessions (no StudentAttendance row) are excluded too, since an
// un-recorded class is a data-entry gap, not evidence the student was
// absent.

function computePercentage(counts: { present: number; absent: number; late: number }): number {
  const denominator = counts.present + counts.absent + counts.late;
  if (denominator === 0) return 0;
  return Math.round(((counts.present + counts.late) / denominator) * 1000) / 10; // one decimal place
}

export async function getStudentAttendanceSummary(coachingCenterId: string, studentId: string, batchId?: string) {
  const memberships = await prisma.studentBatch.findMany({
    where: { coachingCenterId, studentId, ...(batchId ? { batchId } : {}) },
    select: { batchId: true },
  });
  const batchIds = Array.from(new Set(memberships.map((m) => m.batchId)));
  if (batchIds.length === 0) {
    return { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0, recent: [] };
  }

  const marks = await prisma.studentAttendance.findMany({
    where: {
      studentId,
      attendanceSession: { coachingCenterId, status: 'COMPLETED', batchId: { in: batchIds } },
    },
    include: {
      attendanceSession: {
        select: {
          id: true,
          date: true,
          batchId: true,
          batch: { select: { name: true, banglaName: true } },
          subject: { select: { name: true, banglaName: true } },
        },
      },
    },
    orderBy: { attendanceSession: { date: 'desc' } },
  });

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of marks) {
    if (m.status === 'PRESENT') counts.present++;
    else if (m.status === 'ABSENT') counts.absent++;
    else if (m.status === 'LATE') counts.late++;
    else if (m.status === 'EXCUSED') counts.excused++;
  }

  return {
    total: marks.length,
    ...counts,
    percentage: computePercentage(counts),
    recent: marks.slice(0, 20).map((m) => ({
      id: m.id,
      status: m.status,
      date: m.attendanceSession.date,
      batchName: m.attendanceSession.batch.name,
      subjectName: m.attendanceSession.subject?.name,
    })),
  };
}

export interface StudentAttendanceRecordParams {
  batchId?: string;
  subjectId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/** Paginated, filterable date-wise attendance list for one student (portal use — AGENTS.md §8). */
export async function getStudentAttendanceRecords(coachingCenterId: string, studentId: string, params: StudentAttendanceRecordParams = {}) {
  const memberships = await prisma.studentBatch.findMany({
    where: { coachingCenterId, studentId, ...(params.batchId ? { batchId: params.batchId } : {}) },
    select: { batchId: true },
  });
  const batchIds = Array.from(new Set(memberships.map((m) => m.batchId)));
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  if (batchIds.length === 0) {
    return { records: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };
  }

  const where: Prisma.StudentAttendanceWhereInput = {
    studentId,
    attendanceSession: {
      coachingCenterId,
      status: 'COMPLETED',
      batchId: { in: batchIds },
      ...(params.subjectId ? { subjectId: params.subjectId } : {}),
      ...(params.dateFrom || params.dateTo
        ? { date: { ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}), ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}) } }
        : {}),
    },
  };

  const [total, marks] = await Promise.all([
    prisma.studentAttendance.count({ where }),
    prisma.studentAttendance.findMany({
      where,
      include: {
        attendanceSession: {
          select: {
            date: true,
            batch: { select: { id: true, name: true, banglaName: true } },
            subject: { select: { id: true, name: true, banglaName: true } },
          },
        },
      },
      orderBy: { attendanceSession: { date: 'desc' } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    records: marks.map((m) => ({
      id: m.id,
      status: m.status,
      date: m.attendanceSession.date,
      inTime: m.inTime,
      remarks: m.remarks,
      batch: m.attendanceSession.batch,
      subject: m.attendanceSession.subject,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getBatchAttendanceSummary(coachingCenterId: string, batchId: string) {
  const today = getCurrentDhakaDateOnly();

  const [todaysSessions, history, activeMemberships] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { coachingCenterId, batchId, date: today },
      include: {
        subject: { select: { id: true, name: true, banglaName: true } },
        teacher: { select: { id: true, name: true, banglaName: true } },
      },
    }),
    prisma.attendanceSession.findMany({
      where: { coachingCenterId, batchId },
      orderBy: { date: 'desc' },
      take: 30,
      include: {
        subject: { select: { id: true, name: true, banglaName: true } },
        studentAttendances: { select: { status: true } },
      },
    }),
    prisma.studentBatch.findMany({
      where: { coachingCenterId, batchId, status: 'ACTIVE' },
      include: { student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } } },
    }),
  ]);

  const historyEnriched = history.map((s) => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const sa of s.studentAttendances) {
      if (sa.status === 'PRESENT') counts.present++;
      else if (sa.status === 'ABSENT') counts.absent++;
      else if (sa.status === 'LATE') counts.late++;
      else if (sa.status === 'EXCUSED') counts.excused++;
    }
    const { studentAttendances, ...rest } = s;
    return { ...rest, counts };
  });

  // Per-student summary across all COMPLETED sessions for this batch.
  const completedSessionIds = history.filter((s) => s.status === 'COMPLETED').map((s) => s.id);
  const allMarks =
    completedSessionIds.length > 0
      ? await prisma.studentAttendance.findMany({
          where: { attendanceSessionId: { in: completedSessionIds } },
          select: { studentId: true, status: true },
        })
      : [];

  const marksByStudent = new Map<string, { present: number; absent: number; late: number; excused: number }>();
  for (const m of allMarks) {
    const bucket = marksByStudent.get(m.studentId) || { present: 0, absent: 0, late: 0, excused: 0 };
    if (m.status === 'PRESENT') bucket.present++;
    else if (m.status === 'ABSENT') bucket.absent++;
    else if (m.status === 'LATE') bucket.late++;
    else if (m.status === 'EXCUSED') bucket.excused++;
    marksByStudent.set(m.studentId, bucket);
  }

  const studentSummary = activeMemberships.map((m) => {
    const bucket = marksByStudent.get(m.studentId) || { present: 0, absent: 0, late: 0, excused: 0 };
    return {
      student: m.student,
      total: bucket.present + bucket.absent + bucket.late + bucket.excused,
      ...bucket,
      percentage: computePercentage(bucket),
    };
  });

  return { todaysSessions, history: historyEnriched, studentSummary };
}

// ==========================================
// LOW ATTENDANCE / ALERTS
// ==========================================

export async function getLowAttendanceStudents(
  coachingCenterId: string,
  params: { branchId?: string; threshold?: number } = {}
) {
  const threshold = params.threshold ?? (await getAttendanceThreshold(coachingCenterId));

  const memberships = await prisma.studentBatch.findMany({
    where: {
      coachingCenterId,
      status: 'ACTIVE',
      ...(params.branchId && params.branchId !== 'all' ? { batch: { branchId: params.branchId } } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          studentIdCode: true,
          name: true,
          banglaName: true,
          studentGuardians: {
            where: { isPrimary: true },
            include: { guardian: { select: { name: true, phone: true } } },
            take: 1,
          },
        },
      },
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
    },
  });

  if (memberships.length === 0) return [];

  const batchIds = Array.from(new Set(memberships.map((m) => m.batchId)));
  const marks = await prisma.studentAttendance.findMany({
    where: {
      attendanceSession: { coachingCenterId, status: 'COMPLETED', batchId: { in: batchIds } },
      studentId: { in: memberships.map((m) => m.studentId) },
    },
    select: { studentId: true, status: true, attendanceSession: { select: { batchId: true } } },
  });

  const marksByStudentBatch = new Map<string, { present: number; absent: number; late: number }>();
  for (const m of marks) {
    const key = `${m.studentId}:${m.attendanceSession.batchId}`;
    const bucket = marksByStudentBatch.get(key) || { present: 0, absent: 0, late: 0 };
    if (m.status === 'PRESENT') bucket.present++;
    else if (m.status === 'ABSENT') bucket.absent++;
    else if (m.status === 'LATE') bucket.late++;
    marksByStudentBatch.set(key, bucket);
  }

  const results = memberships
    .map((m) => {
      const bucket = marksByStudentBatch.get(`${m.studentId}:${m.batchId}`) || { present: 0, absent: 0, late: 0 };
      const percentage = computePercentage(bucket);
      const guardian = m.student.studentGuardians[0]?.guardian || null;
      return {
        student: { id: m.student.id, studentIdCode: m.student.studentIdCode, name: m.student.name, banglaName: m.student.banglaName },
        batch: m.batch,
        totalSessions: bucket.present + bucket.absent + bucket.late,
        percentage,
        guardian,
      };
    })
    .filter((r) => r.totalSessions > 0 && r.percentage < threshold)
    .sort((a, b) => a.percentage - b.percentage);

  return results;
}

// ==========================================
// DASHBOARD KPIs
// ==========================================

export async function getAttendanceDashboard(coachingCenterId: string, branchId?: string) {
  const today = getCurrentDhakaDateOnly();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const sessionWhere: Prisma.AttendanceSessionWhereInput = { coachingCenterId };
  if (branchId && branchId !== 'all') sessionWhere.branchId = branchId;

  const [todaysSessions, todaysMarks, recentMarks] = await Promise.all([
    prisma.attendanceSession.count({ where: { ...sessionWhere, date: today } }),
    prisma.studentAttendance.findMany({
      where: { attendanceSession: { ...sessionWhere, date: today } },
      select: { status: true },
    }),
    prisma.studentAttendance.findMany({
      where: { attendanceSession: { ...sessionWhere, status: 'COMPLETED', date: { gte: thirtyDaysAgo, lte: today } } },
      select: { status: true },
    }),
  ]);

  const todaysCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of todaysMarks) {
    if (m.status === 'PRESENT') todaysCounts.present++;
    else if (m.status === 'ABSENT') todaysCounts.absent++;
    else if (m.status === 'LATE') todaysCounts.late++;
    else if (m.status === 'EXCUSED') todaysCounts.excused++;
  }

  const recentCounts = { present: 0, absent: 0, late: 0 };
  for (const m of recentMarks) {
    if (m.status === 'PRESENT') recentCounts.present++;
    else if (m.status === 'ABSENT') recentCounts.absent++;
    else if (m.status === 'LATE') recentCounts.late++;
  }

  return {
    todaysSessions,
    todaysPresent: todaysCounts.present,
    todaysAbsent: todaysCounts.absent,
    todaysLate: todaysCounts.late,
    todaysExcused: todaysCounts.excused,
    averageAttendance: computePercentage(recentCounts),
    hasAnyData: todaysSessions > 0 || recentMarks.length > 0,
  };
}

// ==========================================
// TEACHER ATTENDANCE (separate from student attendance)
// ==========================================

export async function recordTeacherAttendance(
  coachingCenterId: string,
  data: { teacherId: string; date: string; status: AttendanceStatus; inTime?: string | null; outTime?: string | null; remarks?: string | null },
  actorId?: string
) {
  const teacher = await prisma.teacher.findFirst({ where: { id: data.teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND');

  const date = toDateOnly(data.date);
  const record = await prisma.teacherAttendance.upsert({
    where: { teacherId_date: { teacherId: data.teacherId, date } },
    update: {
      status: data.status,
      inTime: data.inTime?.trim() || null,
      outTime: data.outTime?.trim() || null,
      remarks: data.remarks?.trim() || null,
    },
    create: {
      coachingCenterId,
      teacherId: data.teacherId,
      date,
      status: data.status,
      inTime: data.inTime?.trim() || null,
      outTime: data.outTime?.trim() || null,
      remarks: data.remarks?.trim() || null,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_ATTENDANCE_MARKED',
    entity: 'TeacherAttendance',
    entityId: record.id,
    details: { teacherId: data.teacherId, date: data.date, status: data.status },
  });

  return record;
}

export async function getTeacherAttendanceHistory(coachingCenterId: string, teacherId: string, limit = 30) {
  return prisma.teacherAttendance.findMany({
    where: { coachingCenterId, teacherId },
    orderBy: { date: 'desc' },
    take: limit,
  });
}
