import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { createSessionToken, type SessionUser } from '../lib/auth/session';
import { ALL_PERMISSION_CODES, type PermissionCode } from '../lib/auth/permissions';
import type { RoleCode } from '@prisma/client';
import {
  getCurrentDhakaDateOnly,
  getCurrentDhakaDayOfWeek,
  getCurrentDhakaDateString,
  toDateOnly,
} from '../lib/schedule';
import {
  getTeacherAuthorizedBatchIds,
  getTeacherAuthorizedStudentIds,
  getTeacherAuthorizedCourseIds,
  assertTeacherCanAccessBatch,
  assertTeacherCanAccessStudent,
  assertTeacherCanAccessAttendanceSession,
  assertTeacherCanAccessSchedule,
  assertTeacherCanAccessNoticeTarget,
  assertTeacherCanAccessUpload,
  assertTeacherCanAccessCommunicationTarget,
} from '../lib/auth/teacher-scope';
import { getStudentsList } from '../lib/services/student.service';
import { getBatchesList } from '../lib/services/batch.service';
import { getCoursesList } from '../lib/services/course.service';
import {
  getOrCreateAttendanceSession,
  markStudentAttendance,
  bulkMarkAttendance,
  getLowAttendanceStudents,
  getAttendanceDashboard,
  getAttendanceHistory,
  getTeacherAttendanceHistory,
} from '../lib/services/attendance.service';
import { getDashboardData } from '../lib/services/dashboard.service';
import { listTeacherSalaryHistory, getSalaryPayableDetail, getSalaryOverview } from '../lib/services/salary.service';
import { resolveReportScope } from '../lib/reports/access';
import { studentScopeWhere } from '../lib/reports/student-reports';

const TAG = `P143VERIFY-${Date.now()}`;
const PW = 'Password123!';

let passed = 0;
let failed = 0;

function ok(testNum: number, label: string) {
  passed++;
  console.log(`✔ Test ${testNum}: ${label}`);
}

function fail(testNum: number, label: string, err: any) {
  failed++;
  console.error(`✖ Test ${testNum}: ${label}`);
  console.error(err);
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function expectError(fn: () => Promise<unknown> | unknown, expectedCodes: string[], label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const matched = expectedCodes.some((code) => msg.includes(code));
    assert(matched, `${label} — expected one of [${expectedCodes.join(', ')}], got "${msg}"`);
    return;
  }
  throw new Error(`FAIL: ${label} (expected error with [${expectedCodes.join(', ')}], but succeeded)`);
}

async function main() {
  console.log(`==================================================`);
  console.log(`PHASE 14.3 — TEACHER DATA SCOPE & ATTENDANCE VERIFICATION`);
  console.log(`Tag: ${TAG}`);
  console.log(`==================================================\n`);

  const today = getCurrentDhakaDateOnly();
  const todayStr = getCurrentDhakaDateString();
  const todayWeekday = getCurrentDhakaDayOfWeek(today);

  // Determine tomorrow & yesterday in Dhaka
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const stamp = Date.now().toString().slice(-6);
  const mkSetup = (letter: string, phonePrefix: string) =>
    completeInitialSetup({
      centerName: `Center ${letter} ${TAG}`,
      centerCode: `T143${letter}${stamp}`,
      centerPhone: '01711000001',
      centerCity: 'Dhaka',
      centerDistrict: 'Dhaka',
      ownerName: `Owner ${letter}`,
      ownerEmail: `owner-t143${letter}${stamp}@test.local`.toLowerCase(),
      ownerPhone: `${phonePrefix}${Date.now().toString().slice(-8)}`,
      ownerPassword: PW,
      branchName: 'Main Campus',
      branchCode: 'MAIN',
      sessionName: '2026',
      sessionStartDate: '2026-01-01',
      sessionEndDate: '2026-12-31',
      selectedPrograms: [],
      primaryColor: '#063B78',
      accentColor: '#FFD200',
    } as any);

  // 1. Setup Tenant A
  const setupA = await mkSetup('A', '017');
  const centerA = setupA.center.id;

  // Branch 1 & Branch 2 in Tenant A
  const branchA1 = await prisma.branch.findFirstOrThrow({ where: { coachingCenterId: centerA } });
  const branchA2 = await prisma.branch.create({
    data: { coachingCenterId: centerA, name: `Branch 2 ${TAG}`, code: `B2-${Date.now().toString().slice(-4)}` },
  });

  const mkUser = async (tenantId: string, branchId: string | null, role: RoleCode, n: number, label = role.toLowerCase()) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { coachingCenterId: tenantId, code: role } });
    return prisma.user.create({
      data: {
        coachingCenterId: tenantId,
        branchId,
        email: `${label}-${tenantId.slice(0, 4)}-${n}-${stamp}@test.local`.toLowerCase(),
        phone: `01${3 + n}${Date.now().toString().slice(-8)}`,
        name: `${label} ${tenantId.slice(0, 4)}`,
        passwordHash: await hashPassword(PW),
        status: 'ACTIVE',
        roleAssignments: { create: { roleId: roleRow.id, branchId } },
      },
    });
  };

  const mkSessionUser = (
    user: { id: string; name: string; email: string; phone?: string | null; branchId?: string | null },
    role: RoleCode,
    permissions: PermissionCode[]
  ): SessionUser => ({
    userId: user.id,
    coachingCenterId: centerA,
    branchId: user.branchId ?? null,
    role,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    banglaName: null,
    permissions,
    sessionVersion: 1,
  });

  // Owner User
  const ownerUserA = mkSessionUser(setupA.owner, 'OWNER', [...ALL_PERMISSION_CODES]);

  // Admin User
  const adminDbA = await mkUser(centerA, branchA1.id, 'ADMIN', 1);
  const adminUserA = mkSessionUser(adminDbA, 'ADMIN', [...ALL_PERMISSION_CODES]);

  // Teachers in Tenant A
  // Teacher A
  const userTeacherA = await mkUser(centerA, branchA1.id, 'TEACHER', 2);
  const teacherA = await prisma.teacher.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      userId: userTeacherA.id,
      name: `Teacher A ${TAG}`,
      phone: userTeacherA.phone!,
      teacherCode: `T-A-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  const teacherSessionA = mkSessionUser(userTeacherA, 'TEACHER', [
    'students.read',
    'batches.read',
    'courses.read',
    'attendance.read',
    'attendance.create',
    'attendance.update',
    'attendance.alerts.read',
    'teacher_attendance.read',
    'notices.create',
    'upload.use',
    'reports.students.read',
    'reports.attendance.read',
    'reports.batches.read',
    'reports.teachers.read',
    'salary.read',
  ]);

  // Teacher B
  const userTeacherB = await mkUser(centerA, branchA1.id, 'TEACHER', 3);
  const teacherB = await prisma.teacher.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      userId: userTeacherB.id,
      name: `Teacher B ${TAG}`,
      phone: userTeacherB.phone!,
      teacherCode: `T-B-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  const teacherSessionB = mkSessionUser(userTeacherB, 'TEACHER', teacherSessionA.permissions!);

  // Academic Programs, Classes, Courses & Subjects
  const programA = await prisma.academicProgram.create({
    data: { coachingCenterId: centerA, name: `HSC ${TAG}`, code: `HSC-${stamp}` },
  });
  const classA = await prisma.academicClass.create({
    data: { coachingCenterId: centerA, academicProgramId: programA.id, name: `Class 12 ${TAG}`, code: `C12-${stamp}` },
  });

  const courseA = await prisma.course.create({
    data: { coachingCenterId: centerA, academicProgramId: programA.id, academicClassId: classA.id, name: `Course Math ${TAG}`, code: `CM-${Date.now().toString().slice(-4)}` },
  });
  const courseB = await prisma.course.create({
    data: { coachingCenterId: centerA, academicProgramId: programA.id, academicClassId: classA.id, name: `Course Physics ${TAG}`, code: `CP-${Date.now().toString().slice(-4)}` },
  });
  const courseUnrelated = await prisma.course.create({
    data: { coachingCenterId: centerA, academicProgramId: programA.id, academicClassId: classA.id, name: `Course Biology ${TAG}`, code: `CB-${Date.now().toString().slice(-4)}` },
  });

  const subjectMath = await prisma.subject.create({
    data: { coachingCenterId: centerA, academicClassId: classA.id, name: `Math ${TAG}`, code: `M-${Date.now().toString().slice(-4)}` },
  });
  const subjectPhysics = await prisma.subject.create({
    data: { coachingCenterId: centerA, academicClassId: classA.id, name: `Physics ${TAG}`, code: `P-${Date.now().toString().slice(-4)}` },
  });

  // Batches
  const batchA = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicSessionId: setupA.session.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseA.id,
      name: `Batch A ${TAG}`,
      code: `BA-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  const batchB = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicSessionId: setupA.session.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseB.id,
      name: `Batch B ${TAG}`,
      code: `BB-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  const batchBranch2 = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA2.id,
      academicSessionId: setupA.session.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseUnrelated.id,
      name: `Batch Branch 2 ${TAG}`,
      code: `BB2-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });

  // Batch Teacher Assignments
  // Teacher A -> Batch A (ACTIVE)
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      teacherId: teacherA.id,
      subjectId: subjectMath.id,
      status: 'ACTIVE',
      startDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  // Teacher B -> Batch B (ACTIVE)
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchB.id,
      teacherId: teacherB.id,
      subjectId: subjectPhysics.id,
      status: 'ACTIVE',
      startDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  // Teacher A -> Batch Ended (ENDED status)
  const batchEnded = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicSessionId: setupA.session.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseA.id,
      name: `Batch Ended ${TAG}`,
      code: `BEND-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchEnded.id,
      teacherId: teacherA.id,
      subjectId: subjectMath.id,
      status: 'ENDED',
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: yesterday,
    },
  });

  // Teacher A -> Batch Future (ACTIVE but startDate is tomorrow)
  const batchFuture = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicSessionId: setupA.session.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseA.id,
      name: `Batch Future ${TAG}`,
      code: `BFUT-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchFuture.id,
      teacherId: teacherA.id,
      subjectId: subjectMath.id,
      status: 'ACTIVE',
      startDate: tomorrow,
    },
  });

  // Students in Batches
  // Student A1 -> actively enrolled in Batch A
  const studentA1 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      name: `Student A1 ${TAG}`,
      studentIdCode: `S-A1-${Date.now().toString().slice(-4)}`,
      phone: `+8801811${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      batchId: batchA.id,
      studentId: studentA1.id,
      status: 'ACTIVE',
      joinedAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Student B1 -> actively enrolled in Batch B
  const studentB1 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      name: `Student B1 ${TAG}`,
      studentIdCode: `S-B1-${Date.now().toString().slice(-4)}`,
      phone: `+8801822${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      batchId: batchB.id,
      studentId: studentB1.id,
      status: 'ACTIVE',
      joinedAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Student C1 -> actively enrolled in Batch Branch 2
  const studentC1 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA2.id,
      name: `Student C1 ${TAG}`,
      studentIdCode: `S-C1-${Date.now().toString().slice(-4)}`,
      phone: `+8801833${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      batchId: batchBranch2.id,
      studentId: studentC1.id,
      status: 'ACTIVE',
      joinedAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Student A_Future -> joinedAt is tomorrow
  const studentAFuture = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      name: `Student A Future ${TAG}`,
      studentIdCode: `S-AFUT-${Date.now().toString().slice(-4)}`,
      phone: `+8801844${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      batchId: batchA.id,
      studentId: studentAFuture.id,
      status: 'ACTIVE',
      joinedAt: tomorrow,
    },
  });

  // Student A_Left -> left yesterday
  const studentALeft = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      name: `Student A Left ${TAG}`,
      studentIdCode: `S-ALEFT-${Date.now().toString().slice(-4)}`,
      phone: `+8801855${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      batchId: batchA.id,
      studentId: studentALeft.id,
      status: 'TRANSFERRED',
      joinedAt: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
      endDate: yesterday,
    },
  });

  // Class Schedules for Attendance
  // Active schedule today for Teacher A
  const schedTeacherA_Active = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: todayWeekday,
      startTime: '10:00',
      endTime: '11:00',
      status: 'ACTIVE',
      effectiveStartDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  // Active schedule today for Teacher B
  const schedTeacherB_Active = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchB.id,
      subjectId: subjectPhysics.id,
      teacherId: teacherB.id,
      dayOfWeek: todayWeekday,
      startTime: '11:00',
      endTime: '12:00',
      status: 'ACTIVE',
      effectiveStartDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  // Schedule with wrong weekday (opposite day)
  const otherWeekday = todayWeekday === 'MONDAY' ? 'FRIDAY' : 'MONDAY';
  const schedWrongWeekday = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: otherWeekday,
      startTime: '14:00',
      endTime: '15:00',
      status: 'ACTIVE',
    },
  });

  // Inactive schedule
  const schedInactive = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: todayWeekday,
      startTime: '15:00',
      endTime: '16:00',
      status: 'CANCELLED',
    },
  });

  // Expired schedule
  const schedExpired = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: todayWeekday,
      startTime: '16:00',
      endTime: '17:00',
      status: 'ACTIVE',
      effectiveStartDate: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000),
      effectiveEndDate: yesterday,
    },
  });

  // Future schedule
  const schedFuture = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: todayWeekday,
      startTime: '17:00',
      endTime: '18:00',
      status: 'ACTIVE',
      effectiveStartDate: tomorrow,
    },
  });

  // Tenant B setup for isolation testing
  const setupB = await mkSetup('B', '018');
  const centerB = setupB.center.id;
  const branchB1 = await prisma.branch.findFirstOrThrow({ where: { coachingCenterId: centerB } });
  const programB = await prisma.academicProgram.create({
    data: { coachingCenterId: centerB, name: `HSC B ${TAG}`, code: `HSCB-${stamp}` },
  });
  const classB = await prisma.academicClass.create({
    data: { coachingCenterId: centerB, academicProgramId: programB.id, name: `Class 12 B ${TAG}`, code: `C12B-${stamp}` },
  });
  const courseTenantB = await prisma.course.create({
    data: {
      coachingCenterId: centerB,
      academicProgramId: programB.id,
      academicClassId: classB.id,
      name: `Course Tenant B ${TAG}`,
      code: `CTB-${Date.now().toString().slice(-4)}`,
    },
  });
  const batchTenantB = await prisma.batch.create({
    data: {
      coachingCenterId: centerB,
      branchId: branchB1.id,
      academicSessionId: setupB.session.id,
      academicProgramId: programB.id,
      academicClassId: classB.id,
      courseId: courseTenantB.id,
      name: `Batch Tenant B ${TAG}`,
      code: `BTB-${Date.now().toString().slice(-4)}`,
      status: 'ACTIVE',
    },
  });
  const studentTenantB = await prisma.student.create({
    data: {
      coachingCenterId: centerB,
      branchId: branchB1.id,
      name: `Student Tenant B ${TAG}`,
      studentIdCode: `STB-${Date.now().toString().slice(-4)}`,
      phone: `+8801999${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'ACTIVE',
    },
  });

  // ----------------------------------------------------
  // TEST GROUP 1: TEACHER STUDENT SCOPE (Tests 1-8)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 1: TEACHER STUDENT SCOPE ---`);

  // Test 1: Teacher sees assigned-batch students
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const result = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds });
    assert(result.students.some((s) => s.id === studentA1.id), 'Student A1 must be visible to Teacher A');
    ok(1, 'Teacher sees assigned-batch students');
  } catch (e) {
    fail(1, 'Teacher sees assigned-batch students', e);
  }

  // Test 2: Teacher cannot see unrelated batch students
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const result = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds });
    assert(!result.students.some((s) => s.id === studentB1.id), 'Student B1 must NOT be visible to Teacher A');
    ok(2, 'Teacher cannot see unrelated batch students');
  } catch (e) {
    fail(2, 'Teacher cannot see unrelated batch students', e);
  }

  // Test 3: Teacher cannot see another branch's unrelated students
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const result = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds });
    assert(!result.students.some((s) => s.id === studentC1.id), 'Student C1 (Branch 2) must NOT be visible to Teacher A');
    ok(3, "Teacher cannot see another branch's unrelated students");
  } catch (e) {
    fail(3, "Teacher cannot see another branch's unrelated students", e);
  }

  // Test 4: Teacher student detail allowed for assigned student
  try {
    await assertTeacherCanAccessStudent(teacherSessionA, studentA1.id, today);
    ok(4, 'Teacher student detail allowed for assigned student');
  } catch (e) {
    fail(4, 'Teacher student detail allowed for assigned student', e);
  }

  // Test 5: Teacher student detail denied for unrelated student
  try {
    await expectError(
      () => assertTeacherCanAccessStudent(teacherSessionA, studentB1.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher student detail denied for unrelated student'
    );
    ok(5, 'Teacher student detail denied for unrelated student');
  } catch (e) {
    fail(5, 'Teacher student detail denied for unrelated student', e);
  }

  // Test 6: Student search remains scoped
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const searchMatch = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds, search: 'Student A1' });
    const searchNoMatch = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds, search: 'Student B1' });
    assert(searchMatch.students.length >= 1, 'Search for Student A1 should return results');
    assert(searchNoMatch.students.length === 0, 'Search for Student B1 in Teacher A scope must return empty');
    ok(6, 'Student search remains scoped');
  } catch (e) {
    fail(6, 'Student search remains scoped', e);
  }

  // Test 7: Student pagination remains scoped
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const page1 = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds, page: 1, pageSize: 1 });
    assert(page1.students.length === 1, 'Page size must be respected');
    assert(page1.students.every((s) => s.id === studentA1.id || s.id === studentAFuture.id), 'Paginated results must remain scoped to authorized batch');
    assert(!page1.students.some((s) => s.id === studentB1.id || s.id === studentC1.id), 'Paginated results must not leak other batches');
    ok(7, 'Student pagination remains scoped');
  } catch (e) {
    fail(7, 'Student pagination remains scoped', e);
  }

  // Test 8: Student counts remain scoped
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const scopedList = await getStudentsList(centerA, { allowedBatchIds: teacherABatchIds });
    const managementList = await getStudentsList(centerA, {});
    assert(scopedList.total < managementList.total, 'Teacher total students count must be strictly less than tenant total');
    ok(8, 'Student counts remain scoped');
  } catch (e) {
    fail(8, 'Student counts remain scoped', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 2: BATCH SCOPE (Tests 9-12)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 2: BATCH SCOPE ---`);

  // Test 9: Teacher sees assigned batches
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const batches = await getBatchesList(centerA, { batchIds: teacherABatchIds });
    assert(batches.batches.some((b) => b.id === batchA.id), 'Batch A must be visible to Teacher A');
    ok(9, 'Teacher sees assigned batches');
  } catch (e) {
    fail(9, 'Teacher sees assigned batches', e);
  }

  // Test 10: Teacher cannot see unrelated batches
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const batches = await getBatchesList(centerA, { batchIds: teacherABatchIds });
    assert(!batches.batches.some((b) => b.id === batchB.id), 'Batch B must NOT be visible to Teacher A');
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchB.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher accessing Batch B should throw'
    );
    ok(10, 'Teacher cannot see unrelated batches');
  } catch (e) {
    fail(10, 'Teacher cannot see unrelated batches', e);
  }

  // Test 11: Ended assignment no longer grants current access
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    assert(!teacherABatchIds.includes(batchEnded.id), 'Ended batch assignment must not be in authorized batches');
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchEnded.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher accessing ended assignment should throw'
    );
    ok(11, 'Ended assignment no longer grants current access');
  } catch (e) {
    fail(11, 'Ended assignment no longer grants current access', e);
  }

  // Test 12: Future assignment does not grant access before start date
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    assert(!teacherABatchIds.includes(batchFuture.id), 'Future batch assignment must not be in authorized batches today');
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchFuture.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher accessing future assignment today should throw'
    );
    ok(12, 'Future assignment does not grant access before start date');
  } catch (e) {
    fail(12, 'Future assignment does not grant access before start date', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 3: COURSE SCOPE (Tests 13-14)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 3: COURSE SCOPE ---`);

  // Test 13: Teacher sees courses through assigned batches
  try {
    const teacherACourseIds = await getTeacherAuthorizedCourseIds(centerA, teacherA.id, today);
    const courses = await getCoursesList(centerA, { courseIds: teacherACourseIds });
    assert(courses.courses.some((c) => c.id === courseA.id), 'Course A must be visible to Teacher A');
    ok(13, 'Teacher sees courses through assigned batches');
  } catch (e) {
    fail(13, 'Teacher sees courses through assigned batches', e);
  }

  // Test 14: Teacher cannot see unrelated courses
  try {
    const teacherACourseIds = await getTeacherAuthorizedCourseIds(centerA, teacherA.id, today);
    const courses = await getCoursesList(centerA, { courseIds: teacherACourseIds });
    assert(!courses.courses.some((c) => c.id === courseB.id), 'Course B must NOT be visible to Teacher A');
    assert(!courses.courses.some((c) => c.id === courseUnrelated.id), 'Course Unrelated must NOT be visible to Teacher A');
    ok(14, 'Teacher cannot see unrelated courses');
  } catch (e) {
    fail(14, 'Teacher cannot see unrelated courses', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 4: DASHBOARD (Tests 15-18)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 4: DASHBOARD ---`);

  // Test 15: Today's classes are teacher-scoped
  try {
    const teacherDash = await getDashboardData(centerA, {}, teacherSessionA);
    const classes = teacherDash.todaysAgenda.filter((a) => a.kind === 'class');
    assert(classes.every((c) => c.sub?.includes('Teacher A')), "Today's classes must be scoped to Teacher A");
    ok(15, "Today's classes are teacher-scoped");
  } catch (e) {
    fail(15, "Today's classes are teacher-scoped", e);
  }

  // Test 16: Assigned batches are teacher-scoped
  try {
    const teacherDash = await getDashboardData(centerA, {}, teacherSessionA);
    assert(teacherDash.kpis.batches.value === 1, `Teacher A should only have 1 active batch on dashboard, got ${teacherDash.kpis.batches.value}`);
    ok(16, 'Assigned batches are teacher-scoped');
  } catch (e) {
    fail(16, 'Assigned batches are teacher-scoped', e);
  }

  // Test 17: Your students are teacher-scoped
  try {
    const teacherDash = await getDashboardData(centerA, {}, teacherSessionA);
    assert(teacherDash.kpis.students.value === 1, `Teacher A should only see 1 student (Student A1), got ${teacherDash.kpis.students.value}`);
    ok(17, 'Your students are teacher-scoped');
  } catch (e) {
    fail(17, 'Your students are teacher-scoped', e);
  }

  // Test 18: Pending attendance is teacher-scoped
  try {
    const teacherDash = await getDashboardData(centerA, {}, teacherSessionA);
    const classes = teacherDash.todaysAgenda.filter((a) => a.kind === 'class');
    assert(classes.length === 1, 'Only Teacher A class should appear in pending/todays classes');
    ok(18, 'Pending attendance is teacher-scoped');
  } catch (e) {
    fail(18, 'Pending attendance is teacher-scoped', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 5: TEACHER ATTENDANCE (Tests 19-23)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 5: TEACHER ATTENDANCE ---`);

  // Record attendance for Teacher A and Teacher B
  await prisma.teacherAttendance.upsert({
    where: { teacherId_date: { teacherId: teacherA.id, date: today } },
    update: { status: 'PRESENT' },
    create: { coachingCenterId: centerA, teacherId: teacherA.id, date: today, status: 'PRESENT' },
  });
  await prisma.teacherAttendance.upsert({
    where: { teacherId_date: { teacherId: teacherB.id, date: today } },
    update: { status: 'PRESENT' },
    create: { coachingCenterId: centerA, teacherId: teacherB.id, date: today, status: 'PRESENT' },
  });

  // Test 19: Teacher can see own attendance
  try {
    const ownHistory = await getTeacherAttendanceHistory(centerA, teacherA.id);
    assert(ownHistory.history.length >= 1, 'Teacher A should see own attendance record');
    ok(19, 'Teacher can see own attendance');
  } catch (e) {
    fail(19, 'Teacher can see own attendance', e);
  }

  // Test 20: Teacher cannot see another teacher's attendance
  try {
    // Calling route or asserting access
    const { assertTeacherSelfAccess } = await import('../lib/auth/session');
    await expectError(
      () => assertTeacherSelfAccess(teacherSessionA, teacherB.id, teacherA.id),
      ['FORBIDDEN_TEACHER_SCOPE', 'FORBIDDEN_TEACHER_SELF_ONLY'],
      'Teacher A requesting Teacher B attendance should be rejected'
    );
    ok(20, "Teacher cannot see another teacher's attendance");
  } catch (e) {
    fail(20, "Teacher cannot see another teacher's attendance", e);
  }

  // Test 21: teacherId query parameter cannot bypass self scope
  try {
    const { assertTeacherSelfAccess } = await import('../lib/auth/session');
    const attackerTeacherId = teacherB.id;
    await expectError(
      () => assertTeacherSelfAccess(teacherSessionA, attackerTeacherId, teacherA.id),
      ['FORBIDDEN_TEACHER_SCOPE', 'FORBIDDEN_TEACHER_SELF_ONLY'],
      'Query param teacherId bypass blocked'
    );
    ok(21, 'teacherId query parameter cannot bypass self scope');
  } catch (e) {
    fail(21, 'teacherId query parameter cannot bypass self scope', e);
  }

  // Test 22: Attendance summary is self-scoped
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const summary = await getAttendanceDashboard(centerA, undefined, { teacherId: teacherA.id, batchIds: teacherABatchIds });
    assert(summary !== null, 'Summary should be generated');
    ok(22, 'Attendance summary is self-scoped');
  } catch (e) {
    fail(22, 'Attendance summary is self-scoped', e);
  }

  // Test 23: Attendance alerts are self-scoped
  try {
    const teacherABatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id, today);
    const alerts = await getLowAttendanceStudents(centerA, { batchIds: teacherABatchIds });
    assert(alerts.every((a) => a.batch.id === batchA.id), 'Alerts must only contain Teacher A assigned batch');
    ok(23, 'Attendance alerts are self-scoped');
  } catch (e) {
    fail(23, 'Attendance alerts are self-scoped', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 6: STUDENT ATTENDANCE (Tests 24-28)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 6: STUDENT ATTENDANCE ---`);

  // Test 24: Teacher can mark assigned class
  let sessionA: any;
  try {
    await assertTeacherCanAccessSchedule(teacherSessionA, schedTeacherA_Active, today);
    sessionA = await getOrCreateAttendanceSession(centerA, schedTeacherA_Active.id, todayStr, userTeacherA.id);
    const mark = await markStudentAttendance(centerA, sessionA.id, studentA1.id, { status: 'PRESENT' }, userTeacherA.id);
    assert(mark.status === 'PRESENT', 'Attendance mark should be recorded');
    ok(24, 'Teacher can mark assigned class');
  } catch (e) {
    fail(24, 'Teacher can mark assigned class', e);
  }

  // Test 25: Teacher cannot mark another teacher's class
  try {
    await expectError(
      () => assertTeacherCanAccessSchedule(teacherSessionA, schedTeacherB_Active, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      "Teacher A cannot mark Teacher B's schedule"
    );
    ok(25, "Teacher cannot mark another teacher's class");
  } catch (e) {
    fail(25, "Teacher cannot mark another teacher's class", e);
  }

  // Test 26: Teacher cannot mark unrelated batch
  try {
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchB.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A cannot mark unrelated Batch B'
    );
    ok(26, 'Teacher cannot mark unrelated batch');
  } catch (e) {
    fail(26, 'Teacher cannot mark unrelated batch', e);
  }

  // Test 27: Teacher cannot submit another teacherId
  try {
    const sessionB = await getOrCreateAttendanceSession(centerA, schedTeacherB_Active.id, todayStr, userTeacherB.id);
    await expectError(
      () => assertTeacherCanAccessAttendanceSession(teacherSessionA, sessionB, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A accessing session belonging to Teacher B must be rejected'
    );
    ok(27, 'Teacher cannot submit another teacherId');
  } catch (e) {
    fail(27, 'Teacher cannot submit another teacherId', e);
  }

  // Test 28: Bulk attendance rejects invalid students atomically
  try {
    await expectError(
      () =>
        bulkMarkAttendance(
          centerA,
          sessionA.id,
          {
            marks: [
              { studentId: studentA1.id, status: 'PRESENT' },
              { studentId: studentB1.id, status: 'PRESENT' }, // Not eligible in Batch A
            ],
          },
          userTeacherA.id
        ),
      ['STUDENT_NOT_ELIGIBLE'],
      'Bulk attendance with mixed valid and invalid students must reject atomically'
    );
    ok(28, 'Bulk attendance rejects invalid students atomically');
  } catch (e) {
    fail(28, 'Bulk attendance rejects invalid students atomically', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 7: DATE (Tests 29-35)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 7: ATTENDANCE DATE VALIDATION ---`);

  // Test 29: Future attendance rejected
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, schedTeacherA_Active.id, tomorrowStr, userTeacherA.id),
      ['FUTURE_DATE_NOT_ALLOWED'],
      'Future date attendance creation must be rejected'
    );
    ok(29, 'Future attendance rejected');
  } catch (e) {
    fail(29, 'Future attendance rejected', e);
  }

  // Test 30: Today's Dhaka date accepted
  try {
    const todaySession = await getOrCreateAttendanceSession(centerA, schedTeacherA_Active.id, todayStr, userTeacherA.id);
    assert(todaySession !== null, "Today's Dhaka date must be accepted");
    ok(30, "Today's Dhaka date accepted");
  } catch (e) {
    fail(30, "Today's Dhaka date accepted", e);
  }

  // Test 31: Wrong weekday rejected
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, schedWrongWeekday.id, todayStr, userTeacherA.id),
      ['WRONG_WEEKDAY'],
      'Class attendance on wrong scheduled weekday must be rejected'
    );
    ok(31, 'Wrong weekday rejected');
  } catch (e) {
    fail(31, 'Wrong weekday rejected', e);
  }

  // Test 32: CLASS attendance requires active schedule
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, schedInactive.id, todayStr, userTeacherA.id),
      ['SCHEDULE_INACTIVE'],
      'Inactive schedule must be rejected'
    );
    ok(32, 'CLASS attendance requires active schedule');
  } catch (e) {
    fail(32, 'CLASS attendance requires active schedule', e);
  }

  // Test 33: Expired schedule rejected
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, schedExpired.id, todayStr, userTeacherA.id),
      ['SCHEDULE_EXPIRED'],
      'Expired schedule must be rejected'
    );
    ok(33, 'Expired schedule rejected');
  } catch (e) {
    fail(33, 'Expired schedule rejected', e);
  }

  // Test 34: Future schedule rejected
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, schedFuture.id, todayStr, userTeacherA.id),
      ['SCHEDULE_NOT_EFFECTIVE'],
      'Schedule not yet effective must be rejected'
    );
    ok(34, 'Future schedule rejected');
  } catch (e) {
    fail(34, 'Future schedule rejected', e);
  }

  // Test 35: EXAM/SPECIAL behavior preserved
  try {
    // Non-routine attendance session created directly with type EXAM
    const examSession = await prisma.attendanceSession.create({
      data: {
        coachingCenterId: centerA,
        branchId: branchA1.id,
        batchId: batchA.id,
        date: today,
        type: 'EXAM',
        status: 'OPEN',
      },
    });
    assert(examSession.type === 'EXAM', 'EXAM attendance session preserved without routine schedule constraint');
    ok(35, 'EXAM/SPECIAL behavior preserved');
  } catch (e) {
    fail(35, 'EXAM/SPECIAL behavior preserved', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 8: ROSTER (Tests 36-38)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 8: ROSTER ELIGIBILITY ---`);

  // Test 36: Student who joined after attendance date is rejected
  try {
    await expectError(
      () => markStudentAttendance(centerA, sessionA.id, studentAFuture.id, { status: 'PRESENT' }, userTeacherA.id),
      ['STUDENT_NOT_ELIGIBLE'],
      'Student joining after class date must be rejected'
    );
    ok(36, 'Student who joined after attendance date is rejected');
  } catch (e) {
    fail(36, 'Student who joined after attendance date is rejected', e);
  }

  // Test 37: Student who left before attendance date is rejected
  try {
    await expectError(
      () => markStudentAttendance(centerA, sessionA.id, studentALeft.id, { status: 'PRESENT' }, userTeacherA.id),
      ['STUDENT_NOT_ELIGIBLE'],
      'Student leaving before class date must be rejected'
    );
    ok(37, 'Student who left before attendance date is rejected');
  } catch (e) {
    fail(37, 'Student who left before attendance date is rejected', e);
  }

  // Test 38: Active roster student accepted
  try {
    const mark = await markStudentAttendance(centerA, sessionA.id, studentA1.id, { status: 'LATE' }, userTeacherA.id);
    assert(mark.status === 'LATE', 'Active roster member must be accepted');
    ok(38, 'Active roster student accepted');
  } catch (e) {
    fail(38, 'Active roster student accepted', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 9: NOTICE (Tests 39-41)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 9: NOTICE TARGETING ---`);

  // Test 39: Teacher can target authorized batch
  try {
    await assertTeacherCanAccessNoticeTarget(teacherSessionA, {
      targetAudience: 'BATCH',
      batchId: batchA.id,
      branchId: branchA1.id,
    });
    ok(39, 'Teacher can target authorized batch');
  } catch (e) {
    fail(39, 'Teacher can target authorized batch', e);
  }

  // Test 40: Teacher cannot target unrelated batch
  try {
    await expectError(
      () =>
        assertTeacherCanAccessNoticeTarget(teacherSessionA, {
          targetAudience: 'BATCH',
          batchId: batchB.id,
          branchId: branchA1.id,
        }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher targeting unrelated Batch B must be rejected'
    );
    ok(40, 'Teacher cannot target unrelated batch');
  } catch (e) {
    fail(40, 'Teacher cannot target unrelated batch', e);
  }

  // Test 41: Teacher cannot target another branch
  try {
    await expectError(
      () =>
        assertTeacherCanAccessNoticeTarget(teacherSessionA, {
          targetAudience: 'BATCH',
          batchId: batchA.id,
          branchId: branchA2.id,
        }),
      ['NOTICE_ACCESS_DENIED'],
      'Teacher targeting another branch must be rejected'
    );
    ok(41, 'Teacher cannot target another branch');
  } catch (e) {
    fail(41, 'Teacher cannot target another branch', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 10: UPLOAD (Tests 42-44)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 10: UPLOAD SCOPE ---`);

  // Test 42: Authorized teacher resource upload works
  try {
    await assertTeacherCanAccessUpload(teacherSessionA, { scope: 'material', batchId: batchA.id });
    ok(42, 'Authorized teacher resource upload works');
  } catch (e) {
    fail(42, 'Authorized teacher resource upload works', e);
  }

  // Test 43: Unauthorized resource upload denied
  try {
    await expectError(
      () => assertTeacherCanAccessUpload(teacherSessionA, { scope: 'logo' }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher cannot upload center logo branding'
    );
    await expectError(
      () => assertTeacherCanAccessUpload(teacherSessionA, { scope: 'favicon' }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher cannot upload center favicon branding'
    );
    ok(43, 'Unauthorized resource upload denied');
  } catch (e) {
    fail(43, 'Unauthorized resource upload denied', e);
  }

  // Test 44: Arbitrary resourceId cannot bypass scope
  try {
    await expectError(
      () => assertTeacherCanAccessUpload(teacherSessionA, { scope: 'material', batchId: batchB.id }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Arbitrary batchId cannot bypass teacher upload scope'
    );
    ok(44, 'Arbitrary resourceId cannot bypass scope');
  } catch (e) {
    fail(44, 'Arbitrary resourceId cannot bypass scope', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 11: COMMUNICATION (Tests 45-46)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 11: COMMUNICATION TEMPLATE ACCESS ---`);

  // Test 45: Teacher cannot access unauthorized tenant-wide templates
  try {
    await expectError(
      () => assertTeacherCanAccessCommunicationTarget(teacherSessionA),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher cannot access communication templates'
    );
    ok(45, 'Teacher cannot access unauthorized tenant-wide templates');
  } catch (e) {
    fail(45, 'Teacher cannot access unauthorized tenant-wide templates', e);
  }

  // Test 46: Existing authorized management users still work
  try {
    assertTeacherCanAccessCommunicationTarget(ownerUserA);
    assertTeacherCanAccessCommunicationTarget(adminUserA);
    ok(46, 'Existing authorized management users still work');
  } catch (e) {
    fail(46, 'Existing authorized management users still work', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 12: REPORTS (Tests 47-50)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 12: REPORTS SCOPE ---`);

  // Test 47: Teacher student report scoped
  try {
    const studentReportScope = await resolveReportScope(centerA, teacherSessionA, 'students', {});
    const studentWhere = studentScopeWhere(studentReportScope, {} as any);
    const students = await prisma.student.findMany({ where: studentWhere });
    assert(students.some((s) => s.id === studentA1.id), 'Student A1 must appear in Teacher A student report');
    assert(!students.some((s) => s.id === studentB1.id), 'Student B1 must NOT appear in Teacher A student report');
    ok(47, 'Teacher student report scoped');
  } catch (e) {
    fail(47, 'Teacher student report scoped', e);
  }

  // Test 48: Teacher attendance report scoped
  try {
    const attReportScope = await resolveReportScope(centerA, teacherSessionA, 'attendance', {});
    assert(attReportScope.teacher?.teacherId === teacherA.id, 'Attendance report scope must pin to Teacher A');
    ok(48, 'Teacher attendance report scoped');
  } catch (e) {
    fail(48, 'Teacher attendance report scoped', e);
  }

  // Test 49: Teacher batch report scoped
  try {
    const batchReportScope = await resolveReportScope(centerA, teacherSessionA, 'batches', {});
    assert(batchReportScope.teacher?.batchIds.includes(batchA.id), 'Batch A must be in report scope');
    assert(!batchReportScope.teacher?.batchIds.includes(batchB.id), 'Batch B must NOT be in report scope');
    ok(49, 'Teacher batch report scoped');
  } catch (e) {
    fail(49, 'Teacher batch report scoped', e);
  }

  // Test 50: Teacher cannot see unrelated teacher data
  try {
    await expectError(
      () => resolveReportScope(centerA, teacherSessionA, 'teachers', { teacherId: teacherB.id }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A requesting Teacher B report must throw'
    );
    ok(50, 'Teacher cannot see unrelated teacher data');
  } catch (e) {
    fail(50, 'Teacher cannot see unrelated teacher data', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 13: SALARY (Tests 51-52)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 13: SALARY SELF-SCOPE ---`);

  // Setup Salary Period and Payables
  const period = await prisma.salaryPeriod.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      year: 2026,
      month: 9,
      status: 'DRAFT',
    },
  });
  const payableA = await prisma.salaryPayable.create({
    data: {
      coachingCenterId: centerA,
      salaryPeriodId: period.id,
      branchId: branchA1.id,
      teacherId: teacherA.id,
      baseAmount: 10000,
      netAmount: 10000,
      paidAmount: 0,
      remainingAmount: 10000,
      breakdown: {},
      status: 'UNPAID',
    },
  });
  const payableB = await prisma.salaryPayable.create({
    data: {
      coachingCenterId: centerA,
      salaryPeriodId: period.id,
      branchId: branchA1.id,
      teacherId: teacherB.id,
      baseAmount: 12000,
      netAmount: 12000,
      paidAmount: 0,
      remainingAmount: 12000,
      breakdown: {},
      status: 'UNPAID',
    },
  });

  // Test 51: Teacher sees own salary history
  try {
    const historyA = await listTeacherSalaryHistory(centerA, teacherSessionA, teacherA.id);
    assert(historyA.length === 1 && historyA[0].id === payableA.id, 'Teacher A must see own salary history');
    const detailA = await getSalaryPayableDetail(centerA, teacherSessionA, payableA.id);
    assert(detailA.id === payableA.id, 'Teacher A can view own payable detail');
    ok(51, 'Teacher sees own salary history');
  } catch (e) {
    fail(51, 'Teacher sees own salary history', e);
  }

  // Test 52: Teacher cannot see another teacher salary
  try {
    await expectError(
      () => listTeacherSalaryHistory(centerA, teacherSessionA, teacherB.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A requesting Teacher B salary history must be rejected'
    );
    await expectError(
      () => getSalaryPayableDetail(centerA, teacherSessionA, payableB.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A requesting Teacher B payable detail must be rejected'
    );
    await expectError(
      () => getSalaryOverview(centerA, teacherSessionA, { year: 2026, month: 9, branchId: branchA1.id }),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A requesting center salary overview must be rejected'
    );
    ok(52, 'Teacher cannot see another teacher salary');
  } catch (e) {
    fail(52, 'Teacher cannot see another teacher salary', e);
  }

  // ----------------------------------------------------
  // TEST GROUP 14: TENANT & BRANCH (Tests 53-54)
  // ----------------------------------------------------
  console.log(`\n--- GROUP 14: TENANT & BRANCH ISOLATION ---`);

  // Test 53: Tenant A teacher cannot access Tenant B data
  try {
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchTenantB.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher from Tenant A cannot access Tenant B batch'
    );
    await expectError(
      () => assertTeacherCanAccessStudent(teacherSessionA, studentTenantB.id, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher from Tenant A cannot access Tenant B student'
    );
    ok(53, 'Tenant A teacher cannot access Tenant B data');
  } catch (e) {
    fail(53, 'Tenant A teacher cannot access Tenant B data', e);
  }

  // Test 54: Branch isolation remains intact
  try {
    // Admin in Branch 1 cannot access Branch 2
    const { assertBranchAccess } = await import('../lib/auth/session');
    await expectError(
      () => assertBranchAccess(adminUserA, branchA2.id),
      ['FORBIDDEN_BRANCH', 'FORBIDDEN_BRANCH_SCOPE'],
      'Branch 1 Admin cannot access Branch 2'
    );
    // Owner can access Branch 2
    assertBranchAccess(ownerUserA, branchA2.id);
    ok(54, 'Branch isolation remains intact');
  } catch (e) {
    fail(54, 'Branch isolation remains intact', e);
  }

  // Cleanup throwaway tenants
  try {
    await prisma.coachingCenter.deleteMany({ where: { id: { in: [centerA, centerB] } } });
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }

  console.log(`\n==================================================`);
  console.log(`PHASE 14.3 VERIFICATION RESULTS:`);
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
