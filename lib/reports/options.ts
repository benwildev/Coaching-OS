import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { getAttendanceThreshold } from '@/lib/services/attendance.service';
import { getCoachingCenterGradingConfig } from '@/lib/services/result-calculation.service';
import { NOTIFICATION_EVENTS } from '@/lib/notifications/events';
import {
  canAccessCategory,
  canCompareBranches,
  canViewFinance,
  canViewInternalResults,
  NO_MATCH_ID,
  REPORT_CATEGORIES,
  resolveTeacherScope,
} from './access';
import { COMM_CHANNELS, COMM_STATUSES } from './communication-reports';
import { PAYMENT_METHODS } from './finance-reports';

/**
 * Filter options for the report filter bar — already narrowed to what the
 * caller is authorized to select (their branch, a teacher's own batches /
 * subjects / self), so the UI never offers an ID the API would reject.
 */
export async function getReportOptions(user: SessionUser) {
  const cc = user.coachingCenterId;
  const branchLocked = user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
  const teacher = user.role === 'TEACHER' ? await resolveTeacherScope(cc, user) : null;
  const batchIdFilter = teacher ? { id: { in: teacher.batchIds.length ? teacher.batchIds : [NO_MATCH_ID] } } : {};

  const [center, branches, sessions, programs, classes, groups, courses, batches, subjects, teachers, threshold, grading, examTypes, studentStatuses] = await Promise.all([
    prisma.coachingCenter.findUnique({ where: { id: cc }, select: { name: true, banglaName: true } }),
    prisma.branch.findMany({
      where: { coachingCenterId: cc, ...(branchLocked ? { id: user.branchId! } : {}) },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, banglaName: true },
    }),
    prisma.academicSession.findMany({ where: { coachingCenterId: cc }, orderBy: { startDate: 'desc' }, select: { id: true, name: true, banglaName: true, isCurrent: true } }),
    prisma.academicProgram.findMany({ where: { coachingCenterId: cc }, orderBy: { name: 'asc' }, select: { id: true, name: true, banglaName: true } }),
    prisma.academicClass.findMany({ where: { coachingCenterId: cc }, orderBy: { order: 'asc' }, select: { id: true, name: true, banglaName: true, academicProgramId: true } }),
    prisma.academicGroup.findMany({ where: { coachingCenterId: cc }, orderBy: { name: 'asc' }, select: { id: true, name: true, banglaName: true, academicClassId: true } }),
    prisma.course.findMany({ where: { coachingCenterId: cc }, orderBy: { name: 'asc' }, select: { id: true, name: true, banglaName: true, academicClassId: true } }),
    prisma.batch.findMany({
      where: { coachingCenterId: cc, ...(branchLocked ? { branchId: user.branchId! } : {}), ...batchIdFilter },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, code: true, branchId: true, academicSessionId: true, academicProgramId: true, academicClassId: true },
    }),
    prisma.subject.findMany({
      where: { coachingCenterId: cc, ...(teacher ? { id: { in: teacher.subjectIds.length ? teacher.subjectIds : [NO_MATCH_ID] } } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, academicClassId: true },
    }),
    prisma.teacher.findMany({
      where: {
        coachingCenterId: cc,
        ...(branchLocked ? { branchId: user.branchId! } : {}),
        ...(teacher ? { id: teacher.teacherId ?? NO_MATCH_ID } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, teacherCode: true },
    }),
    getAttendanceThreshold(cc),
    getCoachingCenterGradingConfig(cc),
    prisma.exam.findMany({ where: { coachingCenterId: cc }, distinct: ['examType'], select: { examType: true } }),
    prisma.student.findMany({ where: { coachingCenterId: cc }, distinct: ['status'], select: { status: true } }),
  ]);

  return {
    center,
    role: user.role,
    branchLocked,
    lockedBranchId: branchLocked ? user.branchId : null,
    permissions: {
      categories: REPORT_CATEGORIES.filter((c) => canAccessCategory(user.role, c)),
      compareBranches: canCompareBranches(user.role),
      finance: canViewFinance(user.role),
      internalResults: canViewInternalResults(user.role),
    },
    branches,
    sessions,
    programs,
    classes,
    groups,
    courses,
    batches,
    subjects,
    teachers,
    attendanceThreshold: threshold,
    grades: grading.scale.map((s) => s.grade),
    // Only values that exist in the schema / data — nothing invented.
    examTypes: examTypes.map((e) => e.examType).sort(),
    studentStatuses: studentStatuses.map((s) => s.status).sort(),
    enrollmentStatuses: ['ENROLLED', 'COMPLETED', 'DROPPED', 'TRANSFERRED'],
    batchStatuses: ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    paymentMethods: PAYMENT_METHODS,
    channels: COMM_CHANNELS,
    communicationStatuses: COMM_STATUSES,
    events: NOTIFICATION_EVENTS,
  };
}

export type ReportOptions = Awaited<ReturnType<typeof getReportOptions>>;
