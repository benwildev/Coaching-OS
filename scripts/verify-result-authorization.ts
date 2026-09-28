import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { bulkSaveSubjectResults, verifyAndPublishExam } from '../lib/services/exam-result.service';
import { provisionPortalAccount } from '../lib/services/portal-auth.service';
import { createSessionToken, SESSION_COOKIE_NAME, type SessionUser } from '../lib/auth/session';
import { createPortalSessionToken, PORTAL_SESSION_COOKIE_NAME, type PortalSessionUser } from '../lib/auth/portal-session';

/**
 * Result-authorization verification over real HTTP against a running app
 * (route handlers read cookies, so they are exercised end-to-end):
 *
 *   RESULT_AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-result-authorization.ts
 *
 * Sessions are real signed JWTs from the app's own session helpers, so the
 * test depends only on route authorization — not on any login flow.
 * Builds two throwaway tenants and deletes them in `finally`.
 */

const BASE = process.env.RESULT_AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `RAVERIFY-${Date.now()}`;
const CODE = (s: string) => `RA${s}${Date.now().toString().slice(-7)}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

type Cookie = { name: string; value: string } | null;
async function get(path: string, cookie: Cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {} });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const staffCookie = async (u: SessionUser): Promise<Cookie> => ({ name: SESSION_COOKIE_NAME, value: await createSessionToken(u) });
const portalCookie = async (u: PortalSessionUser): Promise<Cookie> => ({ name: PORTAL_SESSION_COOKIE_NAME, value: await createPortalSessionToken(u) });

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name, centerCode: code, centerPhone: '01700000000', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`, ownerEmail: `${code.toLowerCase()}-owner@verify.local`, ownerPhone: '01700000001', ownerPassword: 'VerifyPass123',
    branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC'], primaryColor: '#063B78', accentColor: '#FFD200',
  } as Parameters<typeof completeInitialSetup>[0]);
}

async function main() {
  console.log('========================================================');
  console.log(`RESULT AUTHORIZATION VERIFICATION — ${BASE}`);
  console.log('========================================================');
  const ping = await fetch(`${BASE}/login`).catch(() => null);
  if (!ping) throw new Error(`App not reachable at ${BASE} — start it (npm run start) and set RESULT_AUTH_BASE_URL`);

  let centerA: string | null = null;
  let centerB: string | null = null;
  try {
    // ---------------- fixtures ----------------
    const setup = await tenant(CODE('A'), `${TAG} Center`);
    centerA = setup.center.id;
    const cc = centerA;
    const main = setup.branch;
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id } });
    const branch2 = await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Branch 2`, code: 'B2' } });

    // Phase 10.4: sessions are now re-derived from the DB on every request
    // (see lib/auth/session.ts) — a signed token whose claimed role has no
    // matching RoleAssignment resolves to no session at all. Each fixture
    // user below must carry the real RoleAssignment its session token will
    // later claim.
    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: cc } });
    const mkUser = (n: string, branchId: string | null, role: SessionUser['role']) =>
      prisma.user.create({
        data: {
          coachingCenterId: cc,
          branchId,
          email: `${n}-${TAG.toLowerCase()}@verify.local`,
          passwordHash: 'x',
          name: `${TAG} ${n}`,
          roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId } },
        },
      });
    const [adminU, staffU, teacherU, teacher2U] = await Promise.all([
      mkUser('admin', null, 'ADMIN'),
      mkUser('staff', main.id, 'STAFF'),
      mkUser('teacher', main.id, 'TEACHER'),
      mkUser('teacher2', main.id, 'TEACHER'),
    ]);
    const su = (u: { id: string; email: string; name: string }, role: SessionUser['role'], branchId: string | null): SessionUser => ({ userId: u.id, email: u.email, phone: null, name: u.name, banglaName: null, role, coachingCenterId: cc, branchId, sessionVersion: 0 });
    const owner = su(setup.owner, 'OWNER', main.id);
    const admin = su(adminU, 'ADMIN', null);
    const staff = su(staffU, 'STAFF', main.id);
    const teacher = su(teacherU, 'TEACHER', main.id);
    const teacher2 = su(teacher2U, 'TEACHER', main.id);

    const S1 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Physics`, code: `${TAG}-PHY` } });
    const S2 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Chemistry`, code: `${TAG}-CHE` } });
    const T1 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: main.id, userId: teacherU.id, teacherCode: `${TAG}-T1`, name: `${TAG} T1`, phone: '01711111111' } });
    await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: main.id, userId: teacher2U.id, teacherCode: `${TAG}-T2`, name: `${TAG} T2`, phone: '01722222222' } });
    const mkBatch = (branchId: string, code: string) =>
      prisma.batch.create({ data: { coachingCenterId: cc, branchId, academicSessionId: setup.session.id, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} ${code}`, code: `${TAG}-${code}`, status: 'ACTIVE' } });
    const batchA = await mkBatch(main.id, 'A');
    const batchB = await mkBatch(branch2.id, 'B');
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, subjectId: S1.id, teacherId: T1.id, status: 'ACTIVE' } });

    const mkStudent = (code: string, branchId: string) =>
      prisma.student.create({ data: { coachingCenterId: cc, branchId, studentIdCode: `${TAG}-${code}`, name: `${TAG} ${code}` } });
    const stA = await mkStudent('A', main.id);
    const stB = await mkStudent('B', main.id);
    const stC = await mkStudent('C', branch2.id);
    for (const s of [stA, stB]) await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: s.id, batchId: batchA.id, status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: stC.id, batchId: batchB.id, status: 'ACTIVE' } });
    const guardian = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010' } });
    await prisma.studentGuardian.create({ data: { studentId: stA.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true } });

    const mkExam = (branchId: string, batchId: string, title: string, subjects: string[], students: string[]) =>
      prisma.exam.create({
        data: {
          coachingCenterId: cc, branchId, academicSessionId: setup.session.id, academicProgramId: program.id, academicClassId: klass.id, batchId,
          title: `${TAG} ${title}`, examType: 'MONTHLY', status: 'ONGOING', startDate: new Date(),
          examSubjects: { create: subjects.map((subjectId) => ({ subjectId, totalMarks: 100, passMarks: 33 })) },
          examStudents: { create: students.map((studentId) => ({ studentId })) },
        },
        include: { examSubjects: true },
      });
    const examA = await mkExam(main.id, batchA.id, 'Exam A', [S1.id, S2.id], [stA.id, stB.id]);
    for (const es of examA.examSubjects) {
      await bulkSaveSubjectResults(cc, examA.id, es.id, [
        { studentId: stA.id, status: 'PRESENT', marksObtained: 80 },
        { studentId: stB.id, status: 'PRESENT', marksObtained: 60 },
      ], owner);
    }
    await verifyAndPublishExam(cc, examA.id, owner.userId, true);
    const examB = await mkExam(branch2.id, batchB.id, 'Exam B', [S1.id], [stC.id]);
    await bulkSaveSubjectResults(cc, examB.id, examB.examSubjects[0].id, [{ studentId: stC.id, status: 'PRESENT', marksObtained: 70 }], owner);
    await verifyAndPublishExam(cc, examB.id, owner.userId, true);
    const draft = await mkExam(main.id, batchA.id, 'Unpublished', [S1.id], [stA.id]);
    await bulkSaveSubjectResults(cc, draft.id, draft.examSubjects[0].id, [{ studentId: stA.id, status: 'PRESENT', marksObtained: 99 }], owner);

    const accA = await provisionPortalAccount({ coachingCenterId: cc, studentId: stA.id, actorUserId: owner.userId });
    const accB = await provisionPortalAccount({ coachingCenterId: cc, studentId: stB.id, actorUserId: owner.userId });
    const accG = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian.id, actorUserId: owner.userId });
    const studentACookie = await portalCookie({ portalAccountId: accA.account.id, portalType: 'STUDENT', studentId: stA.id, coachingCenterId: cc, name: 'A', sessionVersion: 0 });
    const guardianCookie = await portalCookie({ portalAccountId: accG.account.id, portalType: 'GUARDIAN', guardianId: guardian.id, coachingCenterId: cc, name: 'G', sessionVersion: 0 });
    void accB;

    const setupB = await tenant(CODE('B'), `${TAG} Other Center`);
    centerB = setupB.center.id;
    const otherStudent = await prisma.student.create({ data: { coachingCenterId: centerB, branchId: setupB.branch.id, studentIdCode: `${TAG}-OTHER`, name: `${TAG} Other` } });
    const otherBatch = await prisma.batch.findFirst({ where: { coachingCenterId: centerB } });
    const ownerB: SessionUser = { userId: setupB.owner.id, email: setupB.owner.email, phone: null, name: setupB.owner.name, banglaName: null, role: 'OWNER', coachingCenterId: centerB, branchId: setupB.branch.id, sessionVersion: 0 };
    ok('Fixtures: 2 tenants, 2 branches, OWNER/ADMIN/STAFF/2×TEACHER, students, guardian, published + unpublished exams, portal accounts');

    const ownerC = await staffCookie(owner);
    const adminC = await staffCookie(admin);
    const staffC = await staffCookie(staff);
    const teacherC = await staffCookie(teacher);
    const teacher2C = await staffCookie(teacher2);
    const ownerBC = await staffCookie(ownerB);
    const subjOf = (rows: Array<{ subjectName: string }>) => Array.from(new Set(rows.map((r) => r.subjectName))).sort();

    // 1. OWNER
    let r = await get(`/api/results?pageSize=100`, ownerC);
    assert(r.status === 200 && r.body.pagination.total === 6, `OWNER sees all 6 results (got ${r.status}/${r.body.pagination?.total})`);
    ok('1. OWNER authorized — all tenant results (incl. both branches, unpublished)');

    // 2. ADMIN
    r = await get(`/api/results?examId=${examB.id}`, adminC);
    assert(r.status === 200 && r.body.pagination.total === 1, 'ADMIN reads branch-2 exam');
    r = await get(`/api/results/batch/${batchB.id}`, adminC);
    assert(r.status === 200, 'ADMIN reads branch-2 batch performance');
    ok('2. ADMIN authorized center-wide');

    // 3 + 12. STAFF within branch
    r = await get(`/api/results?pageSize=100`, staffC);
    assert(r.status === 200 && r.body.pagination.total === 5 && r.body.results.every((x: { examId: string }) => x.examId !== examB.id), 'STAFF sees own-branch results only');
    r = await get(`/api/results?branchId=${branch2.id}&examId=${examB.id}`, staffC);
    assert(r.status === 200 && r.body.pagination.total === 0, 'STAFF cannot widen scope with ?branchId=');
    r = await get(`/api/results/student/${stC.id}`, staffC);
    assert(r.status === 403, `STAFF denied other-branch student history (got ${r.status})`);
    r = await get(`/api/results/batch/${batchB.id}`, staffC);
    assert(r.status === 403, `STAFF denied other-branch batch performance (got ${r.status})`);
    r = await get(`/api/exams/${examB.id}/subjects/${examB.examSubjects[0].id}/results`, staffC);
    assert(r.status === 403, `STAFF denied other-branch marks roster (got ${r.status})`);
    r = await get(`/api/results/student/${stA.id}`, staffC);
    assert(r.status === 200 && r.body.history.length === 2, 'STAFF reads own-branch student history');
    ok('3. STAFF authorized within branch');
    ok('12. Branch restriction enforced on list, student history, batch performance and marks roster');

    // 4. TEACHER within assignment
    r = await get(`/api/results?pageSize=100`, teacherC);
    assert(r.status === 200, 'TEACHER list 200');
    assert(r.body.pagination.total === 3 && JSON.stringify(subjOf(r.body.results)) === JSON.stringify([S1.name]), `TEACHER sees only assigned S1/batch-A results (got ${r.body.pagination.total} ${subjOf(r.body.results)})`);
    r = await get(`/api/results/student/${stA.id}`, teacherC);
    assert(r.status === 200 && r.body.history.every((h: { subjects: Array<{ subjectId: string }> }) => h.subjects.every((s) => s.subjectId === S1.id)), 'TEACHER student history limited to S1');
    r = await get(`/api/results/batch/${batchA.id}`, teacherC);
    assert(r.status === 200, 'TEACHER reads assigned batch performance');
    ok('4. TEACHER authorized within assignment (batch A × Physics)');

    // 5. TEACHER denied unrelated
    r = await get(`/api/results?examId=${examA.id}&pageSize=100`, teacherC);
    assert(r.body.results.every((x: { subjectName: string }) => x.subjectName === S1.name), 'unassigned subject (S2) results excluded');
    r = await get(`/api/results/batch/${batchB.id}`, teacherC);
    assert(r.status === 403, `TEACHER denied unassigned batch performance (got ${r.status})`);
    r = await get(`/api/results/student/${stC.id}`, teacherC);
    assert(r.status === 403, `TEACHER denied other-branch student (got ${r.status})`);
    r = await get(`/api/exams/${examA.id}/subjects/${examA.examSubjects.find((e) => e.subjectId === S2.id)!.id}/results`, teacherC);
    assert(r.status === 403, `TEACHER denied unassigned subject roster (got ${r.status})`);
    r = await get(`/api/results?pageSize=100`, teacher2C);
    assert(r.status === 200 && r.body.pagination.total === 0, 'TEACHER with no assignment sees nothing');
    ok('5. TEACHER denied unrelated subject / batch / student');

    // 6-7. STUDENT
    r = await get(`/api/portal/student/results`, studentACookie);
    assert(r.status === 200 && r.body.history.length === 1 && r.body.history[0].examId === examA.id, 'student sees own published result only (unpublished hidden)');
    ok('6. STUDENT sees own published result');
    for (const path of [`/api/results?studentId=${stB.id}`, `/api/results/student/${stB.id}`, `/api/results/batch/${batchA.id}`]) {
      r = await get(path, studentACookie);
      assert(r.status === 401, `student cookie rejected by staff route ${path} (got ${r.status})`);
    }
    r = await get(`/api/portal/guardian/children/${stB.id}/results`, studentACookie);
    assert(r.status === 403, `student cannot use guardian route (got ${r.status})`);
    ok('7. STUDENT denied another student\'s result (staff routes 401, guardian route 403)');

    // 8-9. GUARDIAN
    r = await get(`/api/portal/guardian/children/${stA.id}/results`, guardianCookie);
    assert(r.status === 200 && r.body.history.length === 1 && !r.body.history.some((h: { examId: string }) => h.examId === draft.id), 'guardian sees linked child published results');
    ok('8. GUARDIAN sees linked child (published only)');
    r = await get(`/api/portal/guardian/children/${stB.id}/results`, guardianCookie);
    assert(r.status === 403, `guardian denied unrelated child (got ${r.status})`);
    r = await get(`/api/results/student/${stB.id}`, guardianCookie);
    assert(r.status === 401, 'guardian cookie rejected by staff route');
    ok('9. GUARDIAN denied unrelated child');

    // 10. Unauthenticated
    for (const path of ['/api/results', `/api/results/student/${stA.id}`, `/api/results/batch/${batchA.id}`, '/api/portal/student/results', `/api/portal/guardian/children/${stA.id}/results`]) {
      r = await get(path, null);
      assert(r.status === 401 && !JSON.stringify(r.body).includes('marksObtained'), `unauthenticated ${path} → 401 (got ${r.status})`);
    }
    ok('10. Unauthenticated requests denied (401, no data)');

    // 11. Cross-tenant
    r = await get(`/api/results/student/${otherStudent.id}`, ownerC);
    assert(r.status === 404, `tenant A → tenant B student 404 (got ${r.status})`);
    if (otherBatch) {
      r = await get(`/api/results/batch/${otherBatch.id}`, ownerC);
      assert(r.status === 404, 'tenant A → tenant B batch 404');
    }
    r = await get(`/api/results/student/${stA.id}`, ownerBC);
    assert(r.status === 404, `tenant B → tenant A student 404 (got ${r.status})`);
    r = await get(`/api/results?examId=${examA.id}`, ownerBC);
    assert(r.status === 200 && r.body.pagination.total === 0, 'tenant B cannot list tenant A exam results');
    r = await get(`/api/exams/${examA.id}/subjects/${examA.examSubjects[0].id}/results`, ownerBC);
    assert(r.status === 404 && r.body.success === false && !JSON.stringify(r.body).includes('marksObtained'), `tenant B → tenant A marks roster 404, no data (got ${r.status})`);
    ok('11. Cross-tenant requests denied');

    // Phase 6 values unchanged by the authorization layer
    const persisted = await prisma.result.findFirstOrThrow({ where: { studentId: stA.id, examSubject: { examId: examA.id, subjectId: S1.id } } });
    r = await get(`/api/results?examId=${examA.id}&studentId=${stA.id}&pageSize=100`, ownerC);
    const row = r.body.results.find((x: { subjectName: string }) => x.subjectName === S1.name);
    assert(row.grade === persisted.grade && row.gpa === Number(persisted.gpa) && row.rank === persisted.rank, 'API returns persisted Phase 6 grade/GPA/rank unchanged');
    ok('Phase 6 grade/GPA/rank values returned unchanged');
  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of [centerA, centerB]) if (id) await prisma.coachingCenter.deleteMany({ where: { id } });
    const left = await Promise.all([
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
      prisma.student.count({ where: { studentIdCode: { startsWith: TAG } } }),
      prisma.user.count({ where: { name: { startsWith: TAG } } }),
    ]);
    if (left.some((n) => n > 0)) console.error('✘ Leftover test data:', left);
    else console.log('✔ All temporary test data removed');
  }
  console.log(`\n${passed} checks passed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
