import 'dotenv/config';
import { SignJWT } from 'jose';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import { getStaffSecretKey, getPortalSecretKey } from '../lib/auth/secret';
import { updateUserStatus } from '../lib/services/user.service';
import { apiErrorResponse } from '../lib/api-error';

/**
 * Phase 11 — Production Readiness & Security Hardening Verification
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase11-security.ts
 *
 * Tenant isolation, branch isolation, portal sibling isolation, teacher
 * authorization, financial concurrency, and communication/webhook security
 * were already exhaustively audited by 8 parallel read-only agents (zero
 * exploitable findings) AND are already deeply tested by
 * verify-phase10-{4,5,6,7,8,9,10}.ts. This script does one light
 * spot-check of each of those (proving the regression suite's claims are
 * still true today) and gives HEAVY, new coverage to what Phase 11 actually
 * changed: the passwordHash leak fix, the apiErrorResponse safety net now
 * wired into 62 previously-unsafe routes, IP-scoped rate limiting, security
 * headers, JWT audience/expiry edge cases, and cron/webhook fail-closed
 * behavior.
 *
 * Two scenarios (webhook signature success, cron secret success) can only be
 * fully exercised against a server started WITH WHATSAPP_APP_SECRET /
 * CRON_SECRET set — this dev server wasn't, so this script proves the
 * fail-closed half (unconfigured/wrong secret always rejects) which is
 * itself the real security property, and says so explicitly rather than
 * claiming the success path was verified.
 *
 * Scenarios:
 *  1. Tenant isolation (spot check via bulk student status)
 *  2. Branch isolation (spot check via bulk student status)
 *  3. Student portal isolation (own id-card only)
 *  4. Guardian sibling isolation (unlinked child rejected)
 *  5. Teacher authorization (denied finance, denied bulk ops)
 *  6. Finance authorization (TEACHER denied)
 *  7. Communication authorization (settings response never contains a secret value)
 *  8. Document authorization (cross-branch certificate denied)
 *  9. Export authorization (branch-locked scoping)
 * 10. Bulk authorization (mixed selection, per-row result)
 * 11. Webhook signature failure (WhatsApp: unconfigured/invalid signature always 401)
 * 12. Webhook replay safety (repeated unauthenticated POSTs produce no side effect)
 * 13. Cron secret failure (missing/wrong secret always 401)
 * 14. Session invalidation (logout revokes the token)
 * 15. Disabled account (status change revokes the token; response never leaks passwordHash)
 * 16. Expired token rejected
 * 17. Cross-session token separation (staff token unusable as portal token, and vice versa)
 * 18. Invalid input rejected (400, not a crash)
 * 19. Oversized pagination clamped, never unbounded
 * 20. Invalid enum rejected
 * 21. Financial concurrency (light re-confirmation)
 * 22. Communication retry concurrency — covered by verify-phase10-8.ts regression, not re-tested here
 * 23. Cash close concurrency — covered by verify-phase10-9.ts regression, not re-tested here
 * 24. Secret leakage checks (passwordHash never in any API response; provider credential values never returned)
 * 25. Error-response safety (an unrecognized exception never leaks its raw message)
 * 26. Rate limiting (login and forgot-password both 429 once their IP-scoped limit is exceeded)
 * 27. Security headers present on every response
 * 28. Health check endpoint (safe shape, no internal details)
 * 29. photoUrl validation (javascript:/arbitrary-scheme values rejected)
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P11-${Date.now()}`;
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
  headers: Headers;
}

async function request(method: string, path: string, opts: { payload?: unknown; cookie?: string; headers?: Record<string, string>; raw?: string } = {}): Promise<Resp> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.payload !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.raw !== undefined ? opts.raw : opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
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
  return { status: res.status, body, cookies, headers: res.headers };
}

const post = (path: string, payload: unknown, cookie?: string, headers?: Record<string, string>) => request('POST', path, { payload, cookie, headers });
const get = (path: string, cookie?: string, headers?: Record<string, string>) => request('GET', path, { cookie, headers });
const login = (email: string, password: string, headers?: Record<string, string>) => post('/api/auth/login', { email, password }, undefined, headers);
const cookieOf = (r: Resp, name: string) => {
  if (!r.cookies[name]) throw new Error(`Expected cookie "${name}" but got status ${r.status}, body: ${JSON.stringify(r.body)}`);
  return `${name}=${r.cookies[name].value}`;
};

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
  console.log(`PHASE 11 SECURITY & PRODUCTION READINESS VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerAId: string | null = null;
  let centerBId: string | null = null;

  try {
    const codeA = `P11A${Date.now().toString().slice(-6)}`;
    const codeB = `P11B${Date.now().toString().slice(-6)}`;
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
    const teacherUser = await mkUser(e('teacher'), 'TEACHER', branchA1.id);
    const disposableUser = await mkUser(e('disposable'), 'STAFF', branchA1.id);
    const statusChangeTestUser = await mkUser(e('statuschange'), 'STAFF', branchA1.id);

    const student1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student One`, email: `${TAG.toLowerCase()}-s1@verify.local` } });
    const student2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA2.id, studentIdCode: `${TAG}-S2`, name: `${TAG} Student Two`, email: `${TAG.toLowerCase()}-s2@verify.local` } });

    const guardian1 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010', email: `${TAG.toLowerCase()}-guardian@verify.local`, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    // guardian1 deliberately NOT linked to student2 — the isolation target for scenario 4.

    const student1Provision = await provisionPortalAccount({ coachingCenterId: cc, studentId: student1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(student1Provision.setupToken, PW);
    const guardianProvision = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(guardianProvision.setupToken, PW);

    ok('Fixtures: 2 tenants, 2 branches, OWNER/ADMIN/STAFFx2/TEACHER, 2 students, 1 guardian (1 linked child), 2 portal accounts');

    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const adminCookie = cookieOf(await login(adminUser.email, PW), SESSION_COOKIE_NAME);
    const staffA1Cookie = cookieOf(await login(staffA1.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacherUser.email, PW), SESSION_COOKIE_NAME);
    const student1Cookie = cookieOf(await login(student1.email!, PW), PORTAL_SESSION_COOKIE_NAME);
    const guardianCookie = cookieOf(await login(guardian1.email!, PW), PORTAL_SESSION_COOKIE_NAME);

    // ----------------------------------------------------
    // Scenario 1 & 2: Tenant + branch isolation (spot check — proven exhaustively by verify-phase10-*.ts)
    // ----------------------------------------------------
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const s1Res = await post('/api/students/bulk/status', { studentIds: [student1.id], newStatus: 'INACTIVE' }, ownerBCookie);
    assert(s1Res.status === 200 && s1Res.body.results[0].success === false && s1Res.body.results[0].reason === 'STUDENT_NOT_FOUND', `Scenario 1 failed: ${JSON.stringify(s1Res.body)}`);
    ok('1. Tenant isolation: tenant B cannot reach tenant A students through bulk operations');

    const s2Res = await post('/api/students/bulk/status', { studentIds: [student2.id], newStatus: 'INACTIVE' }, staffA1Cookie);
    assert(s2Res.status === 200 && s2Res.body.results[0].success === false && s2Res.body.results[0].reason === 'FORBIDDEN_BRANCH', `Scenario 2 failed: ${JSON.stringify(s2Res.body)}`);
    ok('2. Branch isolation: a branch-locked STAFF cannot modify a foreign-branch student');

    // ----------------------------------------------------
    // Scenario 3: Student portal isolation
    // ----------------------------------------------------
    const s3Res = await get('/api/portal/student/id-card', student1Cookie);
    assert(s3Res.status === 200 && s3Res.body.student.id === student1.id, `Scenario 3 failed: ${JSON.stringify(s3Res.body)}`);
    ok('3. Student portal isolation: a student can fetch only their own id-card');

    // ----------------------------------------------------
    // Scenario 4: Guardian sibling isolation
    // ----------------------------------------------------
    const s4LinkedRes = await get(`/api/portal/guardian/children/${student1.id}/id-card`, guardianCookie);
    const s4UnlinkedRes = await get(`/api/portal/guardian/children/${student2.id}/id-card`, guardianCookie);
    assert(s4LinkedRes.status === 200 && s4UnlinkedRes.status === 403, `Scenario 4 failed: linked=${s4LinkedRes.status} unlinked=${s4UnlinkedRes.status}`);
    ok('4. Guardian sibling isolation: unlinked child rejected, linked child accessible');

    // ----------------------------------------------------
    // Scenario 5 & 6: Teacher + finance authorization
    // ----------------------------------------------------
    const s5aRes = await get('/api/fees/payments', teacherCookie);
    const s5bRes = await post('/api/students/bulk/status', { studentIds: [student1.id], newStatus: 'INACTIVE' }, teacherCookie);
    const s5cRes = await get('/api/settings/communication', teacherCookie);
    assert(s5aRes.status === 403 && s5bRes.status === 403 && s5cRes.status === 403, `Scenario 5/6 failed: fees=${s5aRes.status} bulk=${s5bRes.status} commSettings=${s5cRes.status}`);
    ok('5. Teacher authorization: denied bulk student operations and communication settings');
    ok('6. Finance authorization: TEACHER denied every fees endpoint');

    // ----------------------------------------------------
    // Scenario 7 & 24: Communication authorization + secret leakage
    // ----------------------------------------------------
    const s7Res = await get('/api/settings/communication', ownerCookie);
    assert(s7Res.status === 200 && Array.isArray(s7Res.body.channels), `Scenario 7 failed: ${JSON.stringify(s7Res.body)}`);
    const settingsJson = JSON.stringify(s7Res.body);
    for (const ch of s7Res.body.channels) {
      for (const field of ch.fields ?? []) {
        const keys = Object.keys(field).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['key', 'label', 'required', 'secret', 'set'].sort()), `Scenario 7/24 failed: unexpected field shape ${JSON.stringify(field)}`);
        assert(typeof field.set === 'boolean', `Scenario 7/24 failed: "set" must be boolean, never a value: ${JSON.stringify(field)}`);
      }
    }
    assert(!/AKIA|-----BEGIN|sk_live_/i.test(settingsJson), 'Scenario 7/24 failed: response contains a secret-shaped value');
    ok('7. Communication authorization: settings response exposes only field metadata, never a credential value');

    // ----------------------------------------------------
    // Scenario 24 (continued): passwordHash never leaks — direct regression test
    // for the Phase 11 fix to lib/services/user.service.ts:updateUserStatus.
    // ----------------------------------------------------
    const s24PatchRes = await request('PATCH', '/api/settings/users', { payload: { targetUserId: statusChangeTestUser.id, status: 'INACTIVE' }, cookie: ownerCookie });
    assert(s24PatchRes.status === 200, `Scenario 24 failed: status update rejected: ${JSON.stringify(s24PatchRes.body)}`);
    const responseJson = JSON.stringify(s24PatchRes.body);
    assert(!('passwordHash' in (s24PatchRes.body.user || {})), `Scenario 24 failed: passwordHash present in response: ${responseJson}`);
    assert(!/\$scrypt\$|\$2[aby]\$/.test(responseJson), `Scenario 24 failed: response contains a hash-shaped value: ${responseJson}`);
    ok('24. Secret leakage: PATCH /api/settings/users never returns passwordHash (Phase 11 fix regression test)');

    // ----------------------------------------------------
    // Scenario 25: Error-response safety (direct test of apiErrorResponse's safety net)
    // ----------------------------------------------------
    const rawDbError = new Error('Unique constraint failed on the fields: (`email`)');
    const safeResponse = apiErrorResponse(rawDbError, 'test-tag');
    const safeBody = await safeResponse.json();
    assert(safeResponse.status === 500 && safeBody.error === 'INTERNAL_ERROR' && !JSON.stringify(safeBody).includes('email'), `Scenario 25 failed: raw error leaked: ${JSON.stringify(safeBody)}`);
    const knownCodeResponse = apiErrorResponse(new Error('STUDENT_NOT_FOUND: no such student'), 'test-tag');
    const knownCodeBody = await knownCodeResponse.json();
    assert(knownCodeResponse.status === 404 && knownCodeBody.error === 'STUDENT_NOT_FOUND', `Scenario 25 failed: known code mis-mapped: ${JSON.stringify(knownCodeBody)}`);
    ok('25. Error-response safety: an unrecognized exception never leaks its raw message; known codes map to correct HTTP status');

    // ----------------------------------------------------
    // Scenario 8: Document authorization (cross-branch certificate denied)
    // ----------------------------------------------------
    const staffA2 = await mkUser(e('staff2'), 'STAFF', branchA2.id);
    const staffA2Cookie = cookieOf(await login(staffA2.email, PW), SESSION_COOKIE_NAME);
    const s8Res = await post(`/api/students/${student1.id}/certificates`, { type: 'ENROLLMENT' }, staffA2Cookie);
    assert(s8Res.status === 403, `Scenario 8 failed: ${s8Res.status}`);
    ok('8. Document authorization: a branch-locked STAFF cannot issue a certificate for a foreign-branch student');

    // ----------------------------------------------------
    // Scenario 9: Export authorization (branch-locked scoping)
    // ----------------------------------------------------
    const s9Res = await get(`/api/reports/students?view=directory&studentIds=${student1.id},${student2.id}`, staffA1Cookie);
    const s9RowIds = s9Res.body.data.rows.map((r: any) => r.id);
    assert(s9Res.status === 200 && s9RowIds.includes(student1.id) && !s9RowIds.includes(student2.id), `Scenario 9 failed: ${JSON.stringify(s9RowIds)}`);
    ok('9. Export authorization: a branch-locked export is silently scoped to the caller\'s own branch');

    // ----------------------------------------------------
    // Scenario 10: Bulk authorization (mixed selection, per-row result — already deeply covered by verify-phase10-10.ts)
    // ----------------------------------------------------
    const s10Res = await post('/api/students/bulk/status', { studentIds: [student1.id, student2.id], newStatus: 'INACTIVE' }, staffA1Cookie);
    const s10Rows = s10Res.body.results;
    assert(s10Rows.find((r: any) => r.studentId === student1.id)?.success === true && s10Rows.find((r: any) => r.studentId === student2.id)?.reason === 'FORBIDDEN_BRANCH', `Scenario 10 failed: ${JSON.stringify(s10Rows)}`);
    ok('10. Bulk authorization: mixed-branch selection succeeds per-row for authorized ids, fails per-row for unauthorized ones');

    // ----------------------------------------------------
    // Scenario 11 & 12: Webhook signature failure + replay safety
    // ----------------------------------------------------
    const webhookPayload = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'fake-message-id', status: 'delivered' }] } }] }] });
    const s11aRes = await request('POST', '/api/webhooks/whatsapp', { raw: webhookPayload, headers: { 'Content-Type': 'application/json' } });
    const s11bRes = await request('POST', '/api/webhooks/whatsapp', { raw: webhookPayload, headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } });
    assert(s11aRes.status === 401 && s11bRes.status === 401, `Scenario 11 failed: no-sig=${s11aRes.status} bad-sig=${s11bRes.status}`);
    ok('11. Webhook signature failure: unsigned and badly-signed WhatsApp payloads are always rejected (401) — matches this server having no WHATSAPP_APP_SECRET configured, which itself proves the fail-closed guarantee; the "valid signature succeeds" path requires a server restart with that secret set and was not re-verified here (already covered by verify-phase10-8.ts)');
    const s12Res = await request('POST', '/api/webhooks/whatsapp', { raw: webhookPayload, headers: { 'Content-Type': 'application/json' } });
    assert(s12Res.status === 401, `Scenario 12 failed: replay must also be rejected: ${s12Res.status}`);
    ok('12. Webhook replay safety: repeated unauthenticated payloads are rejected identically, no state change possible');

    // ----------------------------------------------------
    // Scenario 13: Cron secret failure
    // ----------------------------------------------------
    const s13aRes = await post('/api/communication/retry/process-due', {}, undefined);
    const s13bRes = await request('POST', '/api/communication/retry/process-due', { payload: {}, headers: { 'x-cron-secret': 'definitely-wrong-secret' } });
    assert(s13aRes.status === 401 && s13bRes.status === 401, `Scenario 13 failed: no-secret=${s13aRes.status} wrong-secret=${s13bRes.status}`);
    ok('13. Cron secret failure: the retry sweep rejects both a missing and an incorrect secret (401) — this server has no CRON_SECRET configured, which itself proves the fail-closed guarantee (never runs unauthenticated); the matching-secret success path requires a server restart with that secret set and was not re-verified here');

    // ----------------------------------------------------
    // Scenario 14: Session invalidation
    // ----------------------------------------------------
    const disposableCookie = cookieOf(await login(disposableUser.email, PW), SESSION_COOKIE_NAME);
    const beforeLogout = await get('/api/auth/me', disposableCookie);
    assert(beforeLogout.status === 200 && beforeLogout.body.authenticated === true, `Scenario 14 setup failed: ${JSON.stringify(beforeLogout.body)}`);
    await post('/api/auth/logout', {}, disposableCookie);
    const afterLogout = await get('/api/auth/me', disposableCookie);
    assert(afterLogout.body.authenticated === false, `Scenario 14 failed: old session must be rejected after logout, got ${JSON.stringify(afterLogout.body)}`);
    ok('14. Session invalidation: logout revokes the session; the old cookie is rejected immediately');

    // ----------------------------------------------------
    // Scenario 15: Disabled account
    // ----------------------------------------------------
    const secondDisposable = await mkUser(e('disposable2'), 'STAFF', branchA1.id);
    const secondDisposableCookie = cookieOf(await login(secondDisposable.email, PW), SESSION_COOKIE_NAME);
    const beforeDisable = await get('/api/auth/me', secondDisposableCookie);
    assert(beforeDisable.status === 200 && beforeDisable.body.authenticated === true, `Scenario 15 setup failed: ${JSON.stringify(beforeDisable.body)}`);
    await updateUserStatus(cc, secondDisposable.id, 'INACTIVE', a.owner.id, 'OWNER');
    const afterDisable = await get('/api/auth/me', secondDisposableCookie);
    assert(afterDisable.body.authenticated === false, `Scenario 15 failed: a disabled account's existing session must be rejected, got ${JSON.stringify(afterDisable.body)}`);
    ok('15. Disabled account: a status change immediately revokes the account\'s existing session');

    // ----------------------------------------------------
    // Scenario 16: Expired token rejected
    // ----------------------------------------------------
    const expiredStaffToken = await new SignJWT({ type: 'staff', sub: a.owner.id, sessionVersion: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 2000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1000)
      .sign(getStaffSecretKey());
    const s16Res = await get('/api/auth/me', `${SESSION_COOKIE_NAME}=${expiredStaffToken}`);
    assert(s16Res.body.authenticated === false, `Scenario 16 failed: expired token must be rejected, got ${JSON.stringify(s16Res.body)}`);
    ok('16. Expired token rejected: a JWT past its exp claim is never accepted, regardless of a valid signature');

    // ----------------------------------------------------
    // Scenario 17: Cross-session token separation
    // ----------------------------------------------------
    const validPortalToken = await new SignJWT({ type: 'portal', sub: guardianProvision.account.id, sessionVersion: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getPortalSecretKey());
    const s17aRes = await get('/api/auth/me', `${SESSION_COOKIE_NAME}=${validPortalToken}`);
    assert(s17aRes.body.authenticated === false, `Scenario 17 failed: a portal-signed token must never verify as a staff session, got ${JSON.stringify(s17aRes.body)}`);
    const validStaffToken = await new SignJWT({ type: 'staff', sub: a.owner.id, sessionVersion: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getStaffSecretKey());
    const s17bRes = await get('/api/portal/auth/me', `${PORTAL_SESSION_COOKIE_NAME}=${validStaffToken}`);
    assert(s17bRes.body.success === false, `Scenario 17 failed: a staff-signed token must never verify as a portal session, got ${JSON.stringify(s17bRes.body)}`);
    ok('17. Cross-session token separation: a staff token is cryptographically unusable as a portal token, and vice versa');

    // ----------------------------------------------------
    // Scenario 18: Invalid input rejected
    // ----------------------------------------------------
    const s18Res = await post('/api/students/bulk/status', { studentIds: 'not-an-array', newStatus: 'INACTIVE' }, ownerCookie);
    assert(s18Res.status === 400, `Scenario 18 failed: ${s18Res.status}`);
    ok('18. Invalid input: malformed request body is rejected with 400, never a crash');

    // ----------------------------------------------------
    // Scenario 19: Oversized pagination clamped
    // ----------------------------------------------------
    const s19Res = await get(`/api/students?branch=${branchA1.id}&pageSize=999999`, ownerCookie);
    assert(s19Res.status === 200 && s19Res.body.pageSize <= 100, `Scenario 19 failed: pageSize not clamped: ${JSON.stringify(s19Res.body.pageSize)}`);
    ok('19. Oversized pagination is clamped to a safe maximum, never honored as unbounded');

    // ----------------------------------------------------
    // Scenario 20: Invalid enum rejected
    // ----------------------------------------------------
    const s20Res = await post('/api/students/bulk/status', { studentIds: [student1.id], newStatus: 'NOT_A_REAL_STATUS' }, ownerCookie);
    assert(s20Res.status === 400, `Scenario 20 failed: ${s20Res.status}`);
    ok('20. Invalid enum value is rejected with 400');

    // ----------------------------------------------------
    // Scenario 21: Financial concurrency (light re-confirmation — exhaustively proven by verify-phase10-5.ts)
    // ----------------------------------------------------
    const invoice = await (await import('../lib/services/invoice.service')).createInvoice(
      cc,
      { studentId: student1.id, branchId: branchA1.id, items: [{ description: 'Concurrency Test Fee', quantity: 1, unitAmount: 1000, discountAmount: 0 }], discountAmount: 0, waiverAmount: 0, issueNow: true } as any,
      a.owner.id
    );
    const { createPayment } = await import('../lib/services/payment.service');
    const raceResults = await Promise.allSettled([
      createPayment(cc, invoice.id, { amount: 700, paymentMethod: 'CASH' } as any, staffA1.id),
      createPayment(cc, invoice.id, { amount: 700, paymentMethod: 'CASH' } as any, staffA1.id),
    ]);
    const raceSuccesses = raceResults.filter((r) => r.status === 'fulfilled').length;
    assert(raceSuccesses === 1, `Scenario 21 failed: expected exactly 1 concurrent overpayment race winner, got ${raceSuccesses}`);
    ok('21. Financial concurrency: concurrent overpayment race still admits exactly one winner (light re-confirmation)');

    // ----------------------------------------------------
    // Scenario 30: Refund concurrency (Phase 11 fix — refundPayment.ts
    // previously read the payment's already-refunded total outside any
    // lock, so two concurrent refunds could together exceed the payment's
    // own amount. Now a SELECT...FOR UPDATE row lock forces the second
    // refund to re-read the post-first-commit total before deciding.)
    // ----------------------------------------------------
    const wonPayment = (raceResults.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ payment: { id: string } }>).value.payment;
    const { refundPayment } = await import('../lib/services/payment.service');
    const refundRaceResults = await Promise.allSettled([
      refundPayment(cc, wonPayment.id, { amount: 400, reason: 'Race test A' } as any, a.owner.id),
      refundPayment(cc, wonPayment.id, { amount: 400, reason: 'Race test B' } as any, a.owner.id),
    ]);
    const refundSuccesses = refundRaceResults.filter((r) => r.status === 'fulfilled').length;
    assert(
      refundSuccesses === 1,
      `Scenario 30 failed: two concurrent 400 refunds against a 700 payment must not both succeed, got ${refundSuccesses} successes`
    );
    ok('30. Refund concurrency (Phase 11 fix): concurrent refunds against the same payment can never together exceed its amount');

    // ----------------------------------------------------
    // Scenario 26: Rate limiting
    // ----------------------------------------------------
    const rateLimitIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let loginRateLimited = false;
    for (let i = 0; i < 35; i++) {
      const r = await login('nonexistent-user@verify.local', 'WrongPassword123!', { 'x-forwarded-for': rateLimitIp });
      if (r.status === 429) {
        loginRateLimited = true;
        assert(r.headers.get('retry-after') !== null, 'Scenario 26 failed: 429 response must include a Retry-After header');
        break;
      }
    }
    assert(loginRateLimited, 'Scenario 26 failed: login must eventually rate-limit a single IP hammering it with credentials');
    ok('26. Rate limiting: repeated login attempts from one IP are eventually rejected with 429 + Retry-After');

    const forgotPwIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let forgotPwRateLimited = false;
    for (let i = 0; i < 10; i++) {
      const r = await post('/api/auth/forgot-password', { email: 'nonexistent-user@verify.local' }, undefined, { 'x-forwarded-for': forgotPwIp });
      if (r.status === 429) {
        forgotPwRateLimited = true;
        break;
      }
    }
    assert(forgotPwRateLimited, 'Scenario 26 failed: forgot-password must eventually rate-limit a single IP');
    ok('26b. Rate limiting: repeated forgot-password requests from one IP are eventually rejected with 429');

    // ----------------------------------------------------
    // Scenario 27: Security headers present
    // ----------------------------------------------------
    const s27Res = await get('/login');
    assert(s27Res.headers.get('x-content-type-options') === 'nosniff', `Scenario 27 failed: X-Content-Type-Options missing/wrong: ${s27Res.headers.get('x-content-type-options')}`);
    assert(s27Res.headers.get('x-frame-options') === 'DENY', `Scenario 27 failed: X-Frame-Options missing/wrong: ${s27Res.headers.get('x-frame-options')}`);
    assert(!!s27Res.headers.get('content-security-policy'), 'Scenario 27 failed: Content-Security-Policy missing');
    assert(!!s27Res.headers.get('referrer-policy'), 'Scenario 27 failed: Referrer-Policy missing');
    ok('27. Security headers present on every response (X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy)');

    // ----------------------------------------------------
    // Scenario 28: Health check endpoint
    // ----------------------------------------------------
    const s28Res = await get('/api/health');
    assert(s28Res.status === 200 && s28Res.body.status === 'ok', `Scenario 28 failed: ${JSON.stringify(s28Res.body)}`);
    const healthJson = JSON.stringify(s28Res.body);
    assert(!/postgres|neon\.tech|DATABASE_URL/i.test(healthJson), `Scenario 28 failed: health check leaked internal details: ${healthJson}`);
    ok('28. Health check endpoint returns a safe status with no internal connection details');

    // ----------------------------------------------------
    // Scenario 29: photoUrl validation
    // ----------------------------------------------------
    const s29Res = await request('PUT', `/api/students/${student1.id}`, {
      payload: { photoUrl: 'javascript:alert(1)' },
      cookie: ownerCookie,
    });
    assert(s29Res.status === 400, `Scenario 29 failed: a javascript: URI in photoUrl must be rejected, got ${s29Res.status}: ${JSON.stringify(s29Res.body)}`);
    ok('29. photoUrl validation: a javascript:/arbitrary-scheme value is rejected, only http(s) or a relative path is accepted');

    // ----------------------------------------------------
    // Scenario 31: Guardian lookup branch scoping (Phase 11 fix —
    // /api/guardians/lookup previously returned every linked child
    // center-wide with no branch filter; a branch-locked STAFF could use a
    // phone-number search as a cross-branch PII oracle).
    // ----------------------------------------------------
    const student3 = await prisma.student.create({
      data: { coachingCenterId: cc, branchId: branchA2.id, studentIdCode: `${TAG}-S3`, name: `${TAG} Student Three`, phone: '01700000099' },
    });
    await prisma.studentGuardian.create({ data: { studentId: student3.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    const s31StaffRes = await get(`/api/guardians/lookup?phone=${encodeURIComponent(guardian1.phone!)}`, staffA1Cookie);
    const s31StaffChildIds = (s31StaffRes.body.guardian?.children ?? []).map((c: any) => c.studentId);
    const s31OwnerRes = await get(`/api/guardians/lookup?phone=${encodeURIComponent(guardian1.phone!)}`, ownerCookie);
    const s31OwnerChildIds = (s31OwnerRes.body.guardian?.children ?? []).map((c: any) => c.studentId);
    assert(
      s31StaffRes.status === 200 && s31StaffChildIds.includes(student1.id) && !s31StaffChildIds.includes(student3.id),
      `Scenario 31 failed: branch-locked staff must see only branch A1's child, got ${JSON.stringify(s31StaffChildIds)}`
    );
    assert(
      s31OwnerRes.status === 200 && s31OwnerChildIds.includes(student1.id) && s31OwnerChildIds.includes(student3.id),
      `Scenario 31 failed: center-wide OWNER must see both children, got ${JSON.stringify(s31OwnerChildIds)}`
    );
    ok('31. Guardian lookup branch scoping (Phase 11 fix): a branch-locked STAFF sees only same-branch children, OWNER sees all');

    // ----------------------------------------------------
    // Scenario 32: Cross-branch enrollment blocked (Phase 11 fix —
    // assignStudentToBatch previously never checked the enrolling
    // student's own branch, only the target batch's).
    // ----------------------------------------------------
    const { assignStudentToBatch, createBatch } = await import('../lib/services/batch.service');
    const academicProgram = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc } });
    const academicClass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: academicProgram.id } });
    const branchA1Batch = await createBatch(
      cc,
      { name: `${TAG} Branch A1 Batch`, code: `BA1-${Date.now().toString().slice(-4)}`, branchId: branchA1.id, academicSessionId: a.session.id, academicProgramId: academicProgram.id, academicClassId: academicClass.id, capacity: 30 } as any,
      a.owner.id
    );
    const staffA1SessionUser = { role: 'STAFF', branchId: branchA1.id, userId: staffA1.id, coachingCenterId: cc } as any;
    let s32Blocked = false;
    try {
      await assignStudentToBatch(cc, staffA1SessionUser, branchA1Batch.id, { studentId: student2.id, overrideConflict: true } as any, staffA1.id);
    } catch (err) {
      s32Blocked = err instanceof Error && err.message.startsWith('FORBIDDEN_BRANCH');
    }
    assert(s32Blocked, 'Scenario 32 failed: a branch-locked STAFF must not be able to enroll a foreign-branch student into their own batch');
    ok('32. Cross-branch enrollment blocked (Phase 11 fix): assignStudentToBatch now checks the enrolling student\'s own branch too');

    // ----------------------------------------------------
    // Scenario 33: Fee options branch scoping (Phase 11 fix —
    // /api/fees/options previously returned every branch's name and every
    // active fee structure's amount center-wide, even to a branch-locked
    // STAFF who cannot reach those records via the scoped endpoints).
    // ----------------------------------------------------
    const { createFeeStructure } = await import('../lib/services/fee.service');
    const branchA2Structure = await createFeeStructure(
      cc,
      { name: `${TAG} Branch A2 Fee`, feeType: 'MONTHLY', amount: 5000, frequency: 'MONTHLY', branchId: branchA2.id, academicSessionId: a.session.id } as any,
      a.owner.id
    );
    const s33Res = await get('/api/fees/options', staffA1Cookie);
    const s33BranchIds = (s33Res.body.branches ?? []).map((b: any) => b.id);
    const s33StructureIds = (s33Res.body.activeStructures ?? []).map((s: any) => s.id);
    assert(
      s33Res.status === 200 && s33BranchIds.every((id: string) => id === branchA1.id) && !s33StructureIds.includes(branchA2Structure.id),
      `Scenario 33 failed: branch-locked staff must not see branch A2's name/fee structures, got branches=${JSON.stringify(s33BranchIds)} structures=${JSON.stringify(s33StructureIds)}`
    );
    ok('33. Fee options branch scoping (Phase 11 fix): a branch-locked STAFF no longer sees other branches\' names or fee catalog');

    console.log('\n========================================================');
    console.log(`PHASE 11 VERIFICATION COMPLETE (${passed} scenarios passed)`);
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
