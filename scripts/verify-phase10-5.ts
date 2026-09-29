import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { notifyStudentGuardians } from '../lib/services/guardian-notify.service';
import { linkTeacherAccount } from '../lib/services/teacher.service';
import { assignStudentToBatch } from '../lib/services/batch.service';
import { bulkSaveSubjectResults, verifyAndPublishExam } from '../lib/services/exam-result.service';
import type { SessionUser } from '../lib/auth/session';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';

/**
 * Phase 10.5 — Operational Integrity verification.
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase10-5.ts
 *
 * Builds its own throwaway tenant(s) and removes everything in `finally`.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P105-${Date.now()}`;
const PW = 'CorrectHorse9';
let passed = 0;

// assignStudentToBatch now takes a SessionUser to enforce branch access on
// the enrolling student (Phase 11 fix) — these direct service calls run as
// a center-wide OWNER, for whom assertBranchAccess is always a no-op.
const OWNER_USER = { role: 'OWNER', branchId: null } as unknown as SessionUser;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

interface Resp {
  status: number;
  body: Record<string, unknown>;
  cookies: Record<string, { value: string }>;
}
async function request(method: string, path: string, opts: { payload?: unknown; cookie?: string } = {}): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.payload !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined, redirect: 'manual' });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { body = { _text: text.slice(0, 200) }; }
  const cookies: Resp['cookies'] = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = { value: pair.slice(i + 1) };
  }
  return { status: res.status, body, cookies };
}
const post = (path: string, payload: unknown, cookie?: string) => request('POST', path, { payload, cookie });
const get = (path: string, cookie?: string) => request('GET', path, { cookie });
const put = (path: string, payload: unknown, cookie?: string) => request('PUT', path, { payload, cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name, centerCode: code, centerPhone: '01700000000', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`, ownerEmail: `${code.toLowerCase()}-owner@verify.local`, ownerPhone: `019${Date.now().toString().slice(-8)}`, ownerPassword: PW,
    branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC'], primaryColor: '#063B78', accentColor: '#FFD200',
  } as Parameters<typeof completeInitialSetup>[0]);
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 10.5 OPERATIONAL INTEGRITY VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerA: string | null = null;
  let centerB: string | null = null;
  try {
    const codeA = `P5A${Date.now().toString().slice(-7)}`;
    const codeB = `P5B${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerA = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerB = b.center.id;
    const cc = centerA;
    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: cc } });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER') =>
      prisma.user.create({
        data: { coachingCenterId: cc, branchId: a.branch.id, email, passwordHash: hashPassword(PW), name: `${TAG} ${email}`, roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId: a.branch.id } } },
      });
    const admin = await mkUser(e('admin'), 'ADMIN');
    const teacherUser = await mkUser(e('teacher'), 'TEACHER');
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id } });
    ok('Fixtures: 2 tenants, OWNER/ADMIN/TEACHER, academic structure');

    const ownerLogin = await login(a.owner.email, PW);
    const ownerCookie = cookieOf(ownerLogin, SESSION_COOKIE_NAME);
    const adminLogin = await login(admin.email, PW);
    const adminCookie = cookieOf(adminLogin, SESSION_COOKIE_NAME);

    // ================================================================
    // 1-6. Teacher <-> User linking + Teacher Dashboard
    // ================================================================
    const teacher = await prisma.teacher.create({
      data: { coachingCenterId: cc, branchId: a.branch.id, teacherCode: `${TAG}-T1`, name: `${TAG} Teacher`, phone: '01711111111' },
    });
    assert(teacher.userId === null, 'teacher starts unlinked');

    const linkResult = await linkTeacherAccount(cc, teacher.id, { mode: 'link', userId: teacherUser.id }, a.owner.id, 'OWNER');
    assert(linkResult.userId === teacherUser.id, 'linkTeacherAccount links the existing TEACHER-role user');
    const relinked = await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
    assert(relinked.userId === teacherUser.id, 'Teacher.userId set after linking');
    ok('1. Teacher can be securely linked to a User account (existing TEACHER-role user)');

    // Cannot link an ADMIN-role user as a teacher.
    const teacher2 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: a.branch.id, teacherCode: `${TAG}-T2`, name: `${TAG} Teacher 2`, phone: '01711111112' } });
    let rejectedNonTeacher = false;
    try {
      await linkTeacherAccount(cc, teacher2.id, { mode: 'link', userId: admin.id }, a.owner.id, 'OWNER');
    } catch (err) {
      rejectedNonTeacher = err instanceof Error && err.message.startsWith('INVALID_TEACHER_ACCOUNT');
    }
    assert(rejectedNonTeacher, 'linking an ADMIN-role user as a teacher account is rejected');
    ok('   Non-TEACHER-role accounts cannot be linked as a teacher login');

    // Cross-tenant link rejected.
    const bUser = await prisma.user.create({ data: { coachingCenterId: centerB, branchId: b.branch.id, email: e('crossuser'), passwordHash: hashPassword(PW), name: `${TAG} cross` } });
    let rejectedCrossTenant = false;
    try {
      await linkTeacherAccount(cc, teacher2.id, { mode: 'link', userId: bUser.id }, a.owner.id, 'OWNER');
    } catch (err) {
      rejectedCrossTenant = err instanceof Error && err.message.startsWith('USER_NOT_FOUND');
    }
    assert(rejectedCrossTenant, 'linking a foreign-tenant user is rejected');
    ok('   Cross-tenant account linking rejected');

    // Teacher logs in through the same unified /login.
    const teacherLogin = await login(teacherUser.email, PW);
    assert(teacherLogin.status === 200 && teacherLogin.body.redirectTo === '/dashboard', `teacher login via unified /login (got ${teacherLogin.status})`);
    const teacherCookie = cookieOf(teacherLogin, SESSION_COOKIE_NAME);
    ok('2. Teacher authenticates through the same unified /login, redirected to /dashboard');

    // Batch/subject/schedule for the teacher's assignment.
    const batchA = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Batch A`, code: `${TAG}-BA`, status: 'ACTIVE', capacity: 40 } });
    const subjectPhysics = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Physics`, code: `${TAG}-PHY` } });
    const subjectChem = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Chemistry`, code: `${TAG}-CHE` } });
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: batchA.id, subjectId: subjectPhysics.id, teacherId: teacher.id, status: 'ACTIVE' } });
    await prisma.teacherSubject.create({ data: { teacherId: teacher.id, subjectId: subjectPhysics.id } });

    const stA = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student A` } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: stA.id, batchId: batchA.id, joinedAt: new Date('2026-01-01'), status: 'ACTIVE' } });

    const dashRes = await get('/dashboard', teacherCookie);
    assert(dashRes.status === 200, `teacher dashboard renders (got ${dashRes.status})`);
    const dashHtml = dashRes.body._text as string | undefined;
    assert(!dashHtml || (!dashHtml.includes('Fees collected') && !dashHtml.includes('Outstanding fees')), 'teacher dashboard HTML has no financial figures');
    ok('3. Teacher dashboard renders with no owner financial data');

    // A batch-unrelated exam subject must not appear in this teacher's "pending marks" — assignment scoping check via the service directly.
    const { getTeacherDashboardData } = await import('../lib/services/teacher.service');
    const teacherDash = await getTeacherDashboardData(cc, teacherUser.id);
    assert(teacherDash.linked === true, 'teacher dashboard data resolves the linked Teacher profile');
    if (teacherDash.linked) {
      assert(teacherDash.assignments.some((x) => x.batchId === batchA.id && x.subjectId === subjectPhysics.id), 'teacher sees own assignment');
      assert(!teacherDash.assignments.some((x) => x.subjectId === subjectChem.id), 'teacher does NOT see an unrelated subject');
    }
    ok('4. Teacher dashboard is scoped to the teacher’s own assignments (resolved from the session, not a client id)');

    // ================================================================
    // 5-9. Attendance: multiple classes per batch per day
    // ================================================================
    const schedulePhysics = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: batchA.id, subjectId: subjectPhysics.id, teacherId: teacher.id, dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00' } });
    const scheduleChem = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: batchA.id, subjectId: subjectChem.id, dayOfWeek: 'MONDAY', startTime: '11:00', endTime: '12:00' } });
    const scheduleMath = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: batchA.id, subjectId: subjectPhysics.id, dayOfWeek: 'MONDAY', startTime: '14:00', endTime: '15:00' } });

    const sameDate = '2026-09-28';
    const s1 = await post('/api/attendance/sessions', { classScheduleId: schedulePhysics.id, date: sameDate }, ownerCookie);
    assert(s1.status === 201, `first class session opens (got ${s1.status} ${JSON.stringify(s1.body)})`);
    const s2 = await post('/api/attendance/sessions', { classScheduleId: scheduleChem.id, date: sameDate }, ownerCookie);
    assert(s2.status === 201, `second class (different schedule), SAME batch, SAME date opens (got ${s2.status} ${JSON.stringify(s2.body)})`);
    const s3 = await post('/api/attendance/sessions', { classScheduleId: scheduleMath.id, date: sameDate }, ownerCookie);
    assert(s3.status === 201, `third class, SAME batch, SAME date opens (got ${s3.status} ${JSON.stringify(s3.body)})`);
    ok('5. Same batch, same day: three separate class attendance sessions all succeed');

    const s1repeat = await post('/api/attendance/sessions', { classScheduleId: schedulePhysics.id, date: sameDate }, ownerCookie);
    assert(s1repeat.status === 201 && (s1repeat.body as any).id === (s1.body as any).id, `re-opening the SAME class/date returns the SAME session, not a duplicate (got id ${JSON.stringify((s1repeat.body as any).id)})`);
    ok('6. Duplicate same class/date attendance is idempotent (returns the existing session)');

    const batchB = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Batch B`, code: `${TAG}-BB`, status: 'ACTIVE', capacity: 40 } });
    const scheduleB = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: batchB.id, subjectId: subjectPhysics.id, dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00' } });
    const sB = await post('/api/attendance/sessions', { classScheduleId: scheduleB.id, date: sameDate }, ownerCookie);
    assert(sB.status === 201, `a DIFFERENT batch, same date, same time slot also succeeds (got ${sB.status})`);
    ok('7. Different batches, same date: allowed');

    // ================================================================
    // 8-11. Sibling-safe notifications
    // ================================================================
    const guardian = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01799990000' } });
    const childA = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-CA`, name: `${TAG} Child A` } });
    const childB = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-CB`, name: `${TAG} Child B` } });
    await prisma.studentGuardian.create({ data: { studentId: childA.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true } });
    await prisma.studentGuardian.create({ data: { studentId: childB.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true } });
    // In-app Notification rows are only mirrored when a PortalAccount
    // exists (see notifyPortalAccountsForEvent) — provision one for the
    // guardian so this test actually exercises that path.
    const { provisionPortalAccount: provisionGuardianAccount, completeSetupOrReset: completeGuardianSetup } = await import('../lib/services/portal-auth.service');
    const guardianAcc = await provisionGuardianAccount({ coachingCenterId: cc, guardianId: guardian.id, actorUserId: a.owner.id });
    await completeGuardianSetup(guardianAcc.setupToken, 'GuardianPass123');

    const sharedSourceId = `shared-${TAG}`;
    await notifyStudentGuardians({ coachingCenterId: cc, branchId: a.branch.id, studentId: childA.id, event: 'FEE_PAYMENT_RECEIVED', vars: { studentName: 'A' }, sourceType: 'Payment', sourceId: sharedSourceId });
    await notifyStudentGuardians({ coachingCenterId: cc, branchId: a.branch.id, studentId: childB.id, event: 'FEE_PAYMENT_RECEIVED', vars: { studentName: 'B' }, sourceType: 'Payment', sourceId: sharedSourceId });

    const guardianNotifs = await prisma.notification.findMany({ where: { guardianId: guardian.id, sourceType: 'Payment', sourceId: sharedSourceId } });
    assert(guardianNotifs.length === 2, `guardian with 2 children gets 2 notifications for the same shared-sourceId event, not 1 (got ${guardianNotifs.length}) — no P2002 crash occurred`);
    assert(new Set(guardianNotifs.map((n) => n.guardianStudentId)).size === 2, 'the two notifications are correctly distinguished by guardianStudentId');
    ok('8. Sibling-safe: guardian with two children, same event/sourceId → two distinct notifications, no crash');

    // Repeat the SAME event for child A again — must stay idempotent (no 3rd row).
    await notifyStudentGuardians({ coachingCenterId: cc, branchId: a.branch.id, studentId: childA.id, event: 'FEE_PAYMENT_RECEIVED', vars: { studentName: 'A' }, sourceType: 'Payment', sourceId: sharedSourceId });
    const afterRepeat = await prisma.notification.findMany({ where: { guardianId: guardian.id, sourceType: 'Payment', sourceId: sharedSourceId } });
    assert(afterRepeat.length === 2, `repeating the exact same event for child A stays idempotent — still 2 rows, not 3 (got ${afterRepeat.length})`);
    ok('9. Duplicate identical event remains idempotent (no 3rd row for a repeat)');

    // A genuinely different event for child A is preserved alongside the shared one.
    await notifyStudentGuardians({ coachingCenterId: cc, branchId: a.branch.id, studentId: childA.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'A' }, sourceType: 'StudentAttendance', sourceId: `${sharedSourceId}-att` });
    const distinctEvent = await prisma.notification.findMany({ where: { guardianId: guardian.id, guardianStudentId: childA.id } });
    assert(distinctEvent.length >= 2, 'a genuinely different event for the same child is preserved (not deduped away)');
    ok('10. Legitimate different events for the same child are both preserved');

    const commLogs = await prisma.communicationLog.findMany({ where: { guardianId: guardian.id, sourceType: 'Payment', sourceId: sharedSourceId } });
    assert(commLogs.length === 2, `communication log also has 2 rows (one per child), not 1 (got ${commLogs.length})`);
    ok('11. CommunicationLog (SMS/email dispatch log) is also sibling-safe');

    // ================================================================
    // 12-13. Student portal: no fabricated data, ownership-scoped
    // ================================================================
    const spStudent = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-PORTAL`, name: `${TAG} Portal Student`, email: e('portalstudent') } });
    const { provisionPortalAccount, completeSetupOrReset } = await import('../lib/services/portal-auth.service');
    const spAcc = await provisionPortalAccount({ coachingCenterId: cc, studentId: spStudent.id, actorUserId: a.owner.id });
    await completeSetupOrReset(spAcc.setupToken, 'StudentPass123');
    const spLogin = await login(spStudent.email!, 'StudentPass123');
    const spCookie = cookieOf(spLogin, 'coaching_os_portal_session');

    const spDash = await get('/api/portal/student/dashboard', spCookie);
    assert(spDash.status === 200 && (spDash.body as any).student?.name === spStudent.name, 'student dashboard API resolves the correct own student from the session');
    assert((spDash.body as any).attendance?.total === 0, 'a student with no attendance history gets an honest zero, not a fabricated percentage');
    const spTimetable = await get('/api/portal/student/timetable', spCookie);
    assert(spTimetable.status === 200 && Array.isArray((spTimetable.body as any).timetable) && (spTimetable.body as any).timetable.length === 0, 'a student with no active batch gets an empty real timetable, not a static mock');
    ok('12. Student portal dashboard/timetable are real and honestly empty when there is no data');

    // Assign the portal student to batchA and verify the timetable now reflects it for real.
    await assignStudentToBatch(cc, OWNER_USER, batchA.id, { studentId: spStudent.id, startDate: '2026-01-01', overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    const spTimetable2 = await get('/api/portal/student/timetable', spCookie);
    const entries2 = (spTimetable2.body as any).timetable as Array<{ subjectName: string }>;
    assert(entries2.some((x) => x.subjectName === subjectPhysics.name), 'after being assigned to a batch, the student’s real ClassSchedule rows appear in their timetable');
    ok('13. Student timetable is database-driven, reflecting real batch assignment');

    // ================================================================
    // 14-16. Published-result correction keeps ranking consistent
    // ================================================================
    const stR1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-R1`, name: `${TAG} Rank1` } });
    const stR2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-R2`, name: `${TAG} Rank2` } });
    await prisma.studentBatch.createMany({ data: [stR1, stR2].map((s) => ({ coachingCenterId: cc, studentId: s.id, batchId: batchA.id, joinedAt: new Date('2026-01-01'), status: 'ACTIVE' })) });

    const exam = await prisma.exam.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, batchId: batchA.id, title: `${TAG} Exam`, examType: 'WEEKLY', startDate: new Date(), status: 'DRAFT' } });
    const examSubject = await prisma.examSubject.create({ data: { examId: exam.id, subjectId: subjectPhysics.id, totalMarks: 100, passMarks: 33 } });
    await prisma.examStudent.createMany({ data: [stR1, stR2].map((s) => ({ examId: exam.id, studentId: s.id })) });
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'ONGOING' } });

    const ownerSession: SessionUser = { userId: a.owner.id, email: a.owner.email, phone: null, name: a.owner.name, banglaName: null, role: 'OWNER', coachingCenterId: cc, branchId: a.branch.id, sessionVersion: 0 };
    await bulkSaveSubjectResults(cc, exam.id, examSubject.id, [
      { studentId: stR1.id, status: 'PRESENT', marksObtained: 90 },
      { studentId: stR2.id, status: 'PRESENT', marksObtained: 70 },
    ] as any, ownerSession);
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'COMPLETED' } });
    await verifyAndPublishExam(cc, exam.id, a.owner.id, false);

    const before = await prisma.result.findMany({ where: { examSubjectId: examSubject.id }, select: { studentId: true, rank: true } });
    const r1Before = before.find((r) => r.studentId === stR1.id)!;
    const r2Before = before.find((r) => r.studentId === stR2.id)!;
    assert(r1Before.rank === 1 && r2Before.rank === 2, `initial publish ranks correctly: R1=1st (${r1Before.rank}), R2=2nd (${r2Before.rank})`);
    ok('14. Publish computes correct initial ranking');

    // OWNER corrects R2's marks post-publish to overtake R1.
    const correctResult = await bulkSaveSubjectResults(cc, exam.id, examSubject.id, [
      { studentId: stR2.id, status: 'PRESENT', marksObtained: 99 },
    ] as any, ownerSession);
    assert((correctResult as any).rankRecomputed === true, 'post-publish correction reports that ranking was recomputed');

    const after = await prisma.result.findMany({ where: { examSubjectId: examSubject.id }, select: { studentId: true, rank: true, marksObtained: true } });
    const r1After = after.find((r) => r.studentId === stR1.id)!;
    const r2After = after.find((r) => r.studentId === stR2.id)!;
    assert(Number(r2After.marksObtained) === 99, 'corrected marks were saved');
    assert(r2After.rank === 1 && r1After.rank === 2, `ranking is IMMEDIATELY consistent after a post-publish correction — R2 now 1st (${r2After.rank}), R1 now 2nd (${r1After.rank})`);
    ok('15. Published result correction keeps ranking consistent — no stale rank, no separate re-publish needed');

    const correctionAudit = await prisma.auditLog.findFirst({ where: { coachingCenterId: cc, action: 'RESULTS_UPDATED', entityId: examSubject.id }, orderBy: { createdAt: 'desc' } });
    assert(!!correctionAudit, 'a RESULTS_UPDATED audit entry exists for the correction');
    // recordAuditLog JSON.stringify's `details` before writing it to the
    // Json column (see lib/services/audit.service.ts), so it comes back as
    // an encoded string, not a parsed object.
    const auditDetails = typeof correctionAudit!.details === 'string' ? JSON.parse(correctionAudit!.details) : (correctionAudit!.details as any);
    assert(Array.isArray(auditDetails.changes) && auditDetails.changes.some((c: any) => c.studentId === stR2.id && c.oldMarks === 70 && c.newMarks === 99), `audit entry captures the OLD and NEW mark for the corrected student (got ${JSON.stringify(auditDetails.changes)})`);
    ok('16. Post-publication correction is audited with old → new marks, student, and actor');

    // TEACHER cannot correct marks once the exam is PUBLISHED (OWNER/ADMIN only).
    let teacherPublishRejected = false;
    try {
      const teacherSession: SessionUser = { userId: teacherUser.id, email: teacherUser.email, phone: null, name: teacherUser.name, banglaName: null, role: 'TEACHER', coachingCenterId: cc, branchId: a.branch.id, sessionVersion: 0 };
      await bulkSaveSubjectResults(cc, exam.id, examSubject.id, [{ studentId: stR1.id, status: 'PRESENT', marksObtained: 50 }] as any, teacherSession);
    } catch (err) {
      teacherPublishRejected = err instanceof Error && err.message.startsWith('FORBIDDEN');
    }
    assert(teacherPublishRejected, 'a TEACHER cannot correct marks on a PUBLISHED exam (OWNER/ADMIN only)');
    ok('   Teacher correction of a published result is rejected');

    // ================================================================
    // 17-21. Branch authorization (spot checks across newly-hardened routes)
    // ================================================================
    const branch2 = await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Branch 2`, code: 'B2' } });
    const staffB2 = await mkUser(e('staffb2'), 'STAFF');
    await prisma.roleAssignment.updateMany({ where: { userId: staffB2.id }, data: { branchId: branch2.id } });
    await prisma.user.update({ where: { id: staffB2.id }, data: { branchId: branch2.id } });
    const staffB2Login = await login(staffB2.email, PW);
    const staffB2Cookie = cookieOf(staffB2Login, SESSION_COOKIE_NAME);

    const batchListB2 = await get(`/api/batches?branch=${a.branch.id}`, staffB2Cookie);
    const batchIds = ((batchListB2.body as any).batches as Array<{ id: string }> | undefined)?.map((x) => x.id) ?? [];
    assert(!batchIds.includes(batchA.id), `Branch-2 STAFF cannot list Branch-A's batches via ?branch= override (got ${batchIds.length} results)`);
    ok('17. Branch A -> Branch B batch list: cross-branch override rejected');

    const batchGetB2 = await get(`/api/batches/${batchA.id}`, staffB2Cookie);
    assert(batchGetB2.status === 403, `Branch-2 STAFF cannot read a Branch-A batch by id (got ${batchGetB2.status})`);
    ok('18. Branch A -> Branch B batch read: denied');

    const scheduleHijack = await put(`/api/schedules/${schedulePhysics.id}`, { branchId: branch2.id, batchId: batchA.id, subjectId: subjectPhysics.id, dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00' }, staffB2Cookie);
    assert(scheduleHijack.status === 403, `Branch-2 STAFF cannot hijack a Branch-A schedule into their own branch (got ${scheduleHijack.status})`);
    const scheduleUnchanged = await prisma.classSchedule.findUniqueOrThrow({ where: { id: schedulePhysics.id } });
    assert(scheduleUnchanged.branchId === a.branch.id, 'the schedule’s branch was NOT changed by the rejected request');
    ok('19. Branch A -> Branch B schedule hijack via PUT: denied, record unchanged');

    const examStartCross = await post(`/api/exams/${exam.id}/start`, {}, staffB2Cookie);
    assert(examStartCross.status === 403 || examStartCross.status === 400, `Branch-2 STAFF cannot transition a Branch-A exam (got ${examStartCross.status})`);
    ok('20. Branch A -> Branch B exam lifecycle transition: denied');

    const commLogsCross = await get('/api/communication/logs', staffB2Cookie);
    const crossLogRows = ((commLogsCross.body as any).logs as Array<{ id: string }> | undefined) ?? [];
    const crossLogIds = new Set(commLogs.map((l) => l.id));
    assert(!crossLogRows.some((r) => crossLogIds.has(r.id)), 'Branch-2 STAFF cannot see Branch-A’s (well, main-branch’s) communication logs');
    ok('21. Communication logs are branch-scoped for branch-locked STAFF');

    // ================================================================
    // 22-25. Batch capacity & enrollment integrity
    // ================================================================
    const tinyBatch = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Tiny`, code: `${TAG}-TINY`, status: 'ACTIVE', capacity: 1 } });
    const capStudent1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-CAP1`, name: `${TAG} Cap1` } });
    const capStudent2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-CAP2`, name: `${TAG} Cap2` } });

    await assignStudentToBatch(cc, OWNER_USER, tinyBatch.id, { studentId: capStudent1.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    let capacityRejected = false;
    try {
      await assignStudentToBatch(cc, OWNER_USER, tinyBatch.id, { studentId: capStudent2.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    } catch (err) {
      capacityRejected = err instanceof Error && err.message.startsWith('BATCH_FULL');
    }
    assert(capacityRejected, 'assigning a 2nd student to a capacity=1 batch is rejected');
    ok('22. Batch capacity is enforced');

    // Concurrent assignment safety: two students racing for the last seat in a capacity=1 batch (already 1/1 full after the sequential test above created and rejected — set up a FRESH capacity=1 batch for a true concurrency test).
    const raceBatch = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Race`, code: `${TAG}-RACE`, status: 'ACTIVE', capacity: 1 } });
    const raceStudent1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-RACE1`, name: `${TAG} Race1` } });
    const raceStudent2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-RACE2`, name: `${TAG} Race2` } });
    const raceResults = await Promise.allSettled([
      assignStudentToBatch(cc, OWNER_USER, raceBatch.id, { studentId: raceStudent1.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id),
      assignStudentToBatch(cc, OWNER_USER, raceBatch.id, { studentId: raceStudent2.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id),
    ]);
    const succeeded = raceResults.filter((r) => r.status === 'fulfilled').length;
    assert(succeeded === 1, `exactly one of two concurrent assignments to a capacity=1 batch succeeds (got ${succeeded})`);
    const finalCount = await prisma.studentBatch.count({ where: { batchId: raceBatch.id, status: 'ACTIVE' } });
    assert(finalCount === 1, `the batch never exceeds its capacity even under a real race (active count = ${finalCount})`);
    ok('23. Concurrent enrollment is race-safe — capacity is never exceeded');

    // Legitimate non-conflicting multi-batch enrollment allowed.
    const multiStudent = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-MULTI`, name: `${TAG} Multi` } });
    const nonConflictBatch = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} NoConflict`, code: `${TAG}-NC`, status: 'ACTIVE', capacity: 40 } });
    await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: nonConflictBatch.id, subjectId: subjectChem.id, dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '10:00' } });
    await assignStudentToBatch(cc, OWNER_USER, batchA.id, { studentId: multiStudent.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    await assignStudentToBatch(cc, OWNER_USER, nonConflictBatch.id, { studentId: multiStudent.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    ok('24. A student may legitimately join two batches whose schedules do not conflict');

    // Genuine schedule conflict rejected.
    const conflictBatch = await prisma.batch.create({ data: { coachingCenterId: cc, branchId: a.branch.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Conflict`, code: `${TAG}-CFL`, status: 'ACTIVE', capacity: 40 } });
    await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: a.branch.id, batchId: conflictBatch.id, subjectId: subjectChem.id, dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00' } }); // clashes with schedulePhysics (batchA, MONDAY 09:00-10:00)
    let conflictRejected = false;
    try {
      await assignStudentToBatch(cc, OWNER_USER, conflictBatch.id, { studentId: multiStudent.id, overrideCapacity: false, overrideConflict: false } as any, a.owner.id);
    } catch (err) {
      conflictRejected = err instanceof Error && err.message.startsWith('SCHEDULE_CONFLICT');
    }
    assert(conflictRejected, 'a genuine class-time clash with an existing active batch is rejected');
    ok('25. A genuine schedule conflict between two batches is detected and rejected');

    // ================================================================
    // 26-29. Payment idempotency
    // ================================================================
    const feeStudent = await prisma.student.create({ data: { coachingCenterId: cc, branchId: a.branch.id, studentIdCode: `${TAG}-FEE`, name: `${TAG} Fee Student` } });
    const { createInvoice } = await import('../lib/services/invoice.service');
    const { createPayment } = await import('../lib/services/payment.service');
    const invoice = await createInvoice(cc, { studentId: feeStudent.id, branchId: a.branch.id, invoiceDate: new Date().toISOString(), dueDate: null, items: [{ description: `${TAG} fee`, quantity: 1, unitAmount: 2000, discountAmount: 0 }], discountAmount: 0, waiverAmount: 0, notes: null, issueNow: true } as any, a.owner.id);

    const key = `${TAG}-idem-1`;
    const p1 = await createPayment(cc, invoice.id, { amount: 1000, paymentMethod: 'BKASH', paymentDate: new Date().toISOString(), idempotencyKey: key } as any, a.owner.id);
    const p2 = await createPayment(cc, invoice.id, { amount: 1000, paymentMethod: 'BKASH', paymentDate: new Date().toISOString(), idempotencyKey: key } as any, a.owner.id);
    assert(p1.payment.id === p2.payment.id, `same request twice (same idempotencyKey) → exactly one payment (got ${p1.payment.id} vs ${p2.payment.id})`);
    const paymentCount = await prisma.payment.count({ where: { invoiceId: invoice.id } });
    assert(paymentCount === 1, `only one Payment row exists after the duplicate submit (got ${paymentCount})`);
    ok('26. Duplicate payment submission (same idempotencyKey) creates exactly one payment');

    // Concurrent duplicate.
    const key2 = `${TAG}-idem-2`;
    const concurrentResults = await Promise.allSettled([
      createPayment(cc, invoice.id, { amount: 500, paymentMethod: 'CASH', paymentDate: new Date().toISOString(), idempotencyKey: key2 } as any, a.owner.id),
      createPayment(cc, invoice.id, { amount: 500, paymentMethod: 'CASH', paymentDate: new Date().toISOString(), idempotencyKey: key2 } as any, a.owner.id),
    ]);
    const concurrentSucceeded = concurrentResults.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    assert(concurrentSucceeded.length === 2, 'both concurrent requests with the same idempotencyKey resolve successfully (one creates, one replays)');
    const distinctPaymentIds = new Set(concurrentSucceeded.map((r) => r.value.payment.id));
    assert(distinctPaymentIds.size === 1, `both concurrent requests resolve to the SAME payment id, not two different ones (got ${distinctPaymentIds.size})`);
    const paymentCount2 = await prisma.payment.count({ where: { invoiceId: invoice.id, idempotencyKey: key2 } });
    assert(paymentCount2 === 1, `exactly one payment row exists for the concurrent duplicate key (got ${paymentCount2})`);
    ok('27. Concurrent duplicate payment requests — exactly one Payment row is created, both requests get a consistent response');

    // Duplicate transaction reference rejected (same tenant + method).
    let dupTxRejected = false;
    try {
      await createPayment(cc, invoice.id, { amount: 100, paymentMethod: 'NAGAD', transactionId: 'DUPTX123', paymentDate: new Date().toISOString() } as any, a.owner.id);
      await createPayment(cc, invoice.id, { amount: 100, paymentMethod: 'NAGAD', transactionId: 'DUPTX123', paymentDate: new Date().toISOString() } as any, a.owner.id);
    } catch (err) {
      dupTxRejected = err instanceof Error && /Unique constraint/i.test(err.message);
    }
    assert(dupTxRejected, 'the same Nagad transaction reference cannot be recorded twice for this tenant/method');
    ok('28. Duplicate transaction reference is rejected');

    // Overpayment protection still holds.
    let overpayRejected = false;
    try {
      await createPayment(cc, invoice.id, { amount: 999999, paymentMethod: 'CASH', paymentDate: new Date().toISOString() } as any, a.owner.id);
    } catch (err) {
      overpayRejected = err instanceof Error && /exceeds/i.test(err.message);
    }
    assert(overpayRejected, 'overpayment protection is unaffected by the idempotency changes');
    ok('29. Overpayment protection remains intact');

    void adminCookie;
  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of [centerA, centerB]) if (id) await prisma.coachingCenter.deleteMany({ where: { id } });
    const left = await Promise.all([
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
      prisma.user.count({ where: { name: { startsWith: TAG } } }),
      prisma.student.count({ where: { studentIdCode: { startsWith: TAG } } }),
    ]);
    if (left.some((n) => n > 0)) console.error('✘ Leftover test data:', left);
    else console.log('✔ All temporary test data removed');
  }
  console.log(`\n${passed} checks passed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
