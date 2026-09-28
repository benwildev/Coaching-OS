import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';

/**
 * Phase 10.7 — Homework / Assignment / Submission Verification
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase10-7.ts
 *
 * Scenarios 1-32 (33-36 are separate regression suites — see the final
 * report produced by the calling agent, not this script):
 *  1. Teacher can create homework for assigned batch
 *  2. Teacher cannot create homework for unassigned batch
 *  3. Teacher cannot create homework for unassigned subject
 *  4. Cross-branch homework rejected
 *  5. Cross-tenant homework rejected
 *  6. Draft creation
 *  7. Draft invisible to student
 *  8. Publish homework
 *  9. Published homework visible to correct students
 * 10. Wrong batch student cannot see homework
 * 11. Student can submit
 * 12. Student cannot submit for another student
 * 13. Student cannot submit to another batch
 * 14. Duplicate submission prevented
 * 15. Retry is idempotent
 * 16. Deadline behavior verified
 * 17. Late submission behavior verified
 * 18. Teacher can see assigned submissions
 * 19. Teacher cannot see unauthorized submissions
 * 20. Teacher can add feedback
 * 21. Student can see feedback
 * 22. Guardian can see correct child's homework
 * 23. Guardian children do not cross-contaminate
 * 24. Notification created correctly
 * 25. Duplicate notification prevented
 * 26. Audit log created
 * 27. Tenant isolation
 * 28. Branch isolation
 * 29. Teacher authorization (review-side)
 * 30. Student authorization (direct detail access)
 * 31. Guardian authorization
 * 32. No financial fields leaked in teacher/student homework payloads
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P107-${Date.now()}`;
const PW = 'ValidPass123!';
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ [${passed}] ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

interface Resp {
  status: number;
  body: Record<string, any>;
  cookies: Record<string, { value: string }>;
}

async function request(method: string, path: string, opts: { payload?: unknown; cookie?: string } = {}): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.payload !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { _text: text.slice(0, 300) };
  }
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
const patch = (path: string, payload: unknown, cookie?: string) => request('PATCH', path, { payload, cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name,
    centerCode: code,
    centerPhone: '01700000000',
    centerCity: 'Dhaka',
    centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`,
    ownerEmail: `${code.toLowerCase()}-owner@verify.local`,
    ownerPhone: `019${Date.now().toString().slice(-8)}`,
    ownerPassword: PW,
    branchName: 'Main Campus',
    branchCode: 'MAIN',
    sessionName: '2026',
    sessionStartDate: '2026-01-01',
    sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC'],
    primaryColor: '#063B78',
    accentColor: '#FFD200',
  } as any);
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 10.7 HOMEWORK VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerAId: string | null = null;
  let centerBId: string | null = null;

  try {
    const codeA = `T7A${Date.now().toString().slice(-7)}`;
    const codeB = `T7B${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerAId = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerBId = b.center.id;
    const cc = a.center.id;
    const branchA1 = a.branch;

    const branchA2 = await prisma.branch.create({
      data: { coachingCenterId: cc, name: 'Dhanmondi Branch', code: `DHN-${Date.now().toString().slice(-4)}`, phone: '01711111111' },
    });

    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: cc } });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER', branchId: string) =>
      prisma.user.create({
        data: {
          coachingCenterId: cc,
          branchId,
          email,
          passwordHash: hashPassword(PW),
          name: `${TAG} ${email}`,
          roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId } },
        },
      });

    const staffB1 = await mkUser(e('staff1'), 'STAFF', branchA1.id);
    const staffB2 = await mkUser(e('staff2'), 'STAFF', branchA2.id);
    const teacherUser1 = await mkUser(e('teacher1'), 'TEACHER', branchA1.id);
    const teacherUser2 = await mkUser(e('teacher2'), 'TEACHER', branchA1.id);

    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id } });

    const subjectS1 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Physics`, code: `${TAG}-PHY` } });
    const subjectS2 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Chemistry`, code: `${TAG}-CHE` } });

    const batch1 = await prisma.batch.create({
      data: { coachingCenterId: cc, branchId: branchA1.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Batch 1`, code: `${TAG}-B1`, status: 'ACTIVE', capacity: 40 },
    });
    const batch2 = await prisma.batch.create({
      data: { coachingCenterId: cc, branchId: branchA1.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Batch 2`, code: `${TAG}-B2`, status: 'ACTIVE', capacity: 40 },
    });
    const batchBranch2 = await prisma.batch.create({
      data: { coachingCenterId: cc, branchId: branchA2.id, academicSessionId: a.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} Batch Dhanmondi`, code: `${TAG}-BD`, status: 'ACTIVE', capacity: 40 },
    });

    // BatchSubject offerings
    for (const [batchId, subjectId] of [
      [batch1.id, subjectS1.id],
      [batch1.id, subjectS2.id],
      [batch2.id, subjectS1.id],
      [batch2.id, subjectS2.id],
      [batchBranch2.id, subjectS1.id],
    ]) {
      await prisma.batchSubject.create({ data: { batchId, subjectId, status: 'ACTIVE' } });
    }

    const teacher1 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: branchA1.id, userId: teacherUser1.id, teacherCode: `${TAG}-T1`, name: `${TAG} Teacher One`, phone: '01711111111' } });
    const teacher2 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: branchA1.id, userId: teacherUser2.id, teacherCode: `${TAG}-T2`, name: `${TAG} Teacher Two`, phone: '01722222222' } });

    // Teacher 1: assigned to Batch1+S1 only.
    await prisma.teacherSubject.create({ data: { teacherId: teacher1.id, subjectId: subjectS1.id } });
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: branchA1.id, batchId: batch1.id, subjectId: subjectS1.id, teacherId: teacher1.id, status: 'ACTIVE' } });
    // Teacher 2: assigned to Batch2+S2 and BatchBranch2+S1 (used for the branch-isolation fixture).
    await prisma.teacherSubject.create({ data: { teacherId: teacher2.id, subjectId: subjectS2.id } });
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: branchA1.id, batchId: batch2.id, subjectId: subjectS2.id, teacherId: teacher2.id, status: 'ACTIVE' } });
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: branchA2.id, batchId: batchBranch2.id, subjectId: subjectS1.id, teacherId: teacher2.id, status: 'ACTIVE' } });

    const student1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student One`, email: `${TAG.toLowerCase()}-stu1@verify.local` } });
    const student2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S2`, name: `${TAG} Student Two`, email: `${TAG.toLowerCase()}-stu2@verify.local` } });
    const student3 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S3`, name: `${TAG} Student Three`, email: `${TAG.toLowerCase()}-stu3@verify.local` } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: student1.id, batchId: batch1.id, status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: student2.id, batchId: batch2.id, status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: student3.id, batchId: batch2.id, status: 'ACTIVE' } });

    const guardian1 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010', email: `${TAG.toLowerCase()}-guardian@verify.local`, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student3.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    // student2 deliberately NOT linked to guardian1 — the IDOR target for scenario 31.

    // Portal accounts
    const student1Provision = await provisionPortalAccount({ coachingCenterId: cc, studentId: student1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(student1Provision.setupToken, PW);
    const student2Provision = await provisionPortalAccount({ coachingCenterId: cc, studentId: student2.id, actorUserId: a.owner.id });
    await completeSetupOrReset(student2Provision.setupToken, PW);
    const guardianProvision = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(guardianProvision.setupToken, PW);

    ok('Fixtures: 2 tenants, 2 branches, 2 teachers, 3 batches, 2 subjects, 3 students, 1 guardian (2 linked children), 3 portal accounts');

    // Sessions
    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const staffB1Cookie = cookieOf(await login(staffB1.email, PW), SESSION_COOKIE_NAME);
    const staffB2Cookie = cookieOf(await login(staffB2.email, PW), SESSION_COOKIE_NAME);
    const teacher1Cookie = cookieOf(await login(teacherUser1.email, PW), SESSION_COOKIE_NAME);
    const teacher2Cookie = cookieOf(await login(teacherUser2.email, PW), SESSION_COOKIE_NAME);
    const student1Cookie = cookieOf(await login(student1.email!, PW), PORTAL_SESSION_COOKIE_NAME);
    const student2Cookie = cookieOf(await login(student2.email!, PW), PORTAL_SESSION_COOKIE_NAME);
    const guardianCookie = cookieOf(await login(guardian1.email!, PW), PORTAL_SESSION_COOKIE_NAME);

    const dueInFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const duePast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ----------------------------------------------------
    // Scenario 1: Teacher can create homework for assigned batch
    // ----------------------------------------------------
    const s1Res = await post('/api/homework', {
      title: `${TAG} Algebra Worksheet`, batchId: batch1.id, subjectId: subjectS1.id, dueAt: dueInFuture, status: 'DRAFT',
    }, teacher1Cookie);
    assert(s1Res.status === 201, `Scenario 1 failed with status ${s1Res.status}: ${JSON.stringify(s1Res.body)}`);
    const hw1Id: string = s1Res.body.homework.id;
    assert(s1Res.body.homework.teacher.id === teacher1.id, 'homework attributed to the assigned teacher of record');
    ok('1. Teacher can create homework for assigned batch');

    // ----------------------------------------------------
    // Scenario 2: Teacher cannot create homework for unassigned batch
    // ----------------------------------------------------
    const s2Res = await post('/api/homework', { title: 'Unassigned Batch', batchId: batch2.id, subjectId: subjectS1.id, dueAt: dueInFuture, status: 'DRAFT' }, teacher1Cookie);
    assert(s2Res.status === 403 || s2Res.status === 400, `Scenario 2 must be rejected, got ${s2Res.status}`);
    ok('2. Teacher cannot create homework for unassigned batch');

    // ----------------------------------------------------
    // Scenario 3: Teacher cannot create homework for unassigned subject
    // ----------------------------------------------------
    const s3Res = await post('/api/homework', { title: 'Unassigned Subject', batchId: batch1.id, subjectId: subjectS2.id, dueAt: dueInFuture, status: 'DRAFT' }, teacher1Cookie);
    assert(s3Res.status === 403 || s3Res.status === 400, `Scenario 3 must be rejected, got ${s3Res.status}`);
    ok('3. Teacher cannot create homework for unassigned subject');

    // ----------------------------------------------------
    // Scenario 4: Cross-branch homework rejected (branch-scoped STAFF)
    // ----------------------------------------------------
    const s4Res = await post('/api/homework', { title: 'Cross Branch', batchId: batchBranch2.id, subjectId: subjectS1.id, dueAt: dueInFuture, status: 'DRAFT' }, staffB1Cookie);
    assert(s4Res.status === 403, `Scenario 4 Cross-branch must be 403, got ${s4Res.status}`);
    ok('4. Cross-branch homework rejected');

    // ----------------------------------------------------
    // Scenario 5: Cross-tenant homework rejected
    // ----------------------------------------------------
    const s5Res = await post('/api/homework', { title: 'Cross Tenant', batchId: batch1.id, subjectId: subjectS1.id, dueAt: dueInFuture, status: 'DRAFT' }, ownerBCookie);
    assert(s5Res.status === 400 || s5Res.status === 404, `Scenario 5 Cross-tenant must be rejected, got ${s5Res.status}`);
    ok('5. Cross-tenant homework rejected');

    // ----------------------------------------------------
    // Scenario 6: Draft creation
    // ----------------------------------------------------
    const s6Get = await get(`/api/homework/${hw1Id}`, teacher1Cookie);
    assert(s6Get.status === 200 && s6Get.body.homework.status === 'DRAFT', `Scenario 6 draft status check failed: ${JSON.stringify(s6Get.body)}`);
    ok('6. Draft creation');

    // ----------------------------------------------------
    // Scenario 7: Draft invisible to student
    // ----------------------------------------------------
    const s7Res = await get(`/api/portal/student/homework/${hw1Id}`, student1Cookie);
    assert(s7Res.status === 404, `Scenario 7 draft must be invisible to student, got ${s7Res.status}`);
    const s7List = await get('/api/portal/student/homework?status=all', student1Cookie);
    assert(!s7List.body.homeworks?.some((h: any) => h.id === hw1Id), 'Scenario 7 draft must not appear in student list');
    ok('7. Draft invisible to student');

    // ----------------------------------------------------
    // Scenario 8: Publish homework
    // ----------------------------------------------------
    const s8Res = await post(`/api/homework/${hw1Id}/publish`, {}, teacher1Cookie);
    assert(s8Res.status === 200 && s8Res.body.homework.status === 'PUBLISHED', `Scenario 8 publish failed: ${JSON.stringify(s8Res.body)}`);
    ok('8. Publish homework');

    // ----------------------------------------------------
    // Scenario 9: Published homework visible to correct students
    // ----------------------------------------------------
    const s9Res = await get(`/api/portal/student/homework/${hw1Id}`, student1Cookie);
    assert(s9Res.status === 200 && s9Res.body.homework.id === hw1Id, `Scenario 9 failed: ${JSON.stringify(s9Res.body)}`);
    ok('9. Published homework visible to correct students');

    // ----------------------------------------------------
    // Scenario 10: Wrong batch student cannot see homework
    // ----------------------------------------------------
    const s10Res = await get(`/api/portal/student/homework/${hw1Id}`, student2Cookie);
    assert(s10Res.status === 404, `Scenario 10 wrong-batch student must not see homework, got ${s10Res.status}`);
    ok('10. Wrong batch student cannot see homework');

    // ----------------------------------------------------
    // Scenario 11: Student can submit
    // ----------------------------------------------------
    const s11Res = await post(`/api/portal/student/homework/${hw1Id}/submit`, { content: 'My answer to the algebra worksheet.' }, student1Cookie);
    assert(s11Res.status === 200 && s11Res.body.submission.status === 'SUBMITTED', `Scenario 11 failed: ${JSON.stringify(s11Res.body)}`);
    assert(s11Res.body.submission.isLate === false, 'on-time submission is not marked late');
    ok('11. Student can submit');

    // ----------------------------------------------------
    // Scenario 12: Student cannot submit for another student
    // ----------------------------------------------------
    const s12Res = await post(`/api/portal/student/homework/${hw1Id}/submit`, { content: 'Impersonation attempt', studentId: student2.id }, student1Cookie);
    assert(s12Res.status === 200, `Scenario 12 setup call failed: ${JSON.stringify(s12Res.body)}`);
    const s12Row = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: hw1Id, studentId: student1.id } } });
    assert(!!s12Row, 'submission recorded under the authenticated student');
    const s12Foreign = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: hw1Id, studentId: student2.id } } });
    assert(!s12Foreign, 'a spoofed studentId in the payload has no effect — no row created for student2');
    ok('12. Student cannot submit for another student (payload studentId is ignored)');

    // ----------------------------------------------------
    // Scenario 13: Student cannot submit to another batch
    // ----------------------------------------------------
    const s13Res = await post(`/api/portal/student/homework/${hw1Id}/submit`, { content: 'Wrong batch attempt' }, student2Cookie);
    assert(s13Res.status === 404, `Scenario 13 must be rejected, got ${s13Res.status}`);
    ok('13. Student cannot submit to another batch');

    // ----------------------------------------------------
    // Scenario 14: Duplicate submission prevented (resubmission updates the same row)
    // ----------------------------------------------------
    await post(`/api/portal/student/homework/${hw1Id}/submit`, { content: 'Updated answer.' }, student1Cookie);
    const s14Count = await prisma.homeworkSubmission.count({ where: { homeworkId: hw1Id, studentId: student1.id } });
    assert(s14Count === 1, `Scenario 14 expected exactly 1 row, got ${s14Count}`);
    ok('14. Duplicate submission prevented (idempotent resubmission)');

    // ----------------------------------------------------
    // Scenario 15: Retry is idempotent (concurrent double submit)
    // ----------------------------------------------------
    const hw1bRes = await post('/api/homework', { title: `${TAG} Concurrency Test`, batchId: batch1.id, subjectId: subjectS1.id, dueAt: dueInFuture, status: 'PUBLISHED' }, teacher1Cookie);
    const hw1bId: string = hw1bRes.body.homework.id;
    await Promise.all([
      post(`/api/portal/student/homework/${hw1bId}/submit`, { content: 'Concurrent A' }, student1Cookie),
      post(`/api/portal/student/homework/${hw1bId}/submit`, { content: 'Concurrent B' }, student1Cookie),
    ]);
    const s15Count = await prisma.homeworkSubmission.count({ where: { homeworkId: hw1bId, studentId: student1.id } });
    assert(s15Count === 1, `Scenario 15 expected exactly 1 row after concurrent retries, got ${s15Count}`);
    ok('15. Retry is idempotent (concurrent double-submit yields a single row)');

    // ----------------------------------------------------
    // Scenario 16 & 17: Deadline / late-submission behavior
    // ----------------------------------------------------
    const hw3Res = await post('/api/homework', { title: `${TAG} Overdue Assignment`, batchId: batch1.id, subjectId: subjectS1.id, dueAt: duePast, status: 'PUBLISHED' }, teacher1Cookie);
    const hw3Id: string = hw3Res.body.homework.id;
    const s17Res = await post(`/api/portal/student/homework/${hw3Id}/submit`, { content: 'Late answer' }, student1Cookie);
    assert(s17Res.status === 200 && s17Res.body.submission.status === 'LATE' && s17Res.body.submission.isLate === true, `Scenario 17 failed: ${JSON.stringify(s17Res.body)}`);
    ok('16. Deadline behavior verified (on-time vs. past-due submissions classified correctly)');
    ok('17. Late submission is explicitly supported and recorded as LATE (not silently rejected or silently accepted as on-time)');

    // ----------------------------------------------------
    // Scenario 18: Teacher can see assigned submissions
    // ----------------------------------------------------
    const s18Res = await get(`/api/homework/${hw1Id}/submissions`, teacher1Cookie);
    assert(s18Res.status === 200, `Scenario 18 failed: ${JSON.stringify(s18Res.body)}`);
    const s18Entry = s18Res.body.roster.find((r: any) => r.student.id === student1.id);
    assert(!!s18Entry?.submission, 'teacher sees student1’s submission in the roster');
    ok('18. Teacher can see assigned submissions');

    // ----------------------------------------------------
    // Scenario 19: Teacher cannot see unauthorized submissions
    // ----------------------------------------------------
    const hw2Res = await post('/api/homework', { title: `${TAG} Chem HW`, batchId: batch2.id, subjectId: subjectS2.id, dueAt: dueInFuture, status: 'PUBLISHED' }, teacher2Cookie);
    const hw2Id: string = hw2Res.body.homework.id;
    await post(`/api/portal/student/homework/${hw2Id}/submit`, { content: 'Student 3 chemistry answer' }, student1Cookie).catch(() => null); // expected to fail; student1 not in batch2
    const s19Res = await get(`/api/homework/${hw2Id}/submissions`, teacher1Cookie);
    assert(s19Res.status === 404, `Scenario 19 teacher1 must not access teacher2's homework, got ${s19Res.status}`);
    ok('19. Teacher cannot see unauthorized submissions');

    // ----------------------------------------------------
    // Scenario 20 & 21: Feedback
    // ----------------------------------------------------
    const submissionId: string = s18Entry.submission.id;
    const s20Res = await patch(`/api/homework/${hw1Id}/submissions/${submissionId}`, { feedback: 'Good work. Please improve question 4.', status: 'REVIEWED' }, teacher1Cookie);
    assert(s20Res.status === 200 && s20Res.body.submission.status === 'REVIEWED', `Scenario 20 failed: ${JSON.stringify(s20Res.body)}`);
    ok('20. Teacher can add feedback');

    const s21Res = await get(`/api/portal/student/homework/${hw1Id}`, student1Cookie);
    assert(s21Res.body.homework.submission?.feedback === 'Good work. Please improve question 4.', `Scenario 21 failed: ${JSON.stringify(s21Res.body)}`);
    ok('21. Student can see feedback');

    // ----------------------------------------------------
    // Scenario 22 & 23: Guardian visibility & multi-child isolation
    // ----------------------------------------------------
    await post(`/api/portal/student/homework/${hw2Id}/submit`, {}, student1Cookie).catch(() => null);
    const s22Res = await get(`/api/portal/guardian/children/${student1.id}/homework`, guardianCookie);
    assert(s22Res.status === 200 && s22Res.body.homeworks.some((h: any) => h.id === hw1Id), `Scenario 22 failed: ${JSON.stringify(s22Res.body)}`);
    ok('22. Guardian can see correct child\'s homework');

    const s23Child1 = s22Res.body.homeworks;
    assert(!s23Child1.some((h: any) => h.id === hw2Id), 'child 1 (Batch1) view must not include child 3\'s Batch2 homework');
    const s23Child3Res = await get(`/api/portal/guardian/children/${student3.id}/homework`, guardianCookie);
    assert(s23Child3Res.status === 200 && s23Child3Res.body.homeworks.some((h: any) => h.id === hw2Id), `Scenario 23 child3 view failed: ${JSON.stringify(s23Child3Res.body)}`);
    assert(!s23Child3Res.body.homeworks.some((h: any) => h.id === hw1Id), 'child 3 (Batch2) view must not include child 1\'s Batch1 homework');
    ok('23. Guardian children do not cross-contaminate');

    // ----------------------------------------------------
    // Scenario 24 & 25: Notifications
    // ----------------------------------------------------
    const notifRows = await prisma.notification.findMany({ where: { sourceType: 'Homework', sourceId: hw1Id, type: 'HOMEWORK_PUBLISHED' } });
    assert(notifRows.some((n) => n.studentId === student1.id), 'student1 received an in-app HOMEWORK_PUBLISHED notification');
    assert(notifRows.some((n) => n.guardianId === guardian1.id && n.guardianStudentId === student1.id), 'guardian1 received an in-app HOMEWORK_PUBLISHED notification about student1');
    ok('24. Notification created correctly (student + guardian, identifying homework/subject/batch via the event)');

    await post(`/api/homework/${hw1Id}/close`, {}, teacher1Cookie);
    await post(`/api/homework/${hw1Id}/publish`, {}, teacher1Cookie); // reopen — re-triggers the publish notification path
    const notifRowsAfter = await prisma.notification.findMany({ where: { sourceType: 'Homework', sourceId: hw1Id, type: 'HOMEWORK_PUBLISHED', studentId: student1.id } });
    assert(notifRowsAfter.length === 1, `Scenario 25 expected exactly 1 notification row after reopen, got ${notifRowsAfter.length}`);
    ok('25. Duplicate notification prevented (DB unique constraint, same as existing MATERIAL/NOTICE events)');

    // ----------------------------------------------------
    // Scenario 26: Audit log created
    // ----------------------------------------------------
    const auditActions = await prisma.auditLog.findMany({ where: { coachingCenterId: cc, entityId: hw1Id } });
    for (const action of ['HOMEWORK_CREATED', 'HOMEWORK_PUBLISHED']) {
      assert(auditActions.some((al) => al.action === action), `audit log missing action ${action}`);
    }
    const submissionAudit = await prisma.auditLog.findMany({ where: { coachingCenterId: cc, entityId: submissionId } });
    assert(submissionAudit.some((al) => al.action === 'HOMEWORK_SUBMISSION_CREATED'), 'audit log missing HOMEWORK_SUBMISSION_CREATED');
    assert(submissionAudit.some((al) => al.action === 'HOMEWORK_SUBMISSION_REVIEWED'), 'audit log missing HOMEWORK_SUBMISSION_REVIEWED');
    ok('26. Audit log created for assignment and submission mutations');

    // ----------------------------------------------------
    // Scenario 27: Tenant isolation
    // ----------------------------------------------------
    const s27Res = await get(`/api/homework/${hw1Id}`, ownerBCookie);
    assert(s27Res.status === 404, `Scenario 27 Cross-tenant read must fail, got ${s27Res.status}`);
    ok('27. Tenant isolation verified');

    // ----------------------------------------------------
    // Scenario 28: Branch isolation
    // ----------------------------------------------------
    const s28Res = await get(`/api/homework/${hw1Id}`, staffB2Cookie);
    assert(s28Res.status === 404, `Scenario 28 Branch isolation must fail, got ${s28Res.status}`);
    ok('28. Branch isolation verified');

    // ----------------------------------------------------
    // Scenario 29: Teacher authorization (review-side)
    // ----------------------------------------------------
    const s29Res = await patch(`/api/homework/${hw1Id}/submissions/${submissionId}`, { feedback: 'unauthorized' }, teacher2Cookie);
    assert(s29Res.status === 404 || s29Res.status === 403, `Scenario 29 unauthorized teacher review must fail, got ${s29Res.status}`);
    ok('29. Teacher authorization verified (cannot review another teacher\'s homework)');

    // ----------------------------------------------------
    // Scenario 30: Student authorization (already exercised in 10/13; reconfirm directly)
    // ----------------------------------------------------
    const s30Res = await get(`/api/portal/student/homework/${hw1Id}`, student2Cookie);
    assert(s30Res.status === 404, `Scenario 30 failed, got ${s30Res.status}`);
    ok('30. Student authorization verified (own submissions/homework only)');

    // ----------------------------------------------------
    // Scenario 31: Guardian authorization
    // ----------------------------------------------------
    const s31Res = await get(`/api/portal/guardian/children/${student2.id}/homework`, guardianCookie);
    assert(s31Res.status === 403, `Scenario 31 guardian must not access an unlinked student, got ${s31Res.status}`);
    ok('31. Guardian authorization verified (unlinked child rejected)');

    // ----------------------------------------------------
    // Scenario 32: No financial fields leaked
    // ----------------------------------------------------
    // Matches a JSON *key* containing a financial term (quoted string
    // immediately followed by ":") — not a bare substring match, since a
    // random UUID value can coincidentally contain hex-valid text like
    // "fee". "fee" excludes the homework feature's own legitimate
    // "feedback"/"reviewedBy"-shaped keys (feedback starts with "fee").
    const financialPattern = /"[a-zA-Z]*(payment|invoice|discount|waiver)[a-zA-Z]*"\s*:|"[a-zA-Z]*fee(?!dback)[a-zA-Z]*"\s*:/i;
    const teacherPayload = JSON.stringify(s6Get.body.homework);
    const studentPayload = JSON.stringify(s21Res.body.homework);
    assert(!financialPattern.test(teacherPayload), 'teacher homework payload must not leak financial fields');
    assert(!financialPattern.test(studentPayload), 'student homework payload must not leak financial fields');
    ok('32. No financial fields leaked in teacher/student homework payloads');

    console.log('\n========================================================');
    console.log(`ALL 32 PHASE 10.7 HTTP-DRIVEN SCENARIOS PASSED (${passed}/32)`);
    console.log('========================================================');
  } finally {
    console.log('Cleaning up throwaway tenants...');
    if (centerAId) await prisma.coachingCenter.delete({ where: { id: centerAId } }).catch(() => null);
    if (centerBId) await prisma.coachingCenter.delete({ where: { id: centerBId } }).catch(() => null);
    console.log('Cleanup completed.');
  }
}

main().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
