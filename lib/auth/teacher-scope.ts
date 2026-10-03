import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { getCurrentDhakaDateOnly, toDateOnly } from '@/lib/schedule';
import { getTeacherByUserId } from '@/lib/services/teacher.service';

/**
 * Returns the start of the next calendar day (midnight + 24 hours).
 * Used for date-bounded comparisons (e.g. joinedAt, startDate) where a timestamp
 * might carry non-zero time-of-day on the target date.
 */
export function startOfNextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Returns UTC-midnight of the given date.
 */
export function startOfDay(date: Date): Date {
  return toDateOnly(date);
}

/**
 * Resolves all batch IDs actively assigned to a teacher.
 * Must respect:
 *  - BatchTeacherAssignment.status === 'ACTIVE'
 *  - startDate <= referenceDate (in Asia/Dhaka)
 *  - endDate is null OR endDate >= referenceDate (in Asia/Dhaka)
 */
export async function getTeacherAuthorizedBatchIds(
  coachingCenterId: string,
  teacherId: string,
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<string[]> {
  const refDate = toDateOnly(referenceDate);
  const nextDay = startOfNextDay(refDate);

  const assignments = await prisma.batchTeacherAssignment.findMany({
    where: {
      coachingCenterId,
      teacherId,
      status: 'ACTIVE',
      startDate: { lt: nextDay },
      OR: [
        { endDate: null },
        { endDate: { gte: refDate } },
      ],
    },
    select: { batchId: true },
  });

  return Array.from(new Set(assignments.map((a) => a.batchId)));
}

/**
 * Resolves all student IDs actively enrolled in the teacher's authorized batches.
 * A student is authorized when:
 *  - They have an ACTIVE StudentBatch membership in one of the teacher's authorized batches
 *  - Student.status === 'ACTIVE'
 *  - joinedAt <= referenceDate
 *  - endDate is null OR endDate >= referenceDate
 */
export async function getTeacherAuthorizedStudentIds(
  coachingCenterId: string,
  teacherId: string,
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<string[]> {
  const batchIds = await getTeacherAuthorizedBatchIds(coachingCenterId, teacherId, referenceDate);
  if (batchIds.length === 0) return [];

  const refDate = toDateOnly(referenceDate);
  const nextDay = startOfNextDay(refDate);

  const memberships = await prisma.studentBatch.findMany({
    where: {
      coachingCenterId,
      batchId: { in: batchIds },
      status: 'ACTIVE',
      student: { status: 'ACTIVE' },
      joinedAt: { lt: nextDay },
      OR: [
        { endDate: null },
        { endDate: { gte: refDate } },
      ],
    },
    select: { studentId: true },
  });

  return Array.from(new Set(memberships.map((m) => m.studentId)));
}

/**
 * Resolves all course IDs derived from courses containing the teacher's authorized batches.
 */
export async function getTeacherAuthorizedCourseIds(
  coachingCenterId: string,
  teacherId: string,
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<string[]> {
  const batchIds = await getTeacherAuthorizedBatchIds(coachingCenterId, teacherId, referenceDate);
  if (batchIds.length === 0) return [];

  const batches = await prisma.batch.findMany({
    where: {
      coachingCenterId,
      id: { in: batchIds },
      courseId: { not: null },
    },
    select: { courseId: true },
  });

  const courseIds = batches.map((b) => b.courseId).filter((id): id is string => Boolean(id));
  return Array.from(new Set(courseIds));
}

/**
 * Asserts that the authenticated user can access the target batch.
 *  - OWNER / ADMIN / STAFF: passes through (branch access handled by assertBranchAccess).
 *  - TEACHER: must have an active assignment to the batch on referenceDate.
 */
export async function assertTeacherCanAccessBatch(
  user: SessionUser,
  batchId: string,
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  const teacher = await getTeacherByUserId(user.coachingCenterId, user.userId);
  if (!teacher) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  const authorizedBatchIds = await getTeacherAuthorizedBatchIds(
    user.coachingCenterId,
    teacher.id,
    referenceDate
  );

  if (!authorizedBatchIds.includes(batchId)) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }
}

/**
 * Asserts that the authenticated user can access the target student.
 *  - OWNER / ADMIN / STAFF: passes through.
 *  - TEACHER: student must be actively associated with a batch taught by the teacher.
 */
export async function assertTeacherCanAccessStudent(
  user: SessionUser,
  studentId: string,
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  const teacher = await getTeacherByUserId(user.coachingCenterId, user.userId);
  if (!teacher) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  const authorizedBatchIds = await getTeacherAuthorizedBatchIds(
    user.coachingCenterId,
    teacher.id,
    referenceDate
  );
  if (authorizedBatchIds.length === 0) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  const refDate = toDateOnly(referenceDate);
  const nextDay = startOfNextDay(refDate);

  const activeMembership = await prisma.studentBatch.findFirst({
    where: {
      coachingCenterId: user.coachingCenterId,
      studentId,
      batchId: { in: authorizedBatchIds },
      status: 'ACTIVE',
      joinedAt: { lt: nextDay },
      OR: [
        { endDate: null },
        { endDate: { gte: refDate } },
      ],
    },
    select: { id: true },
  });

  if (!activeMembership) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }
}

/**
 * Asserts that the authenticated user can access the target attendance session.
 *  - OWNER / ADMIN / STAFF: passes through.
 *  - TEACHER: session.teacherId must match own teacher identity AND batch must be authorized.
 */
export async function assertTeacherCanAccessAttendanceSession(
  user: SessionUser,
  session: { teacherId: string | null; batchId: string; subjectId?: string | null; branchId?: string; date?: Date },
  referenceDate: Date = session.date ? toDateOnly(session.date) : getCurrentDhakaDateOnly()
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  const teacher = await getTeacherByUserId(user.coachingCenterId, user.userId);
  if (!teacher) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  if (session.teacherId && session.teacherId !== teacher.id) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  await assertTeacherCanAccessBatch(user, session.batchId, referenceDate);

  if (session.subjectId) {
    const nextDay = startOfNextDay(referenceDate);
    const subAssignment = await prisma.batchTeacherAssignment.findFirst({
      where: {
        coachingCenterId: user.coachingCenterId,
        teacherId: teacher.id,
        batchId: session.batchId,
        subjectId: session.subjectId,
        status: 'ACTIVE',
        startDate: { lt: nextDay },
        OR: [
          { endDate: null },
          { endDate: { gte: referenceDate } },
        ],
      },
      select: { id: true },
    });
    if (!subAssignment) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }
  }
}

/**
 * Asserts that the authenticated user can access the class schedule for attendance.
 *  - OWNER / ADMIN / STAFF: passes through.
 *  - TEACHER: schedule.teacherId must match own teacher identity, batch must be authorized, and teacher must be assigned to subject.
 */
export async function assertTeacherCanAccessSchedule(
  user: SessionUser,
  schedule: { teacherId: string | null; batchId: string; subjectId?: string | null; branchId?: string },
  referenceDate: Date = getCurrentDhakaDateOnly()
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  const teacher = await getTeacherByUserId(user.coachingCenterId, user.userId);
  if (!teacher) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  if (schedule.teacherId && schedule.teacherId !== teacher.id) {
    throw new Error('FORBIDDEN_TEACHER_SCOPE');
  }

  await assertTeacherCanAccessBatch(user, schedule.batchId, referenceDate);

  if (schedule.subjectId) {
    const nextDay = startOfNextDay(referenceDate);
    const subAssignment = await prisma.batchTeacherAssignment.findFirst({
      where: {
        coachingCenterId: user.coachingCenterId,
        teacherId: teacher.id,
        batchId: schedule.batchId,
        subjectId: schedule.subjectId,
        status: 'ACTIVE',
        startDate: { lt: nextDay },
        OR: [
          { endDate: null },
          { endDate: { gte: referenceDate } },
        ],
      },
      select: { id: true },
    });
    if (!subAssignment) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }
  }
}

/**
 * Asserts that the authenticated user can target a notice recipient.
 *  - OWNER / ADMIN / STAFF: passes through.
 *  - TEACHER: can only target BATCH, must be an assigned batch, and cannot target another branch.
 */
export async function assertTeacherCanAccessNoticeTarget(
  user: SessionUser,
  input: { targetAudience: string; batchId?: string | null; branchId?: string | null }
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  if (input.targetAudience !== 'BATCH') {
    throw new Error('NOTICE_ACCESS_DENIED: teachers may only target their assigned batch');
  }
  if (!input.batchId) {
    throw new Error('NOTICE_ACCESS_DENIED: a batch is required');
  }

  await assertTeacherCanAccessBatch(user, input.batchId);

  if (input.branchId && user.branchId && input.branchId !== user.branchId) {
    throw new Error('NOTICE_ACCESS_DENIED: cannot target another branch');
  }
}

/**
 * Asserts that the authenticated user can upload the given resource type/context.
 *  - OWNER / ADMIN / STAFF: passes through.
 *  - TEACHER: cannot upload branding assets (logo, favicon). If batch/homework provided, must be authorized.
 */
export async function assertTeacherCanAccessUpload(
  user: SessionUser,
  input: { scope: string; batchId?: string; homeworkId?: string }
): Promise<void> {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }
  if (user.role !== 'TEACHER') {
    throw new Error('FORBIDDEN');
  }

  if (input.scope === 'logo' || input.scope === 'favicon') {
    throw new Error('FORBIDDEN_TEACHER_SCOPE: teachers cannot upload center branding assets');
  }

  if (input.batchId) {
    await assertTeacherCanAccessBatch(user, input.batchId);
  }

  if (input.homeworkId) {
    const hw = await prisma.homework.findFirst({
      where: { id: input.homeworkId, coachingCenterId: user.coachingCenterId },
      select: { batchId: true, teacherId: true },
    });
    if (!hw) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE: homework not found');
    }
    const teacher = await getTeacherByUserId(user.coachingCenterId, user.userId);
    if (hw.teacherId && (!teacher || hw.teacherId !== teacher.id)) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE: unauthorized homework resource');
    }
    await assertTeacherCanAccessBatch(user, hw.batchId);
  }
}

/**
 * Asserts that the authenticated user can access communication template administration.
 *  - TEACHER: denied (communication templates are administrative).
 */
export function assertTeacherCanAccessCommunicationTarget(user: SessionUser): void {
  if (user.role === 'TEACHER') {
    throw new Error('FORBIDDEN_TEACHER_SCOPE: communication templates are managed by administration');
  }
}
