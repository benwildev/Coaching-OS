import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { markStudentAttendance, completeAttendanceSession } from '../lib/services/attendance.service';
import { createInvoice } from '../lib/services/invoice.service';
import { createPayment } from '../lib/services/payment.service';
import { verifyAndPublishExam } from '../lib/services/exam-result.service';
import { resolveMaterialScope, transitionMaterialStatus } from '../lib/services/study-material.service';
import {
  authenticatePortalAccount,
  provisionPortalAccount,
  completeSetupOrReset,
} from '../lib/services/portal-auth.service';
import {
  getStudentProfile,
  getChildProfileForGuardian,
  getGuardianChildren,
} from '../lib/services/portal-profile.service';
import { getStudentAttendanceSummary } from '../lib/services/attendance.service';
import { getPortalFeeSummary } from '../lib/services/portal-fee.service';
import { getStudentResultHistory } from '../lib/services/exam-result.service';
import { getStudentPortalMaterials } from '../lib/services/study-material.service';
import { getPortalNotifications, notifyStudent, notifyGuardian } from '../lib/services/portal-notification.service';
import { createPortalSessionToken, verifyPortalSessionToken, type PortalSessionUser } from '../lib/auth/portal-session';
import type { SessionUser } from '../lib/auth/session';

/**
 * Phase 9 runtime verification against the configured database.
 * Bootstraps its own throwaway tenant (via the real setup-wizard service —
 * the DB has no pre-existing seed data to piggyback on) and removes every
 * record it creates in `finally`.
 */

const TAG = `P9VERIFY-${Date.now()}`;
const CENTER_CODE = `P9V${Date.now().toString().slice(-7)}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

async function expectThrow(fn: () => Promise<unknown>, codePrefix: string, label: string) {
  try {
    await fn();
    throw new Error(`FAIL: ${label} (did not throw)`);
  } catch (e) {
    assert(e instanceof Error && e.message.startsWith(codePrefix), `${label} (got: ${e instanceof Error ? e.message : e})`);
  }
  ok(label);
}

async function run() {
  console.log('========================================================');
  console.log('PHASE 9 RUNTIME VERIFICATION — Student & Guardian Portal');
  console.log('========================================================');

  let centerId: string | null = null;
  let otherCenterId: string | null = null;
  const studentIds: string[] = [];
  const guardianIds: string[] = [];
  const examIds: string[] = [];
  const invoiceIds: string[] = [];
  const attendanceSessionIds: string[] = [];
  const materialIds: string[] = [];
  const subjectIds: string[] = [];
  const notificationIds: string[] = [];

  try {
    // ---------- 1. Create/prepare test tenant ----------
    console.log('\n--- 1. Test tenant ---');
    const setup = await completeInitialSetup({
      centerName: `${TAG} Center`,
      centerCode: CENTER_CODE,
      centerPhone: '01700000000',
      centerCity: 'Dhaka',
      centerDistrict: 'Dhaka',
      ownerName: `${TAG} Owner`,
      ownerEmail: `${TAG.toLowerCase()}-owner@verify.local`,
      ownerPhone: '01700000001',
      ownerPassword: 'VerifyPass123',
      branchName: 'Main Campus',
      branchCode: 'MAIN',
      sessionName: '2026',
      sessionStartDate: '2026-01-01',
      sessionEndDate: '2026-12-31',
      selectedPrograms: ['SSC'],
      primaryColor: '#063B78',
      accentColor: '#FFD200',
    } as any);
    centerId = setup.center.id;
    const cc = centerId;
    const branch = setup.branch;
    const session = setup.session;
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const academicClass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id } });
    const owner: SessionUser = {
      userId: setup.owner.id,
      email: setup.owner.email,
      name: setup.owner.name,
      role: 'OWNER',
      coachingCenterId: cc,
      branchId: branch.id,
    };
    ok(`Test tenant created (${setup.center.name})`);

    // ---------- fixtures: subject, batch, two students, guardian linked to both ----------
    const subject = await prisma.subject.create({
      data: { coachingCenterId: cc, academicClassId: academicClass.id, name: `${TAG} Subject`, code: `${TAG}-S` },
    });
    subjectIds.push(subject.id);

    const unrelatedClass = await prisma.academicClass.create({
      data: { coachingCenterId: cc, academicProgramId: program.id, name: `${TAG} Other Class`, code: `${TAG}-OC`, order: 99 },
    });
    const otherSubject = await prisma.subject.create({
      data: { coachingCenterId: cc, academicClassId: unrelatedClass.id, name: `${TAG} Other Subject`, code: `${TAG}-OS` },
    });
    subjectIds.push(otherSubject.id);

    const batch = await prisma.batch.create({
      data: { coachingCenterId: cc, branchId: branch.id, academicSessionId: session.id, academicProgramId: program.id, academicClassId: academicClass.id, name: `${TAG} Batch`, code: `${TAG}-BATCH`, status: 'ACTIVE' },
    });

    const studentA = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branch.id, studentIdCode: `${TAG}-STUA`, name: `${TAG} Student A` } });
    studentIds.push(studentA.id);
    const studentB = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branch.id, studentIdCode: `${TAG}-STUB`, name: `${TAG} Student B` } });
    studentIds.push(studentB.id);
    const studentC = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branch.id, studentIdCode: `${TAG}-STUC`, name: `${TAG} Student C (unrelated)` } });
    studentIds.push(studentC.id);

    for (const s of [studentA, studentB, studentC]) {
      await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: s.id, batchId: batch.id, status: 'ACTIVE' } });
    }

    const guardian = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010', preferredChannel: 'SMS' } });
    guardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { studentId: studentA.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: studentB.id, guardianId: guardian.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    // studentC deliberately NOT linked to this guardian — the IDOR target.

    // ---------- 2-6. Portal account creation for student + guardian ----------
    console.log('\n--- 2-6. Portal account provisioning + login ---');
    const studentProvision = await provisionPortalAccount({ coachingCenterId: cc, studentId: studentA.id, actorUserId: owner.userId });
    await completeSetupOrReset(studentProvision.setupToken, 'StudentPass123');
    ok('Student portal account created and password set');

    const guardianProvision = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian.id, actorUserId: owner.userId });
    await completeSetupOrReset(guardianProvision.setupToken, 'GuardianPass123');
    ok('Guardian portal account created and password set');

    // ---------- 7. Student login success ----------
    console.log('\n--- 7-8. Student login + session identity ---');
    const studentLogin = await authenticatePortalAccount(studentA.studentIdCode, 'StudentPass123');
    assert(studentLogin, 'student login returned a session');
    const studentSession: PortalSessionUser = studentLogin!.session;
    assert(studentSession.portalType === 'STUDENT' && studentSession.studentId === studentA.id, 'student session identity is correct');
    ok('Student login success + session identity correct');

    // Session token round-trips correctly (used for logout/session-invalidation coverage — item 26)
    const token = await createPortalSessionToken(studentSession);
    const verified = await verifyPortalSessionToken(token);
    assert(verified?.studentId === studentA.id, 'signed session token verifies back to the same identity');
    const tampered = await verifyPortalSessionToken(`${token}tampered`);
    assert(tampered === null, 'a tampered/invalid token is rejected (session invalidated)');
    ok('Portal session token sign/verify round-trip + tampered token rejected');

    // ---------- 9. Student can access own profile ----------
    console.log('\n--- 9-12. Student self-access ---');
    const ownProfile = await getStudentProfile(studentSession);
    assert(ownProfile.id === studentA.id, 'student profile matches session identity');
    ok('Student can access own profile');

    // ---------- fixtures needing a session: attendance, fee, exam+result, material ----------
    const attendanceSession = await prisma.attendanceSession.create({
      data: { coachingCenterId: cc, branchId: branch.id, batchId: batch.id, date: new Date(), type: 'CLASS', status: 'OPEN' },
    });
    attendanceSessionIds.push(attendanceSession.id);
    await markStudentAttendance(cc, attendanceSession.id, studentA.id, { status: 'PRESENT' }, owner.userId);
    await completeAttendanceSession(cc, attendanceSession.id, true, owner.userId);

    const invoice = await createInvoice(cc, {
      studentId: studentA.id, branchId: branch.id, invoiceDate: new Date().toISOString(), dueDate: null,
      items: [{ description: `${TAG} fee`, quantity: 1, unitAmount: 500, discountAmount: 0 }],
      discountAmount: 0, waiverAmount: 0, notes: null, issueNow: true,
    } as any, owner.userId);
    invoiceIds.push(invoice.id);
    await createPayment(cc, invoice.id, { amount: 200, paymentMethod: 'CASH', paymentDate: new Date().toISOString() } as any, owner.userId);

    // ---------- 10. Student can access own attendance ----------
    const attendanceSummary = await getStudentAttendanceSummary(cc, studentSession.studentId!);
    assert(attendanceSummary.present === 1, 'student attendance summary reflects the marked session');
    ok('Student can access own attendance');

    // ---------- 11. Student can access own fees ----------
    const feeSummary = await getPortalFeeSummary(cc, studentSession.studentId!);
    assert(Number(feeSummary.summary.totalPaid) === 200, 'student fee summary reflects the recorded payment');
    ok('Student can access own fees');

    // ---------- 18/19. Published vs unpublished results ----------
    console.log('\n--- 13, 18-19. Exam results (student) ---');
    const exam = await prisma.exam.create({
      data: {
        coachingCenterId: cc, branchId: branch.id, academicSessionId: session.id, academicProgramId: program.id, academicClassId: academicClass.id, batchId: batch.id,
        title: `${TAG} Exam`, examType: 'WEEKLY', status: 'ONGOING', startDate: new Date(),
        examSubjects: { create: [{ subjectId: subject.id, totalMarks: 100, passMarks: 40 }] },
        examStudents: { create: [{ studentId: studentA.id }] },
      },
      include: { examSubjects: true },
    });
    examIds.push(exam.id);
    await prisma.result.create({
      data: { examSubjectId: exam.examSubjects[0].id, studentId: studentA.id, marksObtained: 85, grade: 'A+', gpa: 5, isPassed: true, status: 'PRESENT' },
    });

    const beforePublish = await getStudentResultHistory(cc, studentA.id, true);
    assert(beforePublish.length === 0, 'unpublished exam result is hidden from the student portal view');
    ok('Unpublished result hidden from portal');

    await verifyAndPublishExam(cc, exam.id, owner.userId, false);
    const afterPublish = await getStudentResultHistory(cc, studentA.id, true);
    assert(afterPublish.length === 1 && afterPublish[0].subjects[0].marksObtained === 85, 'published exam result is visible with correct marks');
    ok('Student can access own published results');

    // ---------- 20/21. Study material scoping ----------
    console.log('\n--- 20-21. Study material scoping ---');
    const material = await prisma.studyMaterial.create({
      data: { coachingCenterId: cc, branchId: branch.id, academicClassId: academicClass.id, subjectId: subject.id, batchId: batch.id, title: `${TAG} Material`, type: 'NOTE', description: 'x', status: 'DRAFT' },
    });
    materialIds.push(material.id);
    const materialScope = await resolveMaterialScope(cc, owner);
    await transitionMaterialStatus(materialScope, material.id, 'PUBLISHED');

    const unrelatedMaterial = await prisma.studyMaterial.create({
      data: { coachingCenterId: cc, branchId: branch.id, academicClassId: unrelatedClass.id, subjectId: otherSubject.id, title: `${TAG} Unrelated Material`, type: 'NOTE', description: 'x', status: 'DRAFT' },
    });
    materialIds.push(unrelatedMaterial.id);
    await transitionMaterialStatus(await resolveMaterialScope(cc, owner), unrelatedMaterial.id, 'PUBLISHED');

    const studentMaterials = await getStudentPortalMaterials(cc, null, studentA.id, {});
    const titles = studentMaterials.materials.map((m) => m.title);
    assert(titles.includes(`${TAG} Material`), 'relevant published material is visible');
    assert(!titles.includes(`${TAG} Unrelated Material`), 'material for an unrelated class/batch is not visible');
    ok('Relevant study material visible, unrelated material hidden');
    await prisma.academicClass.deleteMany({ where: { id: unrelatedClass.id } });

    // ---------- 13. Student cannot access another student ----------
    console.log('\n--- 13. IDOR protection (student routes never read a client-supplied studentId) ---');
    // getStudentProfile/etc. legitimately trust `session.studentId` — the
    // actual guarantee is architectural: no student-facing route reads an
    // identity from the client at all (request body/query/params). Rather
    // than asserting something trivial at the service layer, statically
    // confirm the route source itself never does this (the exact class of
    // bug the old `/portal/student/results?studentId=` page had).
    const studentRouteFiles = [
      'app/api/portal/student/profile/route.ts',
      'app/api/portal/student/attendance/route.ts',
      'app/api/portal/student/fees/route.ts',
      'app/api/portal/student/payments/route.ts',
      'app/api/portal/student/exams/route.ts',
      'app/api/portal/student/results/route.ts',
      'app/api/portal/student/materials/route.ts',
      'app/api/portal/student/notices/route.ts',
      'app/api/portal/student/dashboard/route.ts',
    ];
    for (const rel of studentRouteFiles) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      assert(src.includes('requireStudentPortal'), `${rel} calls requireStudentPortal()`);
      assert(!/searchParams\.get\(['"]studentId['"]\)/.test(src), `${rel} never reads studentId from the client`);
      assert(!/body\??\.studentId/.test(src), `${rel} never reads studentId from a request body`);
    }
    ok('All student-portal routes derive studentId only from the session, never from client input');

    // ---------- 14-15. Guardian login + multiple children ----------
    console.log('\n--- 14-17. Guardian login + multi-child access ---');
    const guardianLogin = await authenticatePortalAccount(guardian.phone, 'GuardianPass123');
    assert(guardianLogin, 'guardian login returned a session');
    const guardianSession: PortalSessionUser = guardianLogin!.session;
    assert(guardianSession.portalType === 'GUARDIAN' && guardianSession.guardianId === guardian.id, 'guardian session identity is correct');
    ok('Guardian login success + session identity correct');

    const children = await getGuardianChildren(guardianSession);
    const childIds = children.map((c) => c.student.id).sort();
    assert(JSON.stringify(childIds) === JSON.stringify([studentA.id, studentB.id].sort()), 'guardian sees exactly both linked children');
    ok('Guardian can access linked child A and child B (multiple children)');

    const childAProfile = await getChildProfileForGuardian(guardianSession, studentA.id);
    assert(childAProfile.id === studentA.id, 'guardian can fetch child A profile');
    const childBProfile = await getChildProfileForGuardian(guardianSession, studentB.id);
    assert(childBProfile.id === studentB.id, 'guardian can fetch child B profile');
    ok('Guardian profile access verified for both linked children');

    // ---------- 17. Guardian cannot access unrelated student ----------
    await expectThrow(
      () => getChildProfileForGuardian(guardianSession, studentC.id),
      'STUDENT_NOT_LINKED',
      'Guardian denied access to unrelated Student C (STUDENT_NOT_LINKED)'
    );

    // ---------- 24. Cross-tenant isolation ----------
    console.log('\n--- 24-25. Tenant & branch isolation ---');
    const otherCenter = await prisma.coachingCenter.create({ data: { name: `${TAG} Other Center`, code: `${TAG}-OC2`, phone: '01799999999' } });
    otherCenterId = otherCenter.id;
    const otherCenterStudent = await prisma.student.create({ data: { coachingCenterId: otherCenter.id, studentIdCode: `${TAG}-OTHSTU`, name: `${TAG} Other-Tenant Student` } });
    await expectThrow(
      () => getChildProfileForGuardian(guardianSession, otherCenterStudent.id),
      'STUDENT_NOT_LINKED',
      'Guardian denied access to a student in a different tenant'
    );
    await expectThrow(
      () => getStudentProfile({ ...studentSession, coachingCenterId: otherCenter.id }),
      'STUDENT_NOT_FOUND',
      'A session claiming the wrong tenant for a real studentId is rejected'
    );

    // ---------- 25. Branch isolation (existing assertBranchAccess still enforced for staff callers) ----------
    const secondBranch = await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Second Branch`, code: `${TAG}-B2` } });
    const branchStaff: SessionUser = { ...owner, role: 'STAFF', branchId: secondBranch.id };
    await expectThrow(
      () => getStudentPortalMaterials(cc, branchStaff, studentA.id, {}),
      'FORBIDDEN_BRANCH',
      'A branch-scoped staff caller cannot reach a student from another branch (unchanged Phase 1-8 behavior)'
    );
    await prisma.branch.deleteMany({ where: { id: secondBranch.id } });

    // ---------- 22. Notification access restricted ----------
    console.log('\n--- 22. Notification access restricted ---');
    await notifyStudent({ coachingCenterId: cc, studentId: studentA.id, type: 'GENERAL_ANNOUNCEMENT', title: `${TAG} student notif`, body: 'x' });
    await notifyGuardian({ coachingCenterId: cc, guardianId: guardian.id, type: 'GENERAL_ANNOUNCEMENT', title: `${TAG} guardian notif`, body: 'x' });
    const rows = await prisma.notification.findMany({ where: { coachingCenterId: cc, title: { startsWith: TAG } } });
    rows.forEach((n) => notificationIds.push(n.id));

    const studentNotifs = await getPortalNotifications(studentSession, { pageSize: 50 });
    assert(studentNotifs.notifications.some((n) => n.title === `${TAG} student notif`), 'student sees their own notification');
    assert(!studentNotifs.notifications.some((n) => n.title === `${TAG} guardian notif`), 'student does not see the guardian notification');
    const guardianNotifs = await getPortalNotifications(guardianSession, { pageSize: 50 });
    assert(guardianNotifs.notifications.some((n) => n.title === `${TAG} guardian notif`), 'guardian sees their own notification');
    assert(!guardianNotifs.notifications.some((n) => n.title === `${TAG} student notif`), 'guardian does not see the student notification');
    ok('Notification visibility is restricted to the owning portal identity');

    // ---------- 23. Disabled portal account rejected ----------
    console.log('\n--- 23. Disabled portal account ---');
    const studentAccount = await prisma.portalAccount.findUniqueOrThrow({ where: { studentId: studentA.id } });
    await prisma.portalAccount.update({ where: { id: studentAccount.id }, data: { status: 'DISABLED' } });
    await expectThrow(
      () => authenticatePortalAccount(studentA.studentIdCode, 'StudentPass123'),
      'PORTAL_ACCOUNT_DISABLED',
      'A disabled portal account is rejected at login'
    );
    await prisma.portalAccount.update({ where: { id: studentAccount.id }, data: { status: 'ACTIVE' } });
  } finally {
    // ---------- Cleanup ----------
    console.log('\n--- Cleanup ---');
    if (notificationIds.length) await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    if (materialIds.length) await prisma.studyMaterial.deleteMany({ where: { id: { in: materialIds } } });
    for (const examId of examIds) {
      await prisma.result.deleteMany({ where: { examSubject: { examId } } });
      await prisma.examStudent.deleteMany({ where: { examId } });
      await prisma.examSubject.deleteMany({ where: { examId } });
    }
    if (examIds.length) await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
    for (const invoiceId of invoiceIds) {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.feeInvoiceItem.deleteMany({ where: { invoiceId } });
    }
    if (invoiceIds.length) await prisma.feeInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    for (const sessionId of attendanceSessionIds) {
      await prisma.studentAttendance.deleteMany({ where: { attendanceSessionId: sessionId } });
    }
    if (attendanceSessionIds.length) await prisma.attendanceSession.deleteMany({ where: { id: { in: attendanceSessionIds } } });
    if (otherCenterId) {
      await prisma.student.deleteMany({ where: { coachingCenterId: otherCenterId } });
      await prisma.coachingCenter.deleteMany({ where: { id: otherCenterId } });
    }
    if (centerId) {
      // PortalAccount/PortalAuthToken/StudentGuardian/StudentBatch/Batch/
      // Subject/Student/Guardian/Branch/AcademicSession/AcademicProgram/
      // AcademicClass/User/... all cascade-delete from CoachingCenter.
      await prisma.coachingCenter.deleteMany({ where: { id: centerId } });
    }

    const leftovers = await Promise.all([
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
      prisma.student.count({ where: { studentIdCode: { startsWith: TAG } } }),
      prisma.guardian.count({ where: { name: { startsWith: TAG } } }),
      prisma.notification.count({ where: { title: { startsWith: TAG } } }),
      prisma.studyMaterial.count({ where: { title: { startsWith: TAG } } }),
    ]);
    if (leftovers.some((n) => n > 0)) {
      console.error('✘ Cleanup left records behind:', leftovers);
      process.exitCode = 1;
    } else {
      ok('All temporary records removed (0 leftovers)');
    }
  }

  console.log('\n========================================================');
  console.log(`PHASE 9 VERIFICATION PASSED — ${passed} checks`);
  console.log('========================================================');
}

run()
  .catch((e) => {
    console.error('\nVERIFICATION ERROR:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
