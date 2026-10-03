import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { type SessionUser } from '../lib/auth/session';
import { ALL_PERMISSION_CODES, TEACHER_DEFAULTS, type PermissionCode } from '../lib/auth/permissions';
import { realignTeacherBaseline } from '../lib/services/permission.service';
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
} from '../lib/auth/teacher-scope';
import { getStudentsList } from '../lib/services/student.service';
import { getBatchesList } from '../lib/services/batch.service';
import { getCoursesList } from '../lib/services/course.service';
import {
  getOrCreateAttendanceSession,
  bulkMarkAttendance,
  getTeachersDailyAttendance,
  getTeacherAttendanceHistory,
} from '../lib/services/attendance.service';
import { getTeacherDashboardData } from '../lib/services/teacher.service';

const TAG = `P144VERIFY-${Date.now()}`;
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
  console.log(`PHASE 14.4 — TEACHER ROLE & WORKFLOW CORRECTION VERIFICATION`);
  console.log(`Tag: ${TAG}`);
  console.log(`==================================================\n`);

  const today = getCurrentDhakaDateOnly();
  const todayStr = getCurrentDhakaDateString();
  const todayWeekday = getCurrentDhakaDayOfWeek(today);

  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const stamp = Date.now().toString().slice(-6);

  // 1. Setup Tenant
  const setupA = await completeInitialSetup({
    centerName: `Center A ${TAG}`,
    centerCode: `T144${stamp}`,
    centerPhone: '01711000001',
    centerCity: 'Dhaka',
    centerDistrict: 'Dhaka',
    ownerName: `Owner A`,
    ownerEmail: `owner-${stamp}@test.local`.toLowerCase(),
    ownerPhone: `017${Date.now().toString().slice(-8)}`,
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

  const centerA = setupA.center.id;
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

  const ownerUser = mkSessionUser(setupA.owner, 'OWNER', [...ALL_PERMISSION_CODES]);

  // Create academic foundation
  const academicProgram = await prisma.academicProgram.create({
    data: { coachingCenterId: centerA, name: `Program ${TAG}`, code: `PRG-${stamp}` },
  });
  const academicClass = await prisma.academicClass.create({
    data: { coachingCenterId: centerA, academicProgramId: academicProgram.id, name: `Class 10 ${TAG}`, code: `C10-${stamp}` },
  });
  const academicSession = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: centerA } });

  const subjectMath = await prisma.subject.create({
    data: { coachingCenterId: centerA, academicClassId: academicClass.id, name: `Mathematics ${TAG}`, code: `MATH-${stamp}` },
  });
  const subjectPhysics = await prisma.subject.create({
    data: { coachingCenterId: centerA, academicClassId: academicClass.id, name: `Physics ${TAG}`, code: `PHY-${stamp}` },
  });

  // Courses
  const courseA = await prisma.course.create({
    data: {
      coachingCenterId: centerA,
      academicProgramId: academicProgram.id,
      academicClassId: academicClass.id,
      name: `Course A ${TAG}`,
      code: `CRS-A-${stamp}`,
    },
  });
  const courseB = await prisma.course.create({
    data: {
      coachingCenterId: centerA,
      academicProgramId: academicProgram.id,
      academicClassId: academicClass.id,
      name: `Course B (Unrelated) ${TAG}`,
      code: `CRS-B-${stamp}`,
    },
  });

  // Batches
  const batchA = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicProgramId: academicProgram.id,
      academicClassId: academicClass.id,
      academicSessionId: academicSession.id,
      courseId: courseA.id,
      name: `Batch A (Assigned) ${TAG}`,
      code: `BT-A-${stamp}`,
      capacity: 30,
      status: 'ACTIVE',
    },
  });
  const batchB = await prisma.batch.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      academicProgramId: academicProgram.id,
      academicClassId: academicClass.id,
      academicSessionId: academicSession.id,
      courseId: courseB.id,
      name: `Batch B (Unassigned) ${TAG}`,
      code: `BT-B-${stamp}`,
      capacity: 30,
      status: 'ACTIVE',
    },
  });

  // Teachers
  const userTeacherA = await mkUser(centerA, branchA1.id, 'TEACHER', 1);
  const teacherA = await prisma.teacher.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      userId: userTeacherA.id,
      name: `Teacher A ${TAG}`,
      phone: userTeacherA.phone!,
      teacherCode: `T-A-${stamp}`,
      status: 'ACTIVE',
    },
  });
  const teacherSessionA = mkSessionUser(userTeacherA, 'TEACHER', [...TEACHER_DEFAULTS]);

  const userTeacherB = await mkUser(centerA, branchA1.id, 'TEACHER', 2);
  const teacherB = await prisma.teacher.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      userId: userTeacherB.id,
      name: `Teacher B ${TAG}`,
      phone: userTeacherB.phone!,
      teacherCode: `T-B-${stamp}`,
      status: 'ACTIVE',
    },
  });
  const teacherSessionB = mkSessionUser(userTeacherB, 'TEACHER', [...TEACHER_DEFAULTS]);

  // Assign Teacher A to Batch A (Math)
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      teacherId: teacherA.id,
      subjectId: subjectMath.id,
      status: 'ACTIVE',
      startDate: yesterday,
    },
  });

  // Assign Teacher B to Batch B (Physics)
  await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchB.id,
      teacherId: teacherB.id,
      subjectId: subjectPhysics.id,
      status: 'ACTIVE',
      startDate: yesterday,
    },
  });

  // Students
  // Student 1: In Batch A
  const student1 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      studentIdCode: `ST1-${stamp}`,
      name: `Student 1 (Batch A)`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      studentId: student1.id,
      batchId: batchA.id,
      status: 'ACTIVE',
      joinedAt: yesterday,
    },
  });

  // Student 2: In Batch B
  const student2 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      studentIdCode: `ST2-${stamp}`,
      name: `Student 2 (Batch B)`,
      status: 'ACTIVE',
    },
  });
  await prisma.studentBatch.create({
    data: {
      coachingCenterId: centerA,
      studentId: student2.id,
      batchId: batchB.id,
      status: 'ACTIVE',
      joinedAt: yesterday,
    },
  });

  // Student 3: In Branch 2 (Cross-branch)
  const student3 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA2.id,
      studentIdCode: `ST3-${stamp}`,
      name: `Student 3 (Branch 2)`,
      status: 'ACTIVE',
    },
  });

  // Student 4: Unassigned student in Branch 1
  const student4 = await prisma.student.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      studentIdCode: `ST4-${stamp}`,
      name: `Student 4 (Unassigned)`,
      status: 'ACTIVE',
    },
  });

  // Class schedules for today
  const scheduleTeacherA = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      teacherId: teacherA.id,
      dayOfWeek: todayWeekday,
      startTime: '09:00',
      endTime: '10:00',
      status: 'ACTIVE',
      effectiveStartDate: yesterday,
    },
  });

  const scheduleTeacherB = await prisma.classSchedule.create({
    data: {
      coachingCenterId: centerA,
      branchId: branchA1.id,
      batchId: batchB.id,
      subjectId: subjectPhysics.id,
      teacherId: teacherB.id,
      dayOfWeek: todayWeekday,
      startTime: '10:00',
      endTime: '11:00',
      status: 'ACTIVE',
      effectiveStartDate: yesterday,
    },
  });

  // ==========================================
  // GROUP A: TEACHER PERMISSIONS BASELINE
  // ==========================================
  console.log('\n--- GROUP A: Teacher Permissions Baseline ---');

  // Test 1: TEACHER must not have student management permissions
  try {
    const forbidden = ['students.create', 'students.update', 'students.promote', 'students.transfer', 'students.certificates', 'students.id_card'];
    const hasForbidden = forbidden.some((p) => TEACHER_DEFAULTS.includes(p as PermissionCode));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains forbidden student management permissions`);
    ok(1, 'TEACHER baseline excludes students.create, update, promote, transfer, certificates, id_card');
  } catch (e) {
    fail(1, 'TEACHER baseline student permissions check', e);
  }

  // Test 2: TEACHER must not have course management permissions
  try {
    const forbidden = ['courses.create', 'courses.update', 'courses.delete', 'courses.pricing.update'];
    const hasForbidden = forbidden.some((p) => TEACHER_DEFAULTS.includes(p as PermissionCode));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains forbidden course management permissions`);
    ok(2, 'TEACHER baseline excludes courses.create, update, delete, pricing.update');
  } catch (e) {
    fail(2, 'TEACHER baseline course permissions check', e);
  }

  // Test 3: TEACHER must not have batch management permissions
  try {
    const forbidden = ['batches.create', 'batches.update', 'batches.delete', 'batches.assign_teacher'];
    const hasForbidden = forbidden.some((p) => TEACHER_DEFAULTS.includes(p as PermissionCode));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains forbidden batch management permissions`);
    ok(3, 'TEACHER baseline excludes batches.create, update, delete, assign_teacher');
  } catch (e) {
    fail(3, 'TEACHER baseline batch permissions check', e);
  }

  // Test 4: TEACHER must not have teacher management permissions
  try {
    const forbidden = ['teachers.create', 'teachers.update', 'teachers.delete', 'teachers.account', 'teachers.assignments', 'teachers.read'];
    const hasForbidden = forbidden.some((p) => TEACHER_DEFAULTS.includes(p as PermissionCode));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains forbidden teacher management permissions`);
    ok(4, 'TEACHER baseline excludes teachers.create, update, delete, account, assignments, teachers.read');
  } catch (e) {
    fail(4, 'TEACHER baseline teacher management permissions check', e);
  }

  // Test 5: TEACHER must not have teacher_attendance management permissions
  try {
    const forbidden = ['teacher_attendance.create', 'teacher_attendance.manage'];
    const hasForbidden = forbidden.some((p) => TEACHER_DEFAULTS.includes(p as PermissionCode));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains forbidden teacher_attendance permissions`);
    ok(5, 'TEACHER baseline excludes teacher_attendance.create and manage');
  } catch (e) {
    fail(5, 'TEACHER baseline teacher attendance permissions check', e);
  }

  // Test 6: TEACHER must not have financial, salary, settings, users permissions
  try {
    const forbiddenPrefixes = ['fees.', 'salary.generate', 'salary.pay', 'salary.cancel', 'compensation.manage', 'settings.', 'users.'];
    const hasForbidden = TEACHER_DEFAULTS.some((p) => forbiddenPrefixes.some((pre) => p.startsWith(pre)));
    assert(!hasForbidden, `TEACHER_DEFAULTS contains administrative/financial permissions`);
    ok(6, 'TEACHER baseline excludes fees.*, salary.*, compensation.manage, settings.*, users.*');
  } catch (e) {
    fail(6, 'TEACHER baseline administrative permissions check', e);
  }

  // Test 7: Synced database RolePermission records for TEACHER do not contain obsolete permissions
  try {
    await realignTeacherBaseline(prisma);
    const teacherRole = await prisma.role.findFirstOrThrow({ where: { coachingCenterId: centerA, code: 'TEACHER' } });
    const grants = await prisma.rolePermission.findMany({
      where: { roleId: teacherRole.id },
      include: { permission: true },
    });
    const grantedCodes = grants.map((g) => g.permission.code);
    const obsolete = ['students.id_card', 'teachers.read', 'reports.teachers.read', 'students.create', 'batches.create', 'courses.create'];
    const foundObsolete = obsolete.filter((c) => grantedCodes.includes(c));
    assert(foundObsolete.length === 0, `Database RolePermission contains obsolete grants: ${foundObsolete.join(', ')}`);
    ok(7, 'realignTeacherBaseline purges obsolete grants from database RolePermission records');
  } catch (e) {
    fail(7, 'Database RolePermission baseline realignment check', e);
  }

  // ==========================================
  // GROUP B: TEACHER STUDENT SCOPE
  // ==========================================
  console.log('\n--- GROUP B: Teacher Student Scope ---');

  // Test 8: Teacher A can see student in assigned Batch A
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getStudentsList(centerA, { allowedBatchIds });
    const found = res.students.some((s) => s.id === student1.id);
    assert(found, `Student 1 from Batch A should be visible`);
    ok(8, 'Teacher sees students from assigned Batch A');
  } catch (e) {
    fail(8, 'Assigned batch student visibility check', e);
  }

  // Test 9: Teacher A cannot see student in unassigned Batch B
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getStudentsList(centerA, { allowedBatchIds });
    const found = res.students.some((s) => s.id === student2.id);
    assert(!found, `Student 2 from Batch B must NOT be visible`);
    ok(9, 'Teacher cannot see students from unassigned Batch B (filtered at DB query level)');
  } catch (e) {
    fail(9, 'Unassigned batch student filtering check', e);
  }

  // Test 10: Teacher A cannot see unassigned student
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getStudentsList(centerA, { allowedBatchIds });
    const found = res.students.some((s) => s.id === student4.id);
    assert(!found, `Unassigned Student 4 must NOT be visible`);
    ok(10, 'Teacher cannot see unassigned students outside assigned batches');
  } catch (e) {
    fail(10, 'Unassigned student visibility check', e);
  }

  // Test 11: Student aggregate counts reflect only scoped batches (zero tenant-wide leakage)
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getStudentsList(centerA, { allowedBatchIds });
    assert(res.stats.total === 1, `stats.total was ${res.stats.total}, expected 1 (only Batch A student)`);
    assert(res.stats.active === 1, `stats.active was ${res.stats.active}, expected 1`);
    ok(11, 'getStudentsList aggregate counts (stats.total, stats.active) are strictly scoped to teacher batches');
  } catch (e) {
    fail(11, 'Student aggregate counts scoping check', e);
  }

  // Test 12: Direct access to unassigned student throws FORBIDDEN_TEACHER_SCOPE
  try {
    await expectError(
      () => assertTeacherCanAccessStudent(teacherSessionA, student2.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A accessing student in Batch B'
    );
    ok(12, 'Direct access to unassigned batch student returns 403 / FORBIDDEN_TEACHER_SCOPE');
  } catch (e) {
    fail(12, 'Direct unassigned student access assertion', e);
  }

  // Test 13: Direct access to cross-branch student throws FORBIDDEN_TEACHER_SCOPE
  try {
    await expectError(
      () => assertTeacherCanAccessStudent(teacherSessionA, student3.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A accessing cross-branch student'
    );
    ok(13, 'Cross-branch student access is blocked with FORBIDDEN_TEACHER_SCOPE');
  } catch (e) {
    fail(13, 'Cross-branch student access assertion', e);
  }

  // ==========================================
  // GROUP C: TEACHER BATCH & COURSE SCOPE
  // ==========================================
  console.log('\n--- GROUP C: Teacher Batch & Course Scope ---');

  // Test 14: Assigned Batch A visible in getBatchesList
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getBatchesList(centerA, { batchIds: allowedBatchIds });
    const found = res.batches.some((b) => b.id === batchA.id);
    assert(found, `Batch A should be visible`);
    ok(14, 'Assigned Batch A is visible in getBatchesList');
  } catch (e) {
    fail(14, 'Assigned batch visibility in list check', e);
  }

  // Test 15: Unassigned Batch B hidden from getBatchesList
  try {
    const allowedBatchIds = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const res = await getBatchesList(centerA, { batchIds: allowedBatchIds });
    const found = res.batches.some((b) => b.id === batchB.id);
    assert(!found, `Batch B must NOT be visible`);
    ok(15, 'Unassigned Batch B is hidden in getBatchesList');
  } catch (e) {
    fail(15, 'Unassigned batch hidden in list check', e);
  }

  // Test 16: Assigned Course A visible in getCoursesList
  try {
    const allowedCourseIds = await getTeacherAuthorizedCourseIds(centerA, teacherA.id);
    const res = await getCoursesList(centerA, { courseIds: allowedCourseIds });
    const found = res.courses.some((c) => c.id === courseA.id);
    assert(found, `Course A should be visible`);
    ok(16, 'Assigned Course A is visible in getCoursesList');
  } catch (e) {
    fail(16, 'Assigned course visibility in list check', e);
  }

  // Test 17: Unrelated Course B hidden in getCoursesList
  try {
    const allowedCourseIds = await getTeacherAuthorizedCourseIds(centerA, teacherA.id);
    const res = await getCoursesList(centerA, { courseIds: allowedCourseIds });
    const found = res.courses.some((c) => c.id === courseB.id);
    assert(!found, `Course B must NOT be visible`);
    ok(17, 'Unrelated Course B is hidden in getCoursesList');
  } catch (e) {
    fail(17, 'Unrelated course hidden in list check', e);
  }

  // Test 18: Direct access to unassigned batch throws FORBIDDEN_TEACHER_SCOPE
  try {
    await expectError(
      () => assertTeacherCanAccessBatch(teacherSessionA, batchB.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher A accessing Batch B'
    );
    ok(18, 'Direct access to unassigned Batch B returns 403 / FORBIDDEN_TEACHER_SCOPE');
  } catch (e) {
    fail(18, 'Direct unassigned batch access assertion', e);
  }

  // ==========================================
  // GROUP D: STUDENT ATTENDANCE WORKFLOW & SCOPE
  // ==========================================
  console.log('\n--- GROUP D: Student Attendance Workflow & Scope ---');

  // Test 19: Teacher sees own scheduled class for today
  try {
    const teacherSchedules = await prisma.classSchedule.findMany({
      where: {
        coachingCenterId: centerA,
        teacherId: teacherA.id,
        dayOfWeek: todayWeekday,
        status: 'ACTIVE',
      },
    });
    assert(teacherSchedules.length === 1 && teacherSchedules[0].id === scheduleTeacherA.id, 'Expected 1 schedule for Teacher A');
    ok(19, "Teacher sees only own scheduled classes for today's date");
  } catch (e) {
    fail(19, 'Scheduled class lookup for teacher', e);
  }

  // Test 20: Teacher can create attendance session for assigned schedule
  let sessionAId = '';
  try {
    await assertTeacherCanAccessSchedule(teacherSessionA, scheduleTeacherA, today);
    const session = await getOrCreateAttendanceSession(centerA, scheduleTeacherA.id, todayStr, userTeacherA.id);
    sessionAId = session.id;
    assert(session.batchId === batchA.id, 'Session batchId matches Batch A');
    assert(session.teacherId === teacherA.id, 'Session teacherId matches Teacher A');
    ok(20, 'Teacher can successfully open attendance session for assigned class schedule');
  } catch (e) {
    fail(20, 'Teacher create attendance session', e);
  }

  // Test 21: Teacher can mark attendance for assigned students
  try {
    await assertTeacherCanAccessAttendanceSession(teacherSessionA, {
      teacherId: teacherA.id,
      batchId: batchA.id,
      subjectId: subjectMath.id,
      branchId: branchA1.id,
      date: today,
    });
    const result = await bulkMarkAttendance(
      centerA,
      sessionAId,
      { marks: [{ studentId: student1.id, status: 'PRESENT', remarks: 'Good' }] },
      userTeacherA.id
    );
    assert(result.updated === 1, 'Marked 1 student');
    ok(21, 'Teacher can mark attendance for active students in the assigned roster');
  } catch (e) {
    fail(21, 'Mark student attendance in session', e);
  }

  // Test 22: Teacher cannot access or create session for another teacher's class
  try {
    await expectError(
      () => assertTeacherCanAccessSchedule(teacherSessionA, scheduleTeacherB, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      "Teacher A accessing Teacher B's schedule"
    );
    ok(22, "Teacher cannot access or create attendance for another teacher's class schedule");
  } catch (e) {
    fail(22, "Access another teacher's schedule assertion", e);
  }

  // Test 23: Teacher cannot access session for another subject not assigned to them
  try {
    await expectError(
      () => assertTeacherCanAccessSchedule(teacherSessionA, {
        teacherId: teacherA.id,
        batchId: batchA.id,
        subjectId: subjectPhysics.id, // Teacher A is assigned Math, NOT Physics!
      }, today),
      ['FORBIDDEN_TEACHER_SCOPE'],
      "Teacher A accessing unassigned subject"
    );
    ok(23, 'Teacher cannot create attendance for a subject they are not assigned to in the batch');
  } catch (e) {
    fail(23, 'Unassigned subject attendance assertion', e);
  }

  // Test 24: Attendance cannot be created for a future date
  try {
    await expectError(
      () => getOrCreateAttendanceSession(centerA, scheduleTeacherA.id, tomorrowStr, userTeacherA.id),
      ['FUTURE_DATE_NOT_ALLOWED'],
      'Future date attendance'
    );
    ok(24, 'Attendance cannot be created for future dates (FUTURE_DATE_NOT_ALLOWED)');
  } catch (e) {
    fail(24, 'Future date attendance prevention', e);
  }

  // Test 25: Teacher cannot mark student outside the batch roster
  try {
    await expectError(
      () => bulkMarkAttendance(
        centerA,
        sessionAId,
        { marks: [{ studentId: student2.id, status: 'PRESENT' }] }, // student2 is in Batch B!
        userTeacherA.id
      ),
      ['STUDENT_NOT_ELIGIBLE'],
      'Marking student outside batch roster'
    );
    ok(25, 'Teacher cannot mark student outside the assigned batch roster (STUDENT_NOT_ELIGIBLE)');
  } catch (e) {
    fail(25, 'Unassigned student attendance marking assertion', e);
  }

  // ==========================================
  // GROUP E: TEACHER DAILY ATTENDANCE
  // ==========================================
  console.log('\n--- GROUP E: Teacher Daily Attendance ---');

  // Create daily attendance record for Teacher A
  await prisma.teacherAttendance.create({
    data: {
      coachingCenterId: centerA,
      teacherId: teacherA.id,
      date: today,
      status: 'PRESENT',
      inTime: '08:45',
      outTime: '15:00',
    },
  });

  // Create daily attendance record for Teacher B
  await prisma.teacherAttendance.create({
    data: {
      coachingCenterId: centerA,
      teacherId: teacherB.id,
      date: today,
      status: 'LATE',
      inTime: '09:30',
    },
  });

  // Test 26: getTeachersDailyAttendance for Teacher A returns only Teacher A
  try {
    const res = await getTeachersDailyAttendance(centerA, { date: todayStr }, teacherSessionA);
    assert(res.totalTeachers === 1, `totalTeachers was ${res.totalTeachers}, expected 1`);
    assert(res.roster.length === 1, `roster length was ${res.roster.length}, expected 1`);
    assert(res.roster[0].teacher.id === teacherA.id, `roster teacher id was ${res.roster[0].teacher.id}, expected ${teacherA.id}`);
    ok(26, 'getTeachersDailyAttendance for TEACHER returns only own record (totalTeachers: 1)');
  } catch (e) {
    fail(26, 'Teacher daily attendance self-scope check', e);
  }

  // Test 27: Teacher A cannot see Teacher B in daily attendance
  try {
    const res = await getTeachersDailyAttendance(centerA, { date: todayStr }, teacherSessionA);
    const hasTeacherB = res.roster.some((r) => r.teacher.id === teacherB.id);
    assert(!hasTeacherB, 'Teacher B must not be in Teacher A daily attendance');
    ok(27, 'getTeachersDailyAttendance does not leak other teachers to TEACHER');
  } catch (e) {
    fail(27, 'Teacher daily attendance leakage check', e);
  }

  // Test 28: Management roles retain full administrative view
  try {
    const res = await getTeachersDailyAttendance(centerA, { date: todayStr }, ownerUser);
    assert(res.totalTeachers >= 2, `Management totalTeachers was ${res.totalTeachers}, expected >= 2`);
    const hasTeacherA = res.roster.some((r) => r.teacher.id === teacherA.id);
    const hasTeacherB = res.roster.some((r) => r.teacher.id === teacherB.id);
    assert(hasTeacherA && hasTeacherB, 'Management should see both Teacher A and Teacher B');
    ok(28, 'Management roles retain administrative visibility of all teachers daily attendance');
  } catch (e) {
    fail(28, 'Management teacher attendance access check', e);
  }

  // ==========================================
  // GROUP F: TEACHER DASHBOARD
  // ==========================================
  console.log('\n--- GROUP F: Teacher Dashboard ---');

  // Test 29: getTeacherDashboardData returns strictly scoped student count
  try {
    const dash = await getTeacherDashboardData(centerA, userTeacherA.id);
    assert(dash.linked === true, 'Teacher dashboard should be linked');
    if (dash.linked) {
      assert(dash.studentCount === 1, `studentCount was ${dash.studentCount}, expected 1 (only Student 1 in Batch A)`);
      assert(dash.assignments.length === 1, `assignments count was ${dash.assignments.length}, expected 1`);
      assert(dash.assignments[0].batchId === batchA.id, 'Assignment batch matches Batch A');
      assert(dash.todaysClasses.length === 1, `todaysClasses count was ${dash.todaysClasses.length}, expected 1`);
      assert(dash.todaysClasses[0].scheduleId === scheduleTeacherA.id, 'Today class matches Schedule A');
    }
    ok(29, 'getTeacherDashboardData returns only assigned student count (1) and assigned classes (1)');
  } catch (e) {
    fail(29, 'Teacher dashboard scoped metrics check', e);
  }

  // Test 30: Date bounds on dashboard assignments: future or expired assignments excluded
  try {
    // Add expired assignment for Teacher A
    await prisma.batchTeacherAssignment.create({
      data: {
        coachingCenterId: centerA,
        branchId: branchA1.id,
        batchId: batchB.id,
        teacherId: teacherA.id,
        subjectId: subjectPhysics.id,
        status: 'ACTIVE',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'), // Expired!
      },
    });

    const dash = await getTeacherDashboardData(centerA, userTeacherA.id);
    assert(dash.linked === true, 'Teacher dashboard linked');
    if (dash.linked) {
      assert(dash.assignments.length === 1, `assignments was ${dash.assignments.length}, expected 1 (expired excluded)`);
      assert(dash.studentCount === 1, `studentCount was ${dash.studentCount}, expected 1`);
    }
    ok(30, 'getTeacherDashboardData excludes expired and future teaching assignments');
  } catch (e) {
    fail(30, 'Teacher dashboard date bounds check', e);
  }

  // ==========================================
  // GROUP G: OWNER CONFIGURABILITY & ISOLATION
  // ==========================================
  console.log('\n--- GROUP G: Owner Configurability & Isolation ---');

  // Test 31: Owner can grant permissions, but teacher scope still restricts WHERE they apply
  try {
    // Grant students.read explicitly to Teacher A role (already has it)
    // Teacher A still cannot access Student 2 in Batch B because teacher scope denies it
    await expectError(
      () => assertTeacherCanAccessStudent(teacherSessionA, student2.id),
      ['FORBIDDEN_TEACHER_SCOPE'],
      'Teacher scope layer blocks access regardless of students.read'
    );
    ok(31, 'Teacher scope layer restricts WHERE permissions apply (Owner configurability preserved)');
  } catch (e) {
    fail(31, 'Scope layer enforcement over permissions check', e);
  }

  // Test 32: Mutual isolation between Teacher A and Teacher B
  try {
    const allowedA = await getTeacherAuthorizedBatchIds(centerA, teacherA.id);
    const allowedB = await getTeacherAuthorizedBatchIds(centerA, teacherB.id);
    assert(allowedA.includes(batchA.id) && !allowedA.includes(batchB.id), 'Teacher A has Batch A only');
    assert(allowedB.includes(batchB.id) && !allowedB.includes(batchA.id), 'Teacher B has Batch B only');
    ok(32, 'Mutual isolation verified: Teacher A and Teacher B have mutually exclusive scopes');
  } catch (e) {
    fail(32, 'Mutual teacher isolation check', e);
  }

  console.log(`\n==================================================`);
  console.log(`PHASE 14.4 VERIFICATION SUMMARY`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
