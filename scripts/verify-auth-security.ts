import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { issueStaffLoginOtp } from '../lib/services/staff-otp.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import type { RoleCode } from '@prisma/client';

/**
 * Authentication security verification over real HTTP against a running
 * PRODUCTION build (`npm run build && npm run start`):
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-auth-security.ts
 *
 * In production the OTP request endpoint issues nothing (no SMS provider),
 * so OTP expiry/reuse/attempt tests obtain a challenge through the
 * server-side service and then submit it over HTTP. Builds two throwaway
 * tenants and deletes them in `finally`.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `AUTHVERIFY-${Date.now()}`;
const PW = 'CorrectHorse9';
let passed = 0;

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
  cookies: Record<string, { value: string; attrs: string }>;
}
async function post(path: string, payload: unknown): Promise<Resp> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'manual' });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const cookies: Resp['cookies'] = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = { value: pair.slice(i + 1), attrs: attrs.join(';').toLowerCase() };
  }
  return { status: res.status, body, cookies };
}
function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}
const staffLogin = (identifier: string, password: string) => post('/api/auth/login', { identifier, password, mode: 'password' });
const otpLogin = (phone: string, otp: string) => post('/api/auth/login', { identifier: phone, otp, mode: 'otp' });

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
  console.log(`AUTHENTICATION SECURITY VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerA: string | null = null;
  let centerB: string | null = null;
  try {
    const codeA = `AVA${Date.now().toString().slice(-7)}`;
    const codeB = `AVB${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerA = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerB = b.center.id;
    const roles = await prisma.role.findMany({ where: { coachingCenterId: centerA } });
    const roleId = (c: RoleCode) => roles.find((r) => r.code === c)!.id;
    const uniquePhone = (n: number) => `017${(Date.now() + n).toString().slice(-8)}`;
    const mkUser = (email: string, role: RoleCode | null, opts: { status?: 'ACTIVE' | 'INACTIVE'; phone?: string; cc?: string; password?: string } = {}) =>
      prisma.user.create({
        data: {
          coachingCenterId: opts.cc ?? centerA!,
          branchId: opts.cc ? null : a.branch.id,
          email,
          phone: opts.phone ?? null,
          passwordHash: hashPassword(opts.password ?? PW),
          name: `${TAG} ${email}`,
          status: opts.status ?? 'ACTIVE',
          ...(role ? { roleAssignments: { create: { roleId: roleId(role), branchId: a.branch.id } } } : {}),
        },
      });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const admin = await mkUser(e('admin'), 'ADMIN');
    const staff = await mkUser(e('staff'), 'STAFF');
    const teacher = await mkUser(e('teacher'), 'TEACHER');
    const inactive = await mkUser(e('inactive'), 'STAFF', { status: 'INACTIVE' });
    const noRole = await mkUser(e('norole'), null);
    const otpPhone = uniquePhone(11);
    const otpUser = await mkUser(e('otp'), 'STAFF', { phone: otpPhone });
    // Cross-tenant: same email in A and B with different passwords, plus an identical-credentials pair.
    const shared = `shared-${codeA.toLowerCase()}@verify.local`;
    const sharedA = await mkUser(shared, 'ADMIN', { password: 'TenantAPass1' });
    const bRoles = await prisma.role.findMany({ where: { coachingCenterId: centerB } });
    const sharedB = await prisma.user.create({
      data: { coachingCenterId: centerB, email: shared, passwordHash: hashPassword('TenantBPass1'), name: `${TAG} sharedB`, roleAssignments: { create: { roleId: bRoles.find((r) => r.code === 'STAFF')!.id } } },
    });
    const twin = `twin-${codeA.toLowerCase()}@verify.local`;
    await mkUser(twin, 'STAFF', { password: 'SamePass123' });
    await prisma.user.create({ data: { coachingCenterId: centerB, email: twin, passwordHash: hashPassword('SamePass123'), name: `${TAG} twinB`, roleAssignments: { create: { roleId: bRoles.find((r) => r.code === 'STAFF')!.id } } } });
    // Portal identities
    const student = await prisma.student.create({ data: { coachingCenterId: centerA, branchId: a.branch.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student` } });
    const guardian = await prisma.guardian.create({ data: { coachingCenterId: centerA, name: `${TAG} Guardian`, relationship: 'Father', phone: uniquePhone(22) } });
    await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true } });
    const sp = await provisionPortalAccount({ coachingCenterId: centerA, studentId: student.id, actorUserId: a.owner.id });
    await completeSetupOrReset(sp.setupToken, 'StudentPass123');
    const gp = await provisionPortalAccount({ coachingCenterId: centerA, guardianId: guardian.id, actorUserId: a.owner.id });
    await completeSetupOrReset(gp.setupToken, 'GuardianPass123');
    ok('Fixtures: 2 tenants, OWNER/ADMIN/STAFF/TEACHER, inactive, role-less, cross-tenant pairs, student + guardian portal accounts');

    // ---- 1-4, 20-22: valid logins + session identity/tenant/role ----
    for (const [label, email, role, id] of [
      ['OWNER', a.owner.email, 'OWNER', a.owner.id],
      ['ADMIN', admin.email, 'ADMIN', admin.id],
      ['STAFF', staff.email, 'STAFF', staff.id],
      ['TEACHER', teacher.email, 'TEACHER', teacher.id],
    ] as const) {
      const r = await staffLogin(email, PW);
      assert(r.status === 200 && r.body.success === true, `${label} login (got ${r.status} ${JSON.stringify(r.body)})`);
      const c = r.cookies[SESSION_COOKIE_NAME];
      assert(c && !r.cookies[PORTAL_SESSION_COOKIE_NAME], `${label} gets only the staff session cookie`);
      const p = jwtPayload(c.value);
      assert(p.userId === id && p.coachingCenterId === centerA && p.role === role, `${label} session identity/tenant/role`);
      assert(!('password' in p) && !('passwordHash' in p) && !('otp' in p), 'no secrets in JWT');
      assert(c.attrs.includes('httponly') && c.attrs.includes('samesite=lax') && c.attrs.includes('path=/') && c.attrs.includes('max-age='), `${label} cookie attributes (${c.attrs})`);
      assert(c.attrs.includes('secure'), 'Secure cookie in production');
      ok(`${label} valid password → success; session carries correct user, tenant and role`);
    }
    ok('20-22. Session identity, tenant and role verified for all four staff roles');

    // ---- 5-9 ----
    const wrong = await staffLogin(staff.email, 'WrongPass999');
    assert(wrong.status === 401 && !wrong.cookies[SESSION_COOKIE_NAME], 'wrong password 401, no cookie');
    ok('5. Wrong password → denied');
    const empty = await staffLogin(staff.email, '');
    assert(empty.status === 400 && !empty.cookies[SESSION_COOKIE_NAME], `empty password → 400 (got ${empty.status})`);
    ok('6. Empty password → denied');
    const short = await staffLogin(staff.email, 'abc');
    assert(short.status === 400, `short password → 400 (got ${short.status})`);
    ok('7. Short password → denied by validation');
    const inactiveRight = await staffLogin(inactive.email, PW);
    const inactiveWrong = await staffLogin(inactive.email, 'WrongPass999');
    assert(inactiveRight.status === 403 && !inactiveRight.cookies[SESSION_COOKIE_NAME], `inactive user denied (got ${inactiveRight.status})`);
    assert(inactiveWrong.status === 401 && JSON.stringify(inactiveWrong.body) === JSON.stringify(wrong.body), 'inactive status never revealed without the correct password');
    ok('8. Inactive user → denied (status only disclosed after correct password)');
    const unknown = await staffLogin(`nobody-${codeA.toLowerCase()}@verify.local`, PW);
    assert(unknown.status === 401 && JSON.stringify(unknown.body) === JSON.stringify(wrong.body), 'unknown user response identical to wrong password');
    ok('9. Unknown email → denied with the same generic response as a wrong password');
    const roleless = await staffLogin(noRole.email, PW);
    assert(roleless.status === 401, `user with no role assignment denied (got ${roleless.status})`);
    ok('9b. User with no role assignment → denied (no default STAFF role)');

    // ---- 10: cross-tenant ----
    const asA = await staffLogin(shared, 'TenantAPass1');
    const asB = await staffLogin(shared, 'TenantBPass1');
    assert(asA.status === 200 && jwtPayload(asA.cookies[SESSION_COOKIE_NAME].value).userId === sharedA.id, 'tenant-A password → tenant-A account');
    assert(asB.status === 200 && jwtPayload(asB.cookies[SESSION_COOKIE_NAME].value).coachingCenterId === centerB && jwtPayload(asB.cookies[SESSION_COOKIE_NAME].value).userId === sharedB.id, 'tenant-B password → tenant-B account');
    const twinLogin = await staffLogin(twin, 'SamePass123');
    assert(twinLogin.status === 401, `identical credentials in two tenants → denied, never an arbitrary pick (got ${twinLogin.status})`);
    ok('10. Cross-tenant: each password resolves only its own tenant account; ambiguous identity denied');

    // ---- 11-14: OTP ----
    const req = await post('/api/auth/otp/request', { phone: otpPhone });
    assert(req.status === 503 && req.body.error === 'OTP_UNAVAILABLE' && !('devCode' in req.body), `production OTP request issues nothing (got ${req.status})`);
    assert((await prisma.staffLoginOtp.count({ where: { userId: otpUser.id } })) === 0, 'no challenge created in production');
    for (const target of [otpPhone, '01700000000', '01799999999']) {
      const r = await otpLogin(target, '123456');
      assert(r.status === 401 && !r.cookies[SESSION_COOKIE_NAME], `123456 rejected for ${target}`);
    }
    ok('11. Hardcoded 123456 → denied (production issues no codes; no fixed code exists)');
    const c1 = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    assert(c1.issued, 'challenge issued server-side');
    const badCode = c1.code === '000000' ? '111111' : '000000';
    assert((await otpLogin(otpPhone, badCode)).status === 401, 'invalid OTP denied');
    const good = await otpLogin(otpPhone, c1.code);
    assert(good.status === 200 && jwtPayload(good.cookies[SESSION_COOKIE_NAME].value).userId === otpUser.id, 'correct OTP → exactly the bound user');
    ok('12. Invalid OTP → denied; correct OTP authenticates only the account it was issued to');
    const reuse = await otpLogin(otpPhone, c1.code);
    assert(reuse.status === 401, `reused OTP denied (got ${reuse.status})`);
    ok('14. Reused OTP → denied (single-use)');
    const c2 = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    assert(c2.issued, 'second challenge');
    await prisma.staffLoginOtp.update({ where: { id: c2.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert((await otpLogin(otpPhone, c2.code)).status === 401, 'expired OTP denied');
    ok('13. Expired OTP → denied');
    const c3 = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    assert(c3.issued, 'third challenge');
    const wrongC3 = c3.code === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) await otpLogin(otpPhone, wrongC3);
    assert((await otpLogin(otpPhone, c3.code)).status === 401, 'correct code refused after 5 wrong attempts');
    ok('13b. OTP attempts limited (5 wrong guesses lock the challenge)');
    const c4 = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    const c5 = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    assert(c4.issued && c5.issued, 'two more challenges');
    assert((await otpLogin(otpPhone, c4.code)).status === 401, 'superseded code invalid once a newer one is issued');
    const limited = await issueStaffLoginOtp(otpPhone, { requireDelivery: false });
    assert(!limited.issued && limited.reason === 'RATE_LIMITED', 'issue rate limit (5 per 15 min)');
    const stored = await prisma.staffLoginOtp.findMany({ where: { userId: otpUser.id } });
    assert(stored.every((row) => /^[0-9a-f]{64}$/.test(row.codeHash) && row.codeHash !== c1.code), 'only HMACs stored');
    ok('13c. Newer code supersedes older; issue rate-limited; codes stored only as HMAC');

    // ---- 15-16: reset tokens (portal — staff has no self-service reset) ----
    const reset = await provisionPortalAccount({ coachingCenterId: centerA, studentId: student.id, actorUserId: a.owner.id });
    const first = await post('/api/portal/auth/setup-password', { token: reset.setupToken, password: 'NewStudentPass1' });
    assert(first.status === 200 && !first.cookies[PORTAL_SESSION_COOKIE_NAME] && !first.cookies[SESSION_COOKIE_NAME], `reset token works once and does not sign anyone in (got ${first.status})`);
    ok('15. Reset token works once (no automatic sign-in)');
    const second = await post('/api/portal/auth/setup-password', { token: reset.setupToken, password: 'AnotherPass22' });
    assert(second.status >= 400, `reused reset token denied (got ${second.status})`);
    const race = await provisionPortalAccount({ coachingCenterId: centerA, studentId: student.id, actorUserId: a.owner.id });
    const racePw = [1, 2, 3].map((n) => `RacePass${n}xx`);
    const both = await Promise.all(racePw.map((password) => post('/api/portal/auth/setup-password', { token: race.setupToken, password })));
    assert(both.filter((r) => r.status === 200).length === 1, `concurrent reuse: exactly one succeeds (got ${both.map((r) => r.status)})`);
    const winningPw = racePw[both.findIndex((r) => r.status === 200)];
    const loginNew = await post('/api/portal/auth/login', { identifier: student.studentIdCode, password: 'AnotherPass22' });
    assert(loginNew.status === 401, 'password from the rejected reuse was not stored');
    ok('16. Reset token reuse denied (incl. concurrent double-submit)');

    // ---- 17-19: separation ----
    const studentCreds = { id: student.studentIdCode, pw: winningPw };
    const stuOnStaff = await staffLogin(studentCreds.id, studentCreds.pw);
    assert(stuOnStaff.status === 401 && !stuOnStaff.cookies[SESSION_COOKIE_NAME] && !stuOnStaff.cookies[PORTAL_SESSION_COOKIE_NAME], `student rejected by staff endpoint (got ${stuOnStaff.status})`);
    ok('18. Student cannot authenticate through the staff endpoint');
    const grdOnStaff = await staffLogin(guardian.phone, 'GuardianPass123');
    assert(grdOnStaff.status === 401 && !grdOnStaff.cookies[SESSION_COOKIE_NAME] && !grdOnStaff.cookies[PORTAL_SESSION_COOKIE_NAME], 'guardian rejected by staff endpoint');
    ok('19. Guardian cannot authenticate through the staff endpoint');
    const stuPortal = await post('/api/portal/auth/login', { identifier: studentCreds.id, password: studentCreds.pw });
    const pc = stuPortal.cookies[PORTAL_SESSION_COOKIE_NAME];
    assert(stuPortal.status === 200 && pc && !stuPortal.cookies[SESSION_COOKIE_NAME], 'portal login sets only the portal cookie');
    const pp = jwtPayload(pc.value);
    assert(pp.portalType === 'STUDENT' && pp.studentId === student.id && pp.coachingCenterId === centerA && !('role' in pp) && !('password' in pp), 'portal JWT identity, no staff role');
    assert(pc.attrs.includes('httponly') && pc.attrs.includes('secure'), 'portal cookie attributes');
    const grdTyped = await post('/api/portal/auth/login', { identifier: guardian.phone, password: 'GuardianPass123', portalType: 'STUDENT' });
    assert(grdTyped.status === 401, 'explicit portalType mismatch still rejected');
    await prisma.portalAccount.update({ where: { id: gp.account.id }, data: { status: 'DISABLED' } });
    const disabled = await post('/api/portal/auth/login', { identifier: guardian.phone, password: 'GuardianPass123' });
    assert(disabled.status === 403 && !disabled.cookies[PORTAL_SESSION_COOKIE_NAME], `disabled portal account denied (got ${disabled.status})`);
    ok('17. Portal auth remains separate (own endpoint, own cookie, no staff role); disabled portal account denied');

    // ---- error handling ----
    const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    const badBody = await bad.text();
    assert(bad.status === 400 && !/prisma|stack|at \w+ \(/i.test(badBody), `malformed body → 400 without internals (got ${bad.status})`);
    ok('Malformed request → safe 400, no internal error text');
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
