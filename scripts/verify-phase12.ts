import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import {
  createTeacher,
  getTeacherById,
  assignTeacherToBatches,
  endBatchTeacherAssignment,
  getTeacherAssignmentOptions,
} from '../lib/services/teacher.service';
import { assignTeacherToBatch } from '../lib/services/batch.service';
import {
  recordTeacherAttendance,
  getTeachersDailyAttendance,
  recordTeacherBulkAttendance,
  getTeacherAttendanceHistory,
} from '../lib/services/attendance.service';
import { getCurrentDhakaDateOnly } from '../lib/schedule';
import type { SessionUser } from '../lib/auth/session';

const TAG = `P12VERIFY-${Date.now()}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

async function expectError(fn: () => Promise<unknown>, expectedSubstring: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(expectedSubstring), `${label} — expected "${expectedSubstring}", got "${msg}"`);
    ok(label);
    return;
  }
  throw new Error(`FAIL: ${label} (expected error containing "${expectedSubstring}", but function succeeded)`);
}

async function main() {
  console.log(`\n==================================================`);
  console.log(`Phase 12 — Teacher Assignment & Attendance Verification`);
  console.log(`==================================================\n`);

  let tenantAId = '';
  let tenantBId = '';

  try {
    // ----------------------------------------------------
    // 1. SETUP TENANTS & FIXTURES
    // ----------------------------------------------------
    console.log('Setting up Test Tenant A and Tenant B...');
    const codeA = `T12A${Date.now().toString().slice(-5)}`;
    const codeB = `T12B${Date.now().toString().slice(-5)}`;

    const setupA = await completeInitialSetup({
      centerName: `Center A ${TAG}`,
      centerCode: codeA,
      centerPhone: '01711000001',
      centerCity: 'Dhaka',
      centerDistrict: 'Dhaka',
      ownerName: 'Owner A',
      ownerEmail: `owner-${codeA.toLowerCase()}@test.local`,
      ownerPhone: `017${Date.now().toString().slice(-8)}`,
      ownerPassword: 'Password123!',
      branchName: 'Main Campus',
      branchCode: 'MAIN',
      sessionName: '2026',
      sessionStartDate: '2026-01-01',
      sessionEndDate: '2026-12-31',
      selectedPrograms: [],
      primaryColor: '#063B78',
      accentColor: '#FFD200',
    } as any);
    tenantAId = setupA.center.id;
    const branch1 = setupA.branch;

    const setupB = await completeInitialSetup({
      centerName: `Center B ${TAG}`,
      centerCode: codeB,
      centerPhone: '01711000002',
      centerCity: 'Dhaka',
      centerDistrict: 'Dhaka',
      ownerName: 'Owner B',
      ownerEmail: `owner-${codeB.toLowerCase()}@test.local`,
      ownerPhone: `018${Date.now().toString().slice(-8)}`,
      ownerPassword: 'Password123!',
      branchName: 'Main Campus',
      branchCode: 'MAIN',
      sessionName: '2026',
      sessionStartDate: '2026-01-01',
      sessionEndDate: '2026-12-31',
      selectedPrograms: [],
      primaryColor: '#063B78',
      accentColor: '#FFD200',
    } as any);
    tenantBId = setupB.center.id;

    // Create Branch 2 in Tenant A
    const branch2 = await prisma.branch.create({
      data: {
        coachingCenterId: tenantAId,
        name: 'Dhanmondi Branch',
        code: 'DHAN',
      },
    });

    // Academic Session from Tenant A setup
    const academicSession = setupA.session;

    const program = await prisma.academicProgram.create({
      data: {
        coachingCenterId: tenantAId,
        name: 'HSC Program',
        code: 'HSC',
      },
    });

    const academicClass = await prisma.academicClass.create({
      data: {
        coachingCenterId: tenantAId,
        academicProgramId: program.id,
        name: 'Class 12',
        code: 'C12',
      },
    });

    const subjectMath = await prisma.subject.create({
      data: {
        coachingCenterId: tenantAId,
        academicClassId: academicClass.id,
        name: 'Mathematics',
        banglaName: 'উচ্চতর গণিত',
        code: 'MATH',
      },
    });

    const subjectPhysics = await prisma.subject.create({
      data: {
        coachingCenterId: tenantAId,
        academicClassId: academicClass.id,
        name: 'Physics',
        banglaName: 'পদার্থবিজ্ঞান',
        code: 'PHY',
      },
    });

    const subjectChemistry = await prisma.subject.create({
      data: {
        coachingCenterId: tenantAId,
        academicClassId: academicClass.id,
        name: 'Chemistry',
        banglaName: 'রসায়ন',
        code: 'CHEM',
      },
    });

    const subjectBiology = await prisma.subject.create({
      data: {
        coachingCenterId: tenantAId,
        academicClassId: academicClass.id,
        name: 'Biology',
        banglaName: 'জীববিজ্ঞান',
        code: 'BIO',
      },
    });

    // Courses in Tenant A
    const course1 = await prisma.course.create({
      data: {
        coachingCenterId: tenantAId,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        name: 'HSC Science 2026',
        code: 'HSC-SCI',
        status: 'ACTIVE',
      },
    });

    await prisma.courseSubject.createMany({
      data: [
        { courseId: course1.id, subjectId: subjectMath.id },
        { courseId: course1.id, subjectId: subjectPhysics.id },
        { courseId: course1.id, subjectId: subjectChemistry.id },
      ],
    });

    const course2 = await prisma.course.create({
      data: {
        coachingCenterId: tenantAId,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        name: 'University Admission 2026',
        code: 'ADM-2026',
        status: 'ACTIVE',
      },
    });

    await prisma.courseSubject.create({
      data: { courseId: course2.id, subjectId: subjectMath.id },
    });

    // Batches in Tenant A
    const batchMorning = await prisma.batch.create({
      data: {
        coachingCenterId: tenantAId,
        branchId: branch1.id,
        academicSessionId: academicSession.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        courseId: course1.id,
        name: 'HSC Science Morning',
        code: 'HSC-MORN',
        status: 'ACTIVE',
      },
    });

    await prisma.batchSubject.createMany({
      data: [
        { batchId: batchMorning.id, subjectId: subjectMath.id },
        { batchId: batchMorning.id, subjectId: subjectPhysics.id },
      ],
    });

    const batchEvening = await prisma.batch.create({
      data: {
        coachingCenterId: tenantAId,
        branchId: branch1.id,
        academicSessionId: academicSession.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        courseId: course1.id,
        name: 'HSC Science Evening',
        code: 'HSC-EVE',
        status: 'ACTIVE',
      },
    });

    await prisma.batchSubject.createMany({
      data: [
        { batchId: batchEvening.id, subjectId: subjectMath.id },
        { batchId: batchEvening.id, subjectId: subjectPhysics.id },
      ],
    });

    const batchDhanmondi = await prisma.batch.create({
      data: {
        coachingCenterId: tenantAId,
        branchId: branch2.id,
        academicSessionId: academicSession.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        courseId: course1.id,
        name: 'HSC Dhanmondi Weekend',
        code: 'HSC-DHAN',
        status: 'ACTIVE',
      },
    });

    await prisma.batchSubject.create({
      data: { batchId: batchDhanmondi.id, subjectId: subjectChemistry.id },
    });

    const batchAdmission = await prisma.batch.create({
      data: {
        coachingCenterId: tenantAId,
        branchId: branch1.id,
        academicSessionId: academicSession.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        courseId: course2.id,
        name: 'Admission Batch A',
        code: 'ADM-A',
        status: 'ACTIVE',
      },
    });

    await prisma.batchSubject.create({
      data: { batchId: batchAdmission.id, subjectId: subjectMath.id },
    });

    // Tenant B fixture for cross-tenant testing
    const tenantBProgram = await prisma.academicProgram.create({
      data: { coachingCenterId: tenantBId, name: 'B Program', code: 'BP' },
    });
    const tenantBClass = await prisma.academicClass.create({
      data: { coachingCenterId: tenantBId, academicProgramId: tenantBProgram.id, name: 'B Class', code: 'BC' },
    });
    const tenantBCourse = await prisma.course.create({
      data: {
        coachingCenterId: tenantBId,
        academicProgramId: tenantBProgram.id,
        academicClassId: tenantBClass.id,
        name: 'Tenant B Course',
        code: 'B-CRS',
      },
    });

    // Session Users
    const ownerUser: SessionUser = {
      userId: setupA.owner.id,
      coachingCenterId: tenantAId,
      email: setupA.owner.email,
      name: setupA.owner.name,
      phone: null,
      banglaName: null,
      role: 'OWNER',
      branchId: branch1.id,
      sessionVersion: 1,
    };

    const branch1AdminUser: SessionUser = {
      userId: 'admin-branch-1',
      coachingCenterId: tenantAId,
      email: 'admin1@test.com',
      name: 'Admin Branch 1',
      phone: null,
      banglaName: null,
      role: 'ADMIN',
      branchId: branch1.id,
      sessionVersion: 1,
    };

    const branch2AdminUser: SessionUser = {
      userId: 'admin-branch-2',
      coachingCenterId: tenantAId,
      email: 'admin2@test.com',
      name: 'Admin Branch 2',
      phone: null,
      banglaName: null,
      role: 'ADMIN',
      branchId: branch2.id,
      sessionVersion: 1,
    };

    ok('Test fixtures, courses, batches, subjects, and users initialized');

    // ----------------------------------------------------
    // 2. TEACHER CREATION TESTS
    // ----------------------------------------------------
    console.log('\n--- Testing Teacher Creation & Assignments ---');

    // Test 1: Create teacher without assignments
    const t1 = await createTeacher(
      tenantAId,
      {
        name: 'Rahim Uddin',
        phone: '01712000001',
        email: 'rahim@test.com',
        branchId: branch1.id,
        subjectIds: [subjectMath.id],
      },
      ownerUser.userId,
      ownerUser
    );
    assert(t1 && t1.name === 'Rahim Uddin', 'T1 created');
    const t1Db = await getTeacherById(tenantAId, t1.id);
    assert(t1Db?.teacherSubjects.length === 1, 'T1 has 1 general subject competency');
    assert(t1Db?.batchTeacherAssignments.length === 0, 'T1 has 0 teaching assignments');
    ok('Test 1: Create teacher without assignments succeeds');

    // Test 2: Create teacher with one assignment (Course -> Batch -> Subjects)
    const t2 = await createTeacher(
      tenantAId,
      {
        name: 'Karim Ahmed',
        phone: '01712000002',
        email: 'karim@test.com',
        branchId: branch1.id,
        subjectIds: [subjectMath.id, subjectPhysics.id],
        teachingAssignments: [
          {
            courseId: course1.id,
            batchId: batchMorning.id,
            subjectIds: [subjectMath.id],
          },
        ],
      },
      ownerUser.userId,
      ownerUser
    );
    const t2Db = await getTeacherById(tenantAId, t2.id);
    assert(t2Db?.teacherSubjects.length === 2, 'T2 has 2 general subjects');
    assert(t2Db?.batchTeacherAssignments.length === 1, 'T2 has 1 teaching assignment');
    assert(t2Db?.batchTeacherAssignments[0].batch.id === batchMorning.id, 'T2 assigned to morning batch');
    assert(t2Db?.batchTeacherAssignments[0].subject.id === subjectMath.id, 'T2 assigned to math');
    ok('Test 2: Create teacher with 1 assignment succeeds');

    // Test 3: Create teacher with multiple assignments across batches
    const t3 = await createTeacher(
      tenantAId,
      {
        name: 'Sadia Akter',
        phone: '01712000003',
        branchId: branch1.id,
        subjectIds: [subjectMath.id, subjectPhysics.id],
        teachingAssignments: [
          {
            courseId: course1.id,
            batchId: batchMorning.id,
            subjectIds: [subjectMath.id, subjectPhysics.id],
          },
          {
            courseId: course1.id,
            batchId: batchEvening.id,
            subjectIds: [subjectMath.id],
          },
        ],
      },
      ownerUser.userId,
      ownerUser
    );
    const t3Db = await getTeacherById(tenantAId, t3.id);
    assert(t3Db?.batchTeacherAssignments.length === 3, 'T3 has 3 batch-subject assignments');
    ok('Test 3: Create teacher with multiple assignments across batches succeeds');

    // Test 4: Create teacher with multiple courses
    const t4 = await createTeacher(
      tenantAId,
      {
        name: 'Nusrat Jahan',
        phone: '01712000004',
        branchId: branch1.id,
        subjectIds: [subjectMath.id],
        teachingAssignments: [
          {
            courseId: course1.id,
            batchId: batchMorning.id,
            subjectIds: [subjectMath.id],
          },
          {
            courseId: course2.id,
            batchId: batchAdmission.id,
            subjectIds: [subjectMath.id],
          },
        ],
      },
      ownerUser.userId,
      ownerUser
    );
    const t4Db = await getTeacherById(tenantAId, t4.id);
    assert(t4Db?.batchTeacherAssignments.length === 2, 'T4 has 2 assignments across courses');
    const assignedCourseIds = new Set(t4Db?.batchTeacherAssignments.map((a) => a.batch.courseId));
    assert(assignedCourseIds.has(course1.id) && assignedCourseIds.has(course2.id), 'T4 spans Course 1 and Course 2');
    ok('Test 4: Create teacher with multiple courses succeeds');

    // ----------------------------------------------------
    // 3. SERVER-SIDE VALIDATION & ISOLATION
    // ----------------------------------------------------
    console.log('\n--- Testing Validation & Isolation ---');

    // Test 7: Invalid Course -> Batch rejected (Batch does not belong to Course)
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Invalid Course Batch',
            phone: '01712000005',
            teachingAssignments: [
              {
                courseId: course2.id, // University admission
                batchId: batchMorning.id, // belongs to course1
                subjectIds: [subjectMath.id],
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'BATCH_MISMATCH',
      'Test 7: Course -> Batch mismatch is rejected'
    );

    // Test 8: Subject not offered by batch rejected
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Invalid Subject Batch',
            phone: '01712000006',
            teachingAssignments: [
              {
                courseId: course1.id,
                batchId: batchMorning.id,
                subjectIds: [subjectBiology.id], // Biology is not offered by batchMorning
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'SUBJECT_NOT_OFFERED',
      'Test 8: Subject not offered by batch is rejected'
    );

    // Test 9: Cross-tenant Course rejected
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Cross Tenant Course',
            phone: '01712000007',
            teachingAssignments: [
              {
                courseId: tenantBCourse.id,
                batchId: batchMorning.id,
                subjectIds: [subjectMath.id],
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'COURSE_NOT_FOUND',
      'Test 9: Cross-tenant course ID is rejected'
    );

    // Test 10: Teacher branch mismatch (Teacher locked to Branch 1 cannot teach in Branch 2)
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Branch Mismatched Teacher',
            phone: '01712000008',
            branchId: branch1.id, // Teacher in Main Branch
            teachingAssignments: [
              {
                courseId: course1.id,
                batchId: batchDhanmondi.id, // Batch in Dhanmondi Branch
                subjectIds: [subjectChemistry.id],
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'BRANCH_MISMATCH',
      'Test 10: Teacher branch mismatch with batch branch is rejected'
    );

    // Test 11: Branch-locked Admin cannot assign teacher to another branch's batch
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Cross Branch Admin Creation',
            phone: '01712000009',
            teachingAssignments: [
              {
                courseId: course1.id,
                batchId: batchDhanmondi.id, // Dhanmondi branch
                subjectIds: [subjectChemistry.id],
              },
            ],
          },
          branch1AdminUser.userId,
          branch1AdminUser // Admin of Branch 1 attempting to assign to Dhanmondi
        ),
      'FORBIDDEN_BRANCH',
      'Test 11: Branch-locked Admin cannot assign to another branch batch'
    );

    // Test 12: Duplicate active assignment rejected
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Duplicate Assignment Teacher',
            phone: '01712000010',
            teachingAssignments: [
              {
                courseId: course1.id,
                batchId: batchMorning.id,
                subjectIds: [subjectMath.id],
              },
              {
                courseId: course1.id,
                batchId: batchMorning.id,
                subjectIds: [subjectMath.id], // duplicate!
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'DUPLICATE_ASSIGNMENT',
      'Test 12: Duplicate active assignment in creation payload is rejected'
    );

    // ----------------------------------------------------
    // 4. TRANSACTION ATOMICITY
    // ----------------------------------------------------
    console.log('\n--- Testing Transactional Rollback ---');

    const teacherPhone = '01712000099';
    await expectError(
      () =>
        createTeacher(
          tenantAId,
          {
            name: 'Rollback Candidate',
            phone: teacherPhone,
            teachingAssignments: [
              {
                courseId: course1.id,
                batchId: batchMorning.id,
                subjectIds: [subjectMath.id],
              },
              {
                courseId: course1.id,
                batchId: batchMorning.id,
                subjectIds: ['invalid-subject-id-999'], // Will fail
              },
            ],
          },
          ownerUser.userId,
          ownerUser
        ),
      'SUBJECT_NOT_OFFERED',
      'Test 13: Assignment failure triggers error'
    );

    const checkRolledBack = await prisma.teacher.findFirst({
      where: { coachingCenterId: tenantAId, phone: teacherPhone },
    });
    assert(!checkRolledBack, 'Teacher was not created in database due to rollback');
    ok('Test 13: Transaction rollback verified (zero partial teacher or assignments created)');

    // ----------------------------------------------------
    // 5. BATCH -> TEACHERS WORKFLOW COMPATIBILITY
    // ----------------------------------------------------
    console.log('\n--- Testing Batch -> Teachers Workflow Compatibility ---');

    // Test 14: Assign teacher from Batch -> Teachers tab using assignTeacherToBatch
    const bAssignment = await assignTeacherToBatch(
      tenantAId,
      batchEvening.id,
      {
        teacherId: t1.id,
        subjectId: subjectPhysics.id,
      },
      ownerUser.userId,
      ownerUser
    );
    assert(bAssignment && bAssignment.status === 'ACTIVE', 'Batch teacher assignment created');
    ok('Test 14: Existing Batch -> Teachers assignment workflow functions seamlessly');

    // Test 15: Duplicate assignment via assignTeacherToBatch rejected
    await expectError(
      () =>
        assignTeacherToBatch(
          tenantAId,
          batchEvening.id,
          {
            teacherId: t1.id,
            subjectId: subjectPhysics.id,
          },
          ownerUser.userId,
          ownerUser
        ),
      'ALREADY_ASSIGNED',
      'Test 15: assignTeacherToBatch prevents duplicate active assignment'
    );

    // Test 16: Branch-locked admin cannot assign teacher to batch of another branch
    await expectError(
      () =>
        assignTeacherToBatch(
          tenantAId,
          batchDhanmondi.id,
          {
            teacherId: t1.id,
            subjectId: subjectChemistry.id,
          },
          branch1AdminUser.userId,
          branch1AdminUser // branch 1 admin accessing branch 2 batch
        ),
      'FORBIDDEN_BRANCH',
      'Test 16: Branch-locked Admin forbidden from assigning teacher to other branch batch'
    );

    // ----------------------------------------------------
    // 6. TEACHER PROFILE ASSIGNMENTS & OPTIONS
    // ----------------------------------------------------
    console.log('\n--- Testing Teacher Profile Assignments & Options ---');

    // Test 17: Assign additional batches from teacher profile
    const addProfileAssignments = await assignTeacherToBatches(
      tenantAId,
      t1.id,
      [
        {
          courseId: course2.id,
          batchId: batchAdmission.id,
          subjectIds: [subjectMath.id],
        },
      ],
      ownerUser.userId,
      ownerUser
    );
    assert(addProfileAssignments.length === 1, '1 assignment added from profile');
    ok('Test 17: assignTeacherToBatches adds assignment from profile successfully');

    // Test 18: End assignment from profile
    const ended = await endBatchTeacherAssignment(
      tenantAId,
      t1.id,
      addProfileAssignments[0].id,
      ownerUser.userId,
      ownerUser
    );
    assert(ended.status === 'ENDED' && ended.endDate !== null, 'Assignment ended with endDate');
    ok('Test 18: endBatchTeacherAssignment successfully ends assignment');

    // Test 19: Re-assigning after ending succeeds (unique active index allows ended duplicates)
    const reAssigned = await assignTeacherToBatches(
      tenantAId,
      t1.id,
      [
        {
          courseId: course2.id,
          batchId: batchAdmission.id,
          subjectIds: [subjectMath.id],
        },
      ],
      ownerUser.userId,
      ownerUser
    );
    assert(reAssigned.length === 1 && reAssigned[0].status === 'ACTIVE', 'Re-assignment is active');
    ok('Test 19: Re-assigning after ending honors partial unique active index');

    // Test 20: getTeacherAssignmentOptions returns hierarchical courses, batches, and offered subjects
    const options = await getTeacherAssignmentOptions(tenantAId, ownerUser);
    assert(options.courses.length >= 2, 'Options return courses');
    const optCourse1 = options.courses.find((c) => c.id === course1.id);
    assert(optCourse1 && optCourse1.batches.length >= 2, 'Course 1 has active batches');
    const optMorning = optCourse1?.batches.find((b) => b.id === batchMorning.id);
    assert(optMorning && optMorning.subjects.some((s) => s.id === subjectMath.id), 'Batch has offered subjects');
    ok('Test 20: getTeacherAssignmentOptions returns clean hierarchical structure');

    // ----------------------------------------------------
    // 7. TEACHER ATTENDANCE OPERATIONS
    // ----------------------------------------------------
    console.log('\n--- Testing Teacher Attendance Operations ---');

    const today = getCurrentDhakaDateOnly();
    const todayStr = today.toISOString().slice(0, 10);

    // Test 21: Record individual teacher daily attendance
    const attRecord = await recordTeacherAttendance(
      tenantAId,
      {
        teacherId: t1.id,
        date: todayStr,
        status: 'PRESENT',
        inTime: '08:45',
        outTime: '13:00',
        remarks: 'On time',
      },
      ownerUser.userId
    );
    assert(attRecord && attRecord.status === 'PRESENT', 'Attendance recorded');
    ok('Test 21: recordTeacherAttendance creates daily attendance');

    // Test 22: Update attendance
    const updatedAtt = await recordTeacherAttendance(
      tenantAId,
      {
        teacherId: t1.id,
        date: todayStr,
        status: 'LATE',
        inTime: '09:15',
        outTime: '13:00',
        remarks: 'Traffic delay',
      },
      ownerUser.userId
    );
    assert(updatedAtt.status === 'LATE' && updatedAtt.inTime === '09:15', 'Attendance updated');
    ok('Test 22: recordTeacherAttendance updates existing record cleanly (no duplicates)');

    // Test 23: Future date attendance rejected
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    await expectError(
      () =>
        recordTeacherAttendance(
          tenantAId,
          {
            teacherId: t1.id,
            date: tomorrowStr,
            status: 'PRESENT',
          },
          ownerUser.userId
        ),
      'FUTURE_DATE_NOT_ALLOWED',
      'Test 23: Future date attendance marking is rejected'
    );

    // Test 24: Bulk teacher attendance
    const bulkSaveResult = await recordTeacherBulkAttendance(
      tenantAId,
      {
        date: todayStr,
        records: [
          { teacherId: t2.id, status: 'PRESENT', inTime: '08:50' },
          { teacherId: t3.id, status: 'ABSENT', remarks: 'Sick leave' },
          { teacherId: t4.id, status: 'EXCUSED' },
        ],
      },
      ownerUser.userId,
      ownerUser
    );
    assert(bulkSaveResult.count === 3, 'Bulk attendance saved 3 records');
    ok('Test 24: recordTeacherBulkAttendance atomically saves bulk attendance');

    // Test 25: Load daily attendance roster
    const dailyRoster = await getTeachersDailyAttendance(tenantAId, { date: todayStr }, ownerUser);
    assert(dailyRoster.totalTeachers >= 4, 'Daily roster contains active teachers');
    assert(dailyRoster.presentCount >= 1, 'Roster counts present');
    assert(dailyRoster.absentCount >= 1, 'Roster counts absent');
    assert(dailyRoster.lateCount >= 1, 'Roster counts late');
    assert(dailyRoster.excusedCount >= 1, 'Roster counts excused');
    ok('Test 25: getTeachersDailyAttendance returns complete roster with accurate daily counts');

    // Test 26: Teacher Attendance History & Factual Monthly Statistics
    const attHistResult = await getTeacherAttendanceHistory(tenantAId, t1.id, { limit: 10 });
    assert(attHistResult.history.length >= 1, 'Attendance history returned');
    assert(attHistResult.stats.thisMonth.totalDays >= 1, 'Monthly stats calculated');
    assert(attHistResult.stats.thisMonth.late >= 1, 'Late count reflected in monthly stats');
    assert(attHistResult.stats.thisMonth.attendanceRate >= 0, 'Attendance rate percentage calculated');
    ok('Test 26: getTeacherAttendanceHistory computes factual monthly stats without fabricated numbers');

    // Test 27: Audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        coachingCenterId: tenantAId,
        action: {
          in: [
            'TEACHER_CREATED',
            'TEACHER_ASSIGNMENTS_ADDED',
            'TEACHER_ASSIGNMENT_ENDED',
            'TEACHER_ATTENDANCE_MARKED',
            'TEACHER_BULK_ATTENDANCE_SAVED',
          ],
        },
      },
    });
    assert(auditLogs.length >= 5, 'All Phase 12 audit actions recorded');
    ok('Test 27: Audit logging recorded across teacher creation, assignment, and attendance');

    console.log(`\n==================================================`);
    console.log(`Phase 12 Verification Complete: ${passed}/${passed} checks passed!`);
    console.log(`==================================================\n`);
  } finally {
    // Clean up created test tenants
    console.log('Cleaning up test tenants...');
    if (tenantAId) {
      await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch(() => {});
    }
    if (tenantBId) {
      await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch(() => {});
    }
    console.log('Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
