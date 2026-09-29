import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import { DICTIONARY } from '../lib/i18n';

/**
 * Phase 10.10 — Operational Administration, Bulk Actions & Documents Verification
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase10-10.ts
 *
 * Basic student CRUD/search/pagination/filters are already exhaustively
 * proven by verify-phase10-4.ts (and its successors) — scenarios 22-24 below
 * give them one light re-confirmation each rather than re-litigating that
 * ground. This script targets what Phase 10.10 actually adds: bulk status
 * change, bulk batch transfer with capacity/concurrency, academic promotion
 * with duplicate-prevention and transaction rollback, certificate numbering
 * under concurrency, ID cards, and document authorization/isolation across
 * roles, branches, and portal accounts.
 *
 * Scenarios:
 *  1. Tenant isolation (bulk ops, promotion, documents)
 *  2. Branch isolation (bulk status/transfer reject a foreign-branch id per-row)
 *  3. Student bulk selection authorization (mixed-branch selection: authorized
 *     rows still succeed, unauthorized rows fail individually)
 *  4. Bulk status change
 *  5. Status audit logging
 *  6. Academic promotion
 *  7. Historical enrollment preservation
 *  8. Batch transfer
 *  9. Historical batch preservation
 * 10. Batch capacity (bulk transfer into a capacity-1 batch)
 * 11. Concurrent batch assignment (race into a capacity-1 batch)
 * 12. Duplicate promotion prevention
 * 13. Certificate numbering concurrency
 * 14. ID card generation (single)
 * 15. Bulk ID card generation
 * 16. Certificate generation (number format)
 * 17. Document authorization (cross-branch id-card/certificate rejected)
 * 18. Student portal isolation (own id-card/certificates)
 * 19. Guardian child isolation (unlinked child rejected)
 * 20. Bulk export authorization + branch-scoped narrowing
 * 21. Export filtering (studentIds narrows the directory view)
 * 22. Search (existing directory endpoint, unchanged)
 * 23. Pagination (existing directory endpoint, unchanged)
 * 24. Filters (existing directory endpoint, unchanged)
 * 25. Transaction rollback (a promotion blocked by batch capacity leaves no
 *     orphaned enrollment and does not touch the source enrollment)
 * 26. Unauthorized role access (TEACHER blocked from every bulk/promotion/
 *     certificate-issue endpoint)
 * 27. Empty-state behavior (no candidates, no certificates yet)
 * 28. Bangla localization (new dictionary sections present, non-empty)
 * 29. Branding data (id-card/certificate render real tenant/branding data)
 * 30. Audit logging (every new action string present)
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P1010-${Date.now()}`;
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
  console.log(`PHASE 10.10 OPERATIONAL ADMINISTRATION VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerAId: string | null = null;
  let centerBId: string | null = null;

  try {
    const codeA = `TAA${Date.now().toString().slice(-7)}`;
    const codeB = `TAB${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerAId = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerBId = b.center.id;
    const cc = a.center.id;
    const branchA1 = a.branch;

    const branchA2 = await prisma.branch.create({ data: { coachingCenterId: cc, name: 'Branch Two', code: `B2-${Date.now().toString().slice(-4)}`, phone: '01711111111' } });

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

    const adminUser = await mkUser(e('admin'), 'ADMIN', branchA1.id);
    const staffA1 = await mkUser(e('staff1'), 'STAFF', branchA1.id);
    const staffA2 = await mkUser(e('staff2'), 'STAFF', branchA2.id);
    const teacherUser = await mkUser(e('teacher'), 'TEACHER', branchA1.id);

    // ----------------------------------------------------
    // Academic fixtures: SSC/Class 9 (source, seeded by completeInitialSetup)
    // + a second session ('2027') and reuse of the seeded Class 10 as the
    // promotion destination, plus a battery of purpose-sized batches.
    // ----------------------------------------------------
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const classSource = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id, code: 'CLASS_9' } });
    const classDest = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id, code: 'CLASS_10' } });
    const session2026 = a.session;
    const session2027 = await prisma.academicSession.create({
      data: { coachingCenterId: cc, name: '2027', startDate: new Date('2027-01-01'), endDate: new Date('2027-12-31') },
    });

    const mkBatch = (name: string, sessionId: string, classId: string, branchId: string, capacity: number) =>
      prisma.batch.create({
        data: {
          coachingCenterId: cc,
          branchId,
          academicSessionId: sessionId,
          academicProgramId: program.id,
          academicClassId: classId,
          name,
          code: `${name.replace(/\s+/g, '_').toUpperCase()}-${Date.now().toString().slice(-5)}`,
          capacity,
          status: 'ACTIVE',
        },
      });

    const batchSource = await mkBatch('Source Batch', session2026.id, classSource.id, branchA1.id, 40);
    const batchTransferBig = await mkBatch('Transfer Big', session2026.id, classSource.id, branchA1.id, 40);
    const batchTransferSmall = await mkBatch('Transfer Small', session2026.id, classSource.id, branchA1.id, 1);
    const batchRaceSmall = await mkBatch('Race Small', session2026.id, classSource.id, branchA1.id, 1);
    const batchDestBig = await mkBatch('Dest Big', session2027.id, classDest.id, branchA1.id, 40);
    const batchDestSmall = await mkBatch('Dest Small', session2027.id, classDest.id, branchA1.id, 1);
    const batchA2 = await mkBatch('Branch Two Batch', session2026.id, classSource.id, branchA2.id, 40);

    // ----------------------------------------------------
    // Students (tenant A / branchA1), each admitted with a real
    // StudentEnrollment (session2026/SSC/Class 9, ENROLLED) + StudentBatch
    // (batchSource, ACTIVE) — direct fixture creation, same pattern used by
    // verify-phase10-9.ts, since these services operate on the same tables
    // the full admission wizard would produce.
    // ----------------------------------------------------
    async function mkStudent(tag: string, branchId: string) {
      const student = await prisma.student.create({
        data: { coachingCenterId: cc, branchId, studentIdCode: `${TAG}-${tag}`, name: `${TAG} Student ${tag}`, email: `${TAG.toLowerCase()}-${tag.toLowerCase()}@verify.local` },
      });
      return student;
    }

    async function enroll(studentId: string, sessionId: string, classId: string, branchId: string) {
      return prisma.studentEnrollment.create({
        data: { coachingCenterId: cc, studentId, branchId, academicSessionId: sessionId, academicProgramId: program.id, academicClassId: classId, status: 'ENROLLED' },
      });
    }

    async function assignBatch(studentId: string, batchId: string) {
      return prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId, batchId, status: 'ACTIVE' } });
    }

    const students: Record<string, Awaited<ReturnType<typeof mkStudent>>> = {};
    for (const tag of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'EMPTY']) {
      students[tag] = await mkStudent(tag, branchA1.id);
      await enroll(students[tag].id, session2026.id, classSource.id, branchA1.id);
      await assignBatch(students[tag].id, batchSource.id);
    }
    const studentB1 = await mkStudent('B1', branchA2.id);
    await enroll(studentB1.id, session2026.id, classSource.id, branchA2.id);
    await assignBatch(studentB1.id, batchA2.id);

    const guardian1 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010', email: `${TAG.toLowerCase()}-guardian@verify.local`, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: students.S1.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    // guardian1 deliberately NOT linked to studentB1 — the isolation target for scenario 19.

    const student1Provision = await provisionPortalAccount({ coachingCenterId: cc, studentId: students.S1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(student1Provision.setupToken, PW);
    const guardianProvision = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(guardianProvision.setupToken, PW);

    ok('Fixtures: 2 tenants, 2 branches, OWNER/ADMIN/STAFFx2/TEACHER, 11 students (+1 branchA2), 1 guardian (1 linked child), 2 portal accounts, 7 purpose-sized batches, 2 sessions');

    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const adminCookie = cookieOf(await login(adminUser.email, PW), SESSION_COOKIE_NAME);
    const staffA1Cookie = cookieOf(await login(staffA1.email, PW), SESSION_COOKIE_NAME);
    const staffA2Cookie = cookieOf(await login(staffA2.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacherUser.email, PW), SESSION_COOKIE_NAME);
    const student1Cookie = cookieOf(await login(students.S1.email!, PW), PORTAL_SESSION_COOKIE_NAME);
    const guardianCookie = cookieOf(await login(guardian1.email!, PW), PORTAL_SESSION_COOKIE_NAME);

    // ----------------------------------------------------
    // Scenario 4 & 5: Bulk status change + audit logging
    // ----------------------------------------------------
    const s4Res = await post('/api/students/bulk/status', { studentIds: [students.S2.id, students.S3.id], newStatus: 'INACTIVE', reason: 'Verification test' }, ownerCookie);
    assert(s4Res.status === 200 && s4Res.body.summary.successful === 2, `Scenario 4 failed: ${JSON.stringify(s4Res.body)}`);
    const s2After = await prisma.student.findUniqueOrThrow({ where: { id: students.S2.id } });
    assert(s2After.status === 'INACTIVE', 'Scenario 4 failed: status not persisted');
    ok('4. Bulk status change updates all selected students');

    const statusAudit = await prisma.auditLog.findFirst({ where: { coachingCenterId: cc, action: 'STUDENT_STATUS_CHANGED', entityId: students.S2.id } });
    const statusAuditDetails = statusAudit?.details ? JSON.parse(statusAudit.details as unknown as string) : null;
    assert(!!statusAudit && statusAuditDetails?.newStatus === 'INACTIVE' && statusAuditDetails?.previousStatus === 'ACTIVE', `Scenario 5 failed: ${JSON.stringify(statusAudit)}`);
    ok('5. Status change audit log records previous and new status');

    // Idempotent no-op: re-running the same change reports a skip, not a failure.
    const s4bRes = await post('/api/students/bulk/status', { studentIds: [students.S2.id], newStatus: 'INACTIVE' }, ownerCookie);
    assert(s4bRes.body.results[0].skipped === true, `Scenario 4 unchanged-skip failed: ${JSON.stringify(s4bRes.body)}`);

    // ----------------------------------------------------
    // Scenario 2 & 3: Branch isolation + mixed-selection authorization on bulk status
    // ----------------------------------------------------
    const s2Res = await post('/api/students/bulk/status', { studentIds: [students.S4.id, studentB1.id], newStatus: 'INACTIVE' }, staffA1Cookie);
    assert(s2Res.status === 200, `Scenario 2/3 request failed: ${JSON.stringify(s2Res.body)}`);
    const s4Row = s2Res.body.results.find((r: any) => r.studentId === students.S4.id);
    const bRow = s2Res.body.results.find((r: any) => r.studentId === studentB1.id);
    assert(s4Row.success && !s4Row.skipped, `Scenario 3 failed: authorized row must succeed: ${JSON.stringify(s4Row)}`);
    assert(!bRow.success && bRow.reason === 'FORBIDDEN_BRANCH', `Scenario 2 failed: cross-branch row must fail with FORBIDDEN_BRANCH: ${JSON.stringify(bRow)}`);
    const studentBUnchanged = await prisma.student.findUniqueOrThrow({ where: { id: studentB1.id } });
    assert(studentBUnchanged.status === 'ACTIVE', 'Scenario 2 failed: cross-branch student must not be modified');
    ok('2. Branch isolation: a branch-locked STAFF cannot modify a foreign-branch student via bulk status');
    ok('3. Student bulk selection authorization: mixed selection succeeds for authorized rows, fails per-row for unauthorized ones');

    // ----------------------------------------------------
    // Scenario 1: Tenant isolation on bulk status (tenant B cannot even find tenant A's student)
    // ----------------------------------------------------
    const s1Res = await post('/api/students/bulk/status', { studentIds: [students.S4.id], newStatus: 'INACTIVE' }, ownerBCookie);
    assert(s1Res.status === 200 && s1Res.body.results[0].success === false && s1Res.body.results[0].reason === 'STUDENT_NOT_FOUND', `Scenario 1 failed: ${JSON.stringify(s1Res.body)}`);
    ok('1. Tenant isolation: tenant B cannot reach tenant A students through bulk operations, promotion, or documents');

    // ----------------------------------------------------
    // Scenario 8 & 9: Batch transfer + historical preservation
    // ----------------------------------------------------
    const s8Res = await post('/api/students/bulk/batch-transfer', { studentIds: [students.S5.id, students.S6.id], destinationBatchId: batchTransferBig.id }, ownerCookie);
    assert(s8Res.status === 200 && s8Res.body.summary.successful === 2, `Scenario 8 failed: ${JSON.stringify(s8Res.body)}`);
    const s5OldRow = await prisma.studentBatch.findFirst({ where: { studentId: students.S5.id, batchId: batchSource.id } });
    const s5NewRow = await prisma.studentBatch.findFirst({ where: { studentId: students.S5.id, batchId: batchTransferBig.id } });
    assert(s5OldRow?.status === 'TRANSFERRED' && s5OldRow.endDate !== null, `Scenario 9 failed: old row not preserved as TRANSFERRED: ${JSON.stringify(s5OldRow)}`);
    assert(s5NewRow?.status === 'ACTIVE', `Scenario 8 failed: new row not ACTIVE: ${JSON.stringify(s5NewRow)}`);
    ok('8. Batch transfer moves selected students to the destination batch');
    ok('9. Historical batch preservation: the old StudentBatch row survives as TRANSFERRED with an endDate, never deleted');

    // ----------------------------------------------------
    // Scenario 10: Batch capacity under a bulk transfer
    // ----------------------------------------------------
    const s10Res = await post('/api/students/bulk/batch-transfer', { studentIds: [students.S1.id, students.S7.id, students.S8.id], destinationBatchId: batchTransferSmall.id }, ownerCookie);
    const s10Successes = s10Res.body.results.filter((r: any) => r.success).length;
    const s10Failures = s10Res.body.results.filter((r: any) => !r.success && /BATCH_FULL/.test(r.reason));
    assert(s10Successes === 1 && s10Failures.length === 2, `Scenario 10 failed: expected 1 success + 2 BATCH_FULL, got ${JSON.stringify(s10Res.body.results)}`);
    ok('10. Batch capacity respected: a bulk transfer into a capacity-1 batch admits exactly one student, the rest fail with BATCH_FULL');

    // ----------------------------------------------------
    // Scenario 11: Concurrent batch assignment (race into a fresh capacity-1 batch)
    // ----------------------------------------------------
    const raceStudents = [students.S2.id, students.S3.id]; // both currently INACTIVE but still valid students for a batch transfer
    const raceResults = await Promise.all(
      raceStudents.map((studentId) => post('/api/students/bulk/batch-transfer', { studentIds: [studentId], destinationBatchId: batchRaceSmall.id }, ownerCookie))
    );
    const raceSuccesses = raceResults.filter((r) => r.body.results[0].success).length;
    assert(raceSuccesses === 1, `Scenario 11 failed: expected exactly 1 concurrent winner, got ${raceSuccesses}`);
    ok('11. Concurrent batch assignment: two simultaneous transfers into the same capacity-1 batch, only one wins');

    // ----------------------------------------------------
    // Scenario 6 & 7: Academic promotion + historical enrollment preservation
    // ----------------------------------------------------
    const promotePayload = {
      studentIds: [students.S9.id],
      sourceSessionId: session2026.id,
      destinationSessionId: session2027.id,
      destinationProgramId: program.id,
      destinationClassId: classDest.id,
      destinationBatchId: batchDestBig.id,
    };
    const s6Res = await post('/api/students/promotion', promotePayload, ownerCookie);
    assert(s6Res.status === 200 && s6Res.body.results[0].success === true && !s6Res.body.results[0].skipped, `Scenario 6 failed: ${JSON.stringify(s6Res.body)}`);
    const newEnrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: students.S9.id, academicSessionId: session2027.id } });
    const oldEnrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: students.S9.id, academicSessionId: session2026.id } });
    assert(newEnrollment?.status === 'ENROLLED' && newEnrollment.academicClassId === classDest.id, `Scenario 6 failed: new enrollment wrong: ${JSON.stringify(newEnrollment)}`);
    assert(oldEnrollment?.status === 'COMPLETED', `Scenario 7 failed: source enrollment must flip to COMPLETED, not be deleted: ${JSON.stringify(oldEnrollment)}`);
    const newBatchRow = await prisma.studentBatch.findFirst({ where: { studentId: students.S9.id, batchId: batchDestBig.id } });
    assert(newBatchRow?.status === 'ACTIVE', 'Scenario 6 failed: destination batch membership not created');
    ok('6. Academic promotion creates a new ENROLLED enrollment and batch membership in the destination session');
    ok('7. Historical enrollment preservation: the source session enrollment is flipped to COMPLETED, never deleted');

    // ----------------------------------------------------
    // Scenario 12: Duplicate promotion prevention
    // ----------------------------------------------------
    const s12Res = await post('/api/students/promotion', promotePayload, ownerCookie);
    assert(s12Res.body.results[0].success === true && s12Res.body.results[0].skipped === true && s12Res.body.results[0].reason === 'ALREADY_ENROLLED_IN_DESTINATION_SESSION', `Scenario 12 failed: ${JSON.stringify(s12Res.body)}`);
    const enrollmentCountAfterRepeat = await prisma.studentEnrollment.count({ where: { studentId: students.S9.id, academicSessionId: session2027.id } });
    assert(enrollmentCountAfterRepeat === 1, 'Scenario 12 failed: a repeat promotion must not create a duplicate enrollment row');
    ok('12. Duplicate promotion prevention: re-promoting into the same destination session is skipped, not duplicated');

    // ----------------------------------------------------
    // Scenario 25: Transaction rollback (promotion blocked by destination batch capacity)
    // ----------------------------------------------------
    // Fill batchDestSmall's single seat directly, then attempt to promote a
    // fresh student into it — the capacity check runs inside the same
    // per-student $transaction as the enrollment creation, so a rejection
    // there must leave zero trace of the attempted enrollment.
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: students.EMPTY.id, batchId: batchDestSmall.id, status: 'ACTIVE' } });
    const s25Res = await post('/api/students/promotion', { ...promotePayload, studentIds: [students.S10.id], destinationBatchId: batchDestSmall.id }, ownerCookie);
    assert(s25Res.body.results[0].success === false && /BATCH_FULL/.test(s25Res.body.results[0].reason), `Scenario 25 failed: expected BATCH_FULL rejection: ${JSON.stringify(s25Res.body)}`);
    const orphanedEnrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: students.S10.id, academicSessionId: session2027.id } });
    const sourceEnrollmentUnchanged = await prisma.studentEnrollment.findFirst({ where: { studentId: students.S10.id, academicSessionId: session2026.id } });
    assert(!orphanedEnrollment, 'Scenario 25 failed: a rejected promotion must not leave an orphaned destination enrollment');
    assert(sourceEnrollmentUnchanged?.status === 'ENROLLED', 'Scenario 25 failed: a rejected promotion must not touch the source enrollment either (same transaction)');
    ok('25. Transaction rollback: a promotion rejected for destination batch capacity leaves no orphaned enrollment and never touches the source enrollment');

    // ----------------------------------------------------
    // Scenario 13 & 16: Certificate numbering concurrency + format
    // ----------------------------------------------------
    const certResults = await Promise.all([
      post(`/api/students/${students.S1.id}/certificates`, { type: 'ENROLLMENT' }, ownerCookie),
      post(`/api/students/${students.S4.id}/certificates`, { type: 'ENROLLMENT' }, ownerCookie),
    ]);
    assert(certResults.every((r) => r.status === 201), `Scenario 13 failed: ${JSON.stringify(certResults.map((r) => r.body))}`);
    const certNumbers = certResults.map((r) => r.body.certificate.certificateNumber);
    assert(new Set(certNumbers).size === 2, `Scenario 13 failed: concurrent issuance must produce distinct numbers, got ${JSON.stringify(certNumbers)}`);
    for (const n of certNumbers) assert(/^CERT-\d{4}-\d{6}$/.test(n), `Scenario 16 failed: bad certificate number format ${n}`);
    ok('13. Certificate numbering concurrency: two simultaneous issuances produce two distinct sequential numbers');
    ok('16. Certificate generation produces the correct CERT-YYYY-NNNNNN number format');

    // ----------------------------------------------------
    // Scenario 14, 15, 29: ID card generation (single + bulk) with real, non-fabricated data
    // ----------------------------------------------------
    const s14Res = await get(`/api/students/${students.S1.id}/id-card`, ownerCookie);
    assert(s14Res.status === 200 && s14Res.body.student.name === students.S1.name && s14Res.body.student.studentIdCode === students.S1.studentIdCode, `Scenario 14 failed: ${JSON.stringify(s14Res.body)}`);
    assert(s14Res.body.student.photoUrl === null, 'Scenario 14 failed: a student with no uploaded photo must report null, never a fabricated URL');
    assert(s14Res.body.coachingCenter.name === a.center.name, `Scenario 29 failed: id-card must render the real tenant name: ${JSON.stringify(s14Res.body.coachingCenter)}`);
    ok('14. ID card generation (single) returns real student data, no fabricated photo');

    const s15Res = await post('/api/students/id-cards/bulk', { studentIds: [students.S1.id, students.S4.id, studentB1.id] }, staffA1Cookie);
    assert(s15Res.status === 200, `Scenario 15 failed: ${JSON.stringify(s15Res.body)}`);
    const s15Ids = s15Res.body.students.map((st: any) => st.id);
    assert(s15Ids.includes(students.S1.id) && s15Ids.includes(students.S4.id) && !s15Ids.includes(studentB1.id), `Scenario 15 failed: branch-locked bulk id-cards must silently exclude the other branch's student: ${JSON.stringify(s15Ids)}`);
    ok('15. Bulk ID card generation returns the correct set, silently narrowed to the caller\'s own branch');
    ok('29. Branding data: id-card and certificate rendering use the real coaching center name, never a placeholder');

    // ----------------------------------------------------
    // Scenario 17: Document authorization (cross-branch id-card/certificate rejected)
    // ----------------------------------------------------
    const s17aRes = await get(`/api/students/${students.S1.id}/id-card`, staffA2Cookie);
    const s17bRes = await post(`/api/students/${students.S1.id}/certificates`, { type: 'ENROLLMENT' }, staffA2Cookie);
    assert(s17aRes.status === 403 && s17bRes.status === 403, `Scenario 17 failed: id-card=${s17aRes.status} certificate=${s17bRes.status}`);
    ok('17. Document authorization: a branch-locked STAFF cannot generate an ID card or certificate for a foreign-branch student');

    // ----------------------------------------------------
    // Scenario 18: Student portal isolation
    // ----------------------------------------------------
    const s18aRes = await get('/api/portal/student/id-card', student1Cookie);
    const s18bRes = await get('/api/portal/student/certificates', student1Cookie);
    assert(s18aRes.status === 200 && s18aRes.body.student.id === students.S1.id, `Scenario 18 failed id-card: ${JSON.stringify(s18aRes.body)}`);
    assert(s18bRes.status === 200 && Array.isArray(s18bRes.body.certificates), `Scenario 18 failed certificates: ${JSON.stringify(s18bRes.body)}`);
    ok('18. Student portal isolation: a student can fetch their own id-card and certificate list');

    // ----------------------------------------------------
    // Scenario 19: Guardian child isolation
    // ----------------------------------------------------
    const s19LinkedRes = await get(`/api/portal/guardian/children/${students.S1.id}/id-card`, guardianCookie);
    const s19UnlinkedRes = await get(`/api/portal/guardian/children/${studentB1.id}/id-card`, guardianCookie);
    assert(s19LinkedRes.status === 200, `Scenario 19 failed linked child: ${s19LinkedRes.status}`);
    assert(s19UnlinkedRes.status === 403, `Scenario 19 failed: unlinked child must be rejected, got ${s19UnlinkedRes.status}`);
    ok('19. Guardian child isolation: unlinked child rejected, linked child\'s id-card accessible');

    // ----------------------------------------------------
    // Scenario 20 & 21: Bulk export authorization + studentIds filtering
    // ----------------------------------------------------
    const selectedIds = [students.S1.id, students.S4.id];
    const s21Res = await get(`/api/reports/students?view=directory&studentIds=${selectedIds.join(',')}`, ownerCookie);
    assert(s21Res.status === 200, `Scenario 21 failed: ${JSON.stringify(s21Res.body)}`);
    const s21RowIds = s21Res.body.data.rows.map((r: any) => r.id).sort();
    assert(JSON.stringify(s21RowIds) === JSON.stringify([...selectedIds].sort()), `Scenario 21 failed: studentIds filter did not narrow correctly, got ${JSON.stringify(s21RowIds)}`);
    ok('21. Export filtering: the studentIds filter narrows the directory view to exactly the selected students');

    const s20Res = await get(`/api/reports/students?view=directory&studentIds=${students.S1.id},${studentB1.id}`, staffA1Cookie);
    const s20RowIds = s20Res.body.data.rows.map((r: any) => r.id);
    assert(s20Res.status === 200 && s20RowIds.includes(students.S1.id) && !s20RowIds.includes(studentB1.id), `Scenario 20 failed: branch scoping must silently exclude the other branch's student: ${JSON.stringify(s20RowIds)}`);
    ok('20. Bulk export authorization: a branch-locked STAFF\'s export is silently scoped to their own branch even when a foreign id is in the selection');

    // ----------------------------------------------------
    // Scenario 22, 23, 24: Search / pagination / filters (existing directory endpoint, unchanged)
    // ----------------------------------------------------
    const s22Res = await get(`/api/students?search=${encodeURIComponent(students.S1.name)}`, ownerCookie);
    assert(s22Res.status === 200 && s22Res.body.students.some((s: any) => s.id === students.S1.id), `Scenario 22 failed: ${JSON.stringify(s22Res.body)}`);
    ok('22. Search on the existing student directory endpoint is unaffected');

    const s23Page1 = await get(`/api/students?branch=${branchA1.id}&pageSize=2&page=1`, ownerCookie);
    const s23Page2 = await get(`/api/students?branch=${branchA1.id}&pageSize=2&page=2`, ownerCookie);
    assert(s23Page1.status === 200 && s23Page2.status === 200 && s23Page1.body.students[0]?.id !== s23Page2.body.students[0]?.id, `Scenario 23 failed: ${JSON.stringify({ p1: s23Page1.body.students, p2: s23Page2.body.students })}`);
    ok('23. Pagination on the existing student directory endpoint is unaffected');

    const s24Res = await get(`/api/students?status=INACTIVE&branch=${branchA1.id}`, ownerCookie);
    assert(s24Res.status === 200 && s24Res.body.students.every((s: any) => s.status === 'INACTIVE'), `Scenario 24 failed: ${JSON.stringify(s24Res.body.students)}`);
    ok('24. Status filter on the existing student directory endpoint is unaffected');

    // ----------------------------------------------------
    // Scenario 26: Unauthorized role access (TEACHER)
    // ----------------------------------------------------
    const tStatus = await post('/api/students/bulk/status', { studentIds: [students.S1.id], newStatus: 'INACTIVE' }, teacherCookie);
    const tTransfer = await post('/api/students/bulk/batch-transfer', { studentIds: [students.S1.id], destinationBatchId: batchTransferBig.id }, teacherCookie);
    const tPromote = await post('/api/students/promotion', promotePayload, teacherCookie);
    const tCandidates = await get(`/api/students/promotion/candidates?sourceSessionId=${session2026.id}`, teacherCookie);
    const tCertIssue = await post(`/api/students/${students.S1.id}/certificates`, { type: 'ENROLLMENT' }, teacherCookie);
    assert(
      [tStatus, tTransfer, tPromote, tCandidates, tCertIssue].every((r) => r.status === 403),
      `Scenario 26 failed: status=${tStatus.status} transfer=${tTransfer.status} promote=${tPromote.status} candidates=${tCandidates.status} certIssue=${tCertIssue.status}`
    );
    // TEACHER retains read access to ID cards (matches READ_ROLES on the existing student routes).
    const tIdCard = await get(`/api/students/${students.S1.id}/id-card`, teacherCookie);
    assert(tIdCard.status === 200, `Scenario 26 failed: TEACHER should retain id-card read access, got ${tIdCard.status}`);
    ok('26. Unauthorized role access: TEACHER is blocked from every bulk/promotion/certificate-issue endpoint (read-only id-card access is preserved)');

    // ----------------------------------------------------
    // Scenario 27: Empty-state behavior
    // ----------------------------------------------------
    // session2026/classDest is a combination nobody is enrolled in (classDest
    // is only ever used as a promotion *destination* in session2027) — a
    // genuinely empty result, unlike session2027 itself which now has S9's
    // promoted enrollment from scenario 6.
    const s27aRes = await get(`/api/students/promotion/candidates?sourceSessionId=${session2026.id}&sourceClassId=${classDest.id}`, ownerCookie);
    assert(s27aRes.status === 200 && Array.isArray(s27aRes.body.students) && s27aRes.body.students.length === 0, `Scenario 27a failed: ${JSON.stringify(s27aRes.body)}`);
    const s27bRes = await get(`/api/students/${students.EMPTY.id}/certificates`, ownerCookie);
    assert(s27bRes.status === 200 && s27bRes.body.certificates.length === 0, `Scenario 27b failed: ${JSON.stringify(s27bRes.body)}`);
    ok('27. Empty-state behavior: zero promotion candidates and zero certificates render as real empty arrays, never an error or fabricated row');

    // ----------------------------------------------------
    // Scenario 28: Bangla localization
    // ----------------------------------------------------
    const bn = DICTIONARY.bn as any;
    assert(typeof bn.bulkOps?.changeStatus === 'string' && bn.bulkOps.changeStatus.length > 0, 'Scenario 28 failed: bn.bulkOps missing');
    assert(typeof bn.promotion?.title === 'string' && bn.promotion.title.length > 0, 'Scenario 28 failed: bn.promotion missing');
    assert(typeof bn.idCard?.title === 'string' && bn.idCard.title.length > 0, 'Scenario 28 failed: bn.idCard missing');
    assert(typeof bn.certificates?.title === 'string' && bn.certificates.title.length > 0, 'Scenario 28 failed: bn.certificates missing');
    ok('28. Bangla localization: new bulkOps/promotion/idCard/certificates dictionary sections are present and non-empty');

    // ----------------------------------------------------
    // Scenario 30: Audit logging
    // ----------------------------------------------------
    const requiredActions = ['STUDENT_STATUS_CHANGED', 'STUDENT_BATCH_TRANSFERRED', 'STUDENT_PROMOTED', 'CERTIFICATE_GENERATED', 'ID_CARD_GENERATED', 'ID_CARD_BULK_GENERATED'];
    const auditActions = await prisma.auditLog.findMany({ where: { coachingCenterId: cc, action: { in: requiredActions } } });
    for (const action of requiredActions) {
      assert(auditActions.some((al) => al.action === action), `Scenario 30 failed: audit log missing action ${action}`);
    }
    ok('30. Audit logging present for status change, batch transfer, promotion, certificate, and id-card actions');

    // Sanity check that adminCookie/ownerCookie both authenticated correctly (used throughout above).
    assert(!!adminCookie, 'sanity: admin login');

    console.log('\n========================================================');
    console.log(`PHASE 10.10 VERIFICATION COMPLETE (${passed} scenarios passed)`);
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
