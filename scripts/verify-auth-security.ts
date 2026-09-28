import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import type { RoleCode } from '@prisma/client';

/**
 * Unified sign-in security verification over real HTTP against a running
 * PRODUCTION build (`npm run build && npm run start`):
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-auth-security.ts
 *
 * There is one sign-in endpoint (/api/auth/login, email + password) for
 * every account type. Builds two throwaway tenants and deletes them in
 * `finally`.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `AUTHVERIFY-${Date.now()}`;
const PW = 'CorrectHorse9';
const WRONG = 'WrongPass999';
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
  location: string | null;
  body: Record<string, unknown>;
  cookies: Record<string, { value: string; attrs: string }>;
}
async function request(method: 'GET' | 'POST', path: string, opts: { payload?: unknown; cookie?: string } = {}): Promise<Resp> {
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
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { _text: text.slice(0, 200) };
  }
  const cookies: Resp['cookies'] = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = { value: pair.slice(i + 1), attrs: attrs.join(';').toLowerCase() };
  }
  return { status: res.status, location: res.headers.get('location'), body, cookies };
}
const post = (path: string, payload: unknown, cookie?: string) => request('POST', path, { payload, cookie });
const get = (path: string, cookie?: string) => request('GET', path, { cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });

function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}
const sets = (r: Resp, name: string) => !!r.cookies[name]?.value;
const clears = (r: Resp, name: string) => !!r.cookies[name] && !r.cookies[name].value;
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name, centerCode: code, centerPhone: '01700000000', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`, ownerEmail: `${code.toLowerCase()}-owner@verify.local`, ownerPhone: `019${Date.now().toString().slice(-8)}`, ownerPassword: PW,
    branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC'], primaryColor: '#063B78', accentColor: '#FFD200',
  } as Parameters<typeof completeInitialSetup>[0]);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

async function main() {
  console.log('========================================================');
  console.log(`UNIFIED SIGN-IN SECURITY VERIFICATION — ${BASE}`);
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
    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: centerA } });
    const bRoles = await prisma.role.findMany({ where: { coachingCenterId: centerB } });
    const mkUser = (email: string, role: RoleCode | null, opts: { status?: 'ACTIVE' | 'INACTIVE'; cc?: 'A' | 'B'; password?: string } = {}) => {
      const inB = opts.cc === 'B';
      const roles = inB ? bRoles : aRoles;
      return prisma.user.create({
        data: {
          coachingCenterId: inB ? centerB! : centerA!,
          branchId: inB ? b.branch.id : a.branch.id,
          email,
          passwordHash: hashPassword(opts.password ?? PW),
          name: `${TAG} ${email}`,
          status: opts.status ?? 'ACTIVE',
          ...(role ? { roleAssignments: { create: { roleId: roles.find((r) => r.code === role)!.id } } } : {}),
        },
      });
    };
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const admin = await mkUser(e('admin'), 'ADMIN');
    const staff = await mkUser(e('staff'), 'STAFF');
    const teacher = await mkUser(e('teacher'), 'TEACHER');
    await prisma.teacher.create({ data: { coachingCenterId: centerA, branchId: a.branch.id, userId: teacher.id, teacherCode: `${TAG}-T1`, name: `${TAG} Teacher`, phone: '01700000001' } });
    const inactive = await mkUser(e('inactive'), 'STAFF', { status: 'INACTIVE' });
    const noRole = await mkUser(e('norole'), null);
    const lockUser = await mkUser(e('lockme'), 'STAFF');
    // Cross-tenant: same email in A and B with different passwords, plus an identical-credentials pair.
    const shared = e('shared');
    const sharedA = await mkUser(shared, 'ADMIN', { password: 'TenantAPass1' });
    const sharedB = await mkUser(shared, 'STAFF', { cc: 'B', password: 'TenantBPass1' });
    const twin = e('twin');
    await mkUser(twin, 'STAFF', { password: 'SamePass123' });
    await mkUser(twin, 'STAFF', { cc: 'B', password: 'SamePass123' });

    // Portal identities (tenant A): student + guardian with two children, one unrelated student.
    const mkStudent = (suffix: string, email: string | null, cc: 'A' | 'B' = 'A') =>
      prisma.student.create({
        data: { coachingCenterId: cc === 'A' ? centerA! : centerB!, branchId: cc === 'A' ? a.branch.id : b.branch.id, studentIdCode: `${TAG}-${suffix}`, name: `${TAG} Student ${suffix}`, email },
      });
    const student = await mkStudent('S1', e('student'));
    const sibling = await mkStudent('S2', null);
    const unrelated = await mkStudent('S3', null);
    const guardian = await prisma.guardian.create({ data: { coachingCenterId: centerA, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000002', email: e('guardian') } });
    await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true } });
    await prisma.studentGuardian.create({ data: { studentId: sibling.id, guardianId: guardian.id, relationship: 'Father', isPrimary: false } });
    const sp = await provisionPortalAccount({ coachingCenterId: centerA, studentId: student.id, actorUserId: a.owner.id });
    await completeSetupOrReset(sp.setupToken, 'StudentPass123');
    const gp = await provisionPortalAccount({ coachingCenterId: centerA, guardianId: guardian.id, actorUserId: a.owner.id });
    await completeSetupOrReset(gp.setupToken, 'GuardianPass123');
    // Staff email reused by a tenant-B student portal account: different password → each resolves
    // its own account; the identical-password variant is ambiguous and must be refused.
    const mixed = await mkStudent('MIX', staff.email, 'B');
    const mp = await provisionPortalAccount({ coachingCenterId: centerB, studentId: mixed.id, actorUserId: b.owner.id });
    await completeSetupOrReset(mp.setupToken, 'PortalSidePass1');
    const mixedStaff = await mkUser(e('mixedtwin'), 'STAFF');
    const mixedTwin = await mkStudent('MIXT', mixedStaff.email, 'B');
    const mtp = await provisionPortalAccount({ coachingCenterId: centerB, studentId: mixedTwin.id, actorUserId: b.owner.id });
    await completeSetupOrReset(mtp.setupToken, PW);
    ok('Fixtures: 2 tenants, OWNER/ADMIN/STAFF/TEACHER, inactive, role-less, cross-tenant + staff/portal email collisions, student, guardian (2 children) + unrelated student');

    // ---- 1-4, 17, 18: staff roles ----
    const staffCookies: Record<string, string> = {};
    for (const [label, email, role, id] of [
      ['OWNER', a.owner.email, 'OWNER', a.owner.id],
      ['ADMIN', admin.email, 'ADMIN', admin.id],
      ['STAFF', staff.email, 'STAFF', staff.id],
      ['TEACHER', teacher.email, 'TEACHER', teacher.id],
    ] as const) {
      const r = await login(email, PW);
      assert(r.status === 200 && r.body.success === true, `${label} login (got ${r.status} ${JSON.stringify(r.body)})`);
      assert(r.body.accountType === role && r.body.redirectTo === '/dashboard', `${label} redirect → /dashboard (got ${JSON.stringify(r.body)})`);
      assert(sets(r, SESSION_COOKIE_NAME) && !sets(r, PORTAL_SESSION_COOKIE_NAME) && clears(r, PORTAL_SESSION_COOKIE_NAME), `${label} gets only the staff session (portal session cleared)`);
      const c = r.cookies[SESSION_COOKIE_NAME];
      const p = jwtPayload(c.value);
      // Phase 10.4: the JWT itself only asserts {type, sub, sessionVersion} —
      // role/tenant/branch/email/name are never trusted from the token, so
      // there is nothing there for a tampered token to lie about. Identity
      // is instead confirmed via /api/auth/me, which is DB-sourced on every
      // request.
      assert(p.type === 'staff' && p.sub === id && typeof p.sessionVersion === 'number' && !('portalType' in p) && !('role' in p) && !('coachingCenterId' in p) && !('branchId' in p), `${label} JWT carries only {type,sub,sessionVersion} — no role/tenant claim to spoof`);
      assert(!('password' in p) && !('passwordHash' in p) && !('otp' in p) && !('email' in p) && !('name' in p), 'no PII/secrets in JWT');
      assert(c.attrs.includes('httponly') && c.attrs.includes('samesite=lax') && c.attrs.includes('path=/') && c.attrs.includes('max-age='), `${label} cookie attributes (${c.attrs})`);
      assert(c.attrs.includes('secure'), 'Secure cookie in production');
      const dash = await get('/dashboard', cookieOf(r, SESSION_COOKIE_NAME));
      assert(dash.status === 200, `${label} can open /dashboard (got ${dash.status})`);
      const me = await get('/api/auth/me', cookieOf(r, SESSION_COOKIE_NAME));
      const meUser = me.body.user as { userId?: string; role?: string; coachingCenterId?: string } | null;
      assert(meUser?.userId === id && meUser.role === role && meUser.coachingCenterId === centerA, `${label} identity/tenant/role resolved fresh from DB (got ${JSON.stringify(me.body.user)})`);
      staffCookies[label] = cookieOf(r, SESSION_COOKIE_NAME);
      ok(`${[1, 2, 3, 4][['OWNER', 'ADMIN', 'STAFF', 'TEACHER'].indexOf(label)]}. ${label} email/password → staff session, correct identity, redirect /dashboard`);
    }
    const teacherComm = await get('/api/communication/logs', staffCookies.TEACHER);
    assert(teacherComm.status === 403 || teacherComm.status === 404, `TEACHER still restricted by role guards (got ${teacherComm.status})`);

    // ---- 5, 6: portal ----
    const stu = await login(student.email!, 'StudentPass123');
    assert(stu.status === 200 && stu.body.accountType === 'STUDENT' && stu.body.redirectTo === '/portal/student', `student login (got ${stu.status} ${JSON.stringify(stu.body)})`);
    assert(sets(stu, PORTAL_SESSION_COOKIE_NAME) && !sets(stu, SESSION_COOKIE_NAME) && clears(stu, SESSION_COOKIE_NAME), 'student gets only the portal session (staff session cleared)');
    const sjwt = jwtPayload(stu.cookies[PORTAL_SESSION_COOKIE_NAME].value);
    // Phase 10.4: same minimal-token design on the portal side — the JWT is
    // only {type:'portal', sub: portalAccountId, sessionVersion}; portalType/
    // studentId/guardianId/coachingCenterId are re-derived from the DB on
    // every request, never trusted from the token.
    assert(sjwt.type === 'portal' && sjwt.sub === sp.account.id && typeof sjwt.sessionVersion === 'number' && !('portalType' in sjwt) && !('studentId' in sjwt) && !('coachingCenterId' in sjwt) && !('role' in sjwt), 'student portal JWT carries only {type,sub,sessionVersion} — no identity claim to spoof');
    assert(stu.cookies[PORTAL_SESSION_COOKIE_NAME].attrs.includes('httponly') && stu.cookies[PORTAL_SESSION_COOKIE_NAME].attrs.includes('secure'), 'portal cookie attributes');
    const stuCookie = cookieOf(stu, PORTAL_SESSION_COOKIE_NAME);
    const stuMe = await get('/api/portal/auth/me', stuCookie);
    const stuMeUser = stuMe.body.user as { portalType?: string; studentId?: string } | null;
    assert(stuMeUser?.portalType === 'STUDENT' && stuMeUser.studentId === student.id, `student identity resolved fresh from DB (got ${JSON.stringify(stuMe.body.user)})`);
    ok('5. STUDENT email/password → portal session (studentId from account), redirect /portal/student');
    const grd = await login(guardian.email!, 'GuardianPass123');
    assert(grd.status === 200 && grd.body.accountType === 'GUARDIAN' && grd.body.redirectTo === '/portal/guardian', `guardian login (got ${grd.status} ${JSON.stringify(grd.body)})`);
    const gjwt = jwtPayload(grd.cookies[PORTAL_SESSION_COOKIE_NAME].value);
    assert(gjwt.type === 'portal' && gjwt.sub === gp.account.id && typeof gjwt.sessionVersion === 'number' && !('portalType' in gjwt) && !('guardianId' in gjwt) && !('studentId' in gjwt), 'guardian portal JWT carries only {type,sub,sessionVersion}');
    const grdCookie = cookieOf(grd, PORTAL_SESSION_COOKIE_NAME);
    const grdMe = await get('/api/portal/auth/me', grdCookie);
    const grdMeUser = grdMe.body.user as { portalType?: string; guardianId?: string; studentId?: string | null } | null;
    assert(grdMeUser?.portalType === 'GUARDIAN' && grdMeUser.guardianId === guardian.id && !grdMeUser.studentId, 'guardian identity (no child chosen at login), resolved fresh from DB');
    const kids = await get('/api/portal/guardian/children', grdCookie);
    const kidIds = ((kids.body.children as { student: { id: string } }[] | undefined) ?? []).map((k) => k.student.id).sort();
    assert(kids.status === 200 && JSON.stringify(kidIds) === JSON.stringify([student.id, sibling.id].sort()), `guardian sees both linked children after login (got ${kids.status} ${JSON.stringify(kidIds)})`);
    ok('6. GUARDIAN email/password → portal session, redirect /portal/guardian, both linked children available after login');

    // ---- 7-10 ----
    const wrong = await login(staff.email, WRONG);
    assert(wrong.status === 401 && !sets(wrong, SESSION_COOKIE_NAME) && !sets(wrong, PORTAL_SESSION_COOKIE_NAME), 'wrong password 401, no session');
    const wrongPortal = await login(student.email!, WRONG);
    assert(wrongPortal.status === 401 && JSON.stringify(wrongPortal.body) === JSON.stringify(wrong.body), 'portal wrong password identical response');
    ok('7. Wrong password (staff and portal) → identical generic 401, no session');
    const unknown = await login(`nobody-${codeA.toLowerCase()}@verify.local`, PW);
    assert(unknown.status === 401 && JSON.stringify(unknown.body) === JSON.stringify(wrong.body) && !sets(unknown, SESSION_COOKIE_NAME), 'unknown email identical to wrong password');
    ok('8. Unknown email → same generic 401 as a wrong password');
    const inactiveRight = await login(inactive.email, PW);
    const inactiveWrong = await login(inactive.email, WRONG);
    assert(inactiveRight.status === 403 && !sets(inactiveRight, SESSION_COOKIE_NAME), `inactive staff denied (got ${inactiveRight.status})`);
    assert(inactiveWrong.status === 401 && JSON.stringify(inactiveWrong.body) === JSON.stringify(wrong.body), 'inactive status never revealed without the correct password');
    const roleless = await login(noRole.email, PW);
    assert(roleless.status === 401 && !sets(roleless, SESSION_COOKIE_NAME), `role-less user denied (got ${roleless.status})`);
    ok('9. Inactive staff → denied (status disclosed only after correct password); role-less user → denied');
    await prisma.portalAccount.update({ where: { id: gp.account.id }, data: { status: 'DISABLED' } });
    const disabled = await login(guardian.email!, 'GuardianPass123');
    const disabledWrong = await login(guardian.email!, WRONG);
    assert(disabled.status === 403 && !sets(disabled, PORTAL_SESSION_COOKIE_NAME), `disabled portal account denied (got ${disabled.status})`);
    assert(disabledWrong.status === 401 && JSON.stringify(disabledWrong.body) === JSON.stringify(wrong.body), 'disabled status never revealed without the password');
    await prisma.portalAccount.update({ where: { id: gp.account.id }, data: { status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null } });
    ok('10. Disabled portal account → denied');

    // ---- 11, 12: lockout ----
    for (let i = 0; i < 5; i++) await login(lockUser.email, WRONG);
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: lockUser.id } });
    assert(locked.failedLoginAttempts === 5 && locked.lockedUntil && locked.lockedUntil.getTime() > Date.now() + 14 * 60 * 1000, 'staff locked ~15 minutes after 5 failures');
    const whileLocked = await login(lockUser.email, PW);
    assert(whileLocked.status === 401 && JSON.stringify(whileLocked.body) === JSON.stringify(wrong.body) && !sets(whileLocked, SESSION_COOKIE_NAME), `correct password refused while locked, generic response (got ${whileLocked.status})`);
    for (let i = 0; i < 5; i++) await login(student.email!, WRONG);
    const stuLocked = await login(student.email!, 'StudentPass123');
    assert(stuLocked.status === 401 && !sets(stuLocked, PORTAL_SESSION_COOKIE_NAME), 'portal account locked after 5 failures');
    ok('11. Lockout: 5 failures lock staff and portal accounts for 15 minutes; correct password refused meanwhile');
    await prisma.user.update({ where: { id: lockUser.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await prisma.portalAccount.update({ where: { id: sp.account.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const afterExpiry = await login(lockUser.email, PW);
    assert(afterExpiry.status === 200 && sets(afterExpiry, SESSION_COOKIE_NAME), `login works once lock expired (got ${afterExpiry.status})`);
    const reset = await prisma.user.findUniqueOrThrow({ where: { id: lockUser.id } });
    assert(reset.failedLoginAttempts === 0 && reset.lockedUntil === null, 'counter reset on success');
    const stuAfter = await login(student.email!, 'StudentPass123');
    assert(stuAfter.status === 200, 'portal login works once lock expired');
    await prisma.user.update({ where: { id: lockUser.id }, data: { failedLoginAttempts: 4, lockedUntil: new Date(Date.now() - 1000) } });
    await login(lockUser.email, WRONG);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: lockUser.id } });
    assert(fresh.failedLoginAttempts === 1 && fresh.lockedUntil === null, 'an expired lock starts a fresh count (no instant re-lock)');
    ok('12. Lockout expiration: sign-in allowed again, counters reset');

    // ---- 13, 14: IDOR ----
    const own = await get(`/api/portal/student/profile?studentId=${unrelated.id}`, stuCookie);
    assert(own.status === 200 && (own.body.student as { id: string }).id === student.id, `student profile ignores ?studentId= (got ${own.status})`);
    const stuRes = await get(`/api/portal/student/results?studentId=${unrelated.id}`, stuCookie);
    assert(stuRes.status === 200 && !JSON.stringify(stuRes.body).includes(unrelated.id), 'student results never expose another student');
    const stuAsGuardian = await get(`/api/portal/guardian/children/${unrelated.id}`, stuCookie);
    assert(stuAsGuardian.status === 403, `student cannot use guardian routes (got ${stuAsGuardian.status})`);
    ok('13. Student IDOR: ?studentId= ignored; studentId always from the session');
    const linked = await get(`/api/portal/guardian/children/${sibling.id}`, grdCookie);
    assert(linked.status === 200, `guardian reads a linked child (got ${linked.status})`);
    for (const path of ['', '/results', '/attendance', '/fees']) {
      const r = await get(`/api/portal/guardian/children/${unrelated.id}${path}`, grdCookie);
      assert(r.status === 403 && !JSON.stringify(r.body).includes(unrelated.name), `guardian blocked from unrelated child ${path || 'profile'} (got ${r.status})`);
    }
    ok('14. Guardian unrelated-child access → 403 on profile/results/attendance/fees');

    // ---- 15: cross-tenant ----
    const asA = await login(shared, 'TenantAPass1');
    const asB = await login(shared, 'TenantBPass1');
    // Phase 10.4: the JWT's `sub` is the userId regardless of tenant (tenant
    // is re-derived from the DB by `sub`, never carried in the token), so
    // `sub` alone confirms which account the password resolved to; the
    // account's real tenant is confirmed via /api/auth/me below.
    assert(asA.status === 200 && jwtPayload(asA.cookies[SESSION_COOKIE_NAME].value).sub === sharedA.id, 'tenant-A password → tenant-A account');
    const bJwt = jwtPayload(asB.cookies[SESSION_COOKIE_NAME].value);
    assert(asB.status === 200 && bJwt.sub === sharedB.id, 'tenant-B password → tenant-B account');
    const bMe = await get('/api/auth/me', cookieOf(asB, SESSION_COOKIE_NAME));
    assert((bMe.body.user as { coachingCenterId?: string } | null)?.coachingCenterId === centerB, `tenant-B account resolves to tenant B (got ${JSON.stringify(bMe.body.user)})`);
    const twinLogin = await login(twin, 'SamePass123');
    assert(twinLogin.status === 401 && JSON.stringify(twinLogin.body) === JSON.stringify(wrong.body) && !JSON.stringify(twinLogin.body).includes(TAG), 'identical credentials in two tenants → generic denial, no tenant names');
    const staffSide = await login(staff.email, PW);
    const portalSide = await login(staff.email, 'PortalSidePass1');
    assert(staffSide.status === 200 && staffSide.body.accountType === 'STAFF', 'shared email + staff password → staff account');
    assert(portalSide.status === 200 && portalSide.body.accountType === 'STUDENT' && jwtPayload(portalSide.cookies[PORTAL_SESSION_COOKIE_NAME].value).sub === mp.account.id, 'shared email + portal password → that portal account');
    const mixedAmbiguous = await login(mixedStaff.email, PW);
    assert(mixedAmbiguous.status === 401 && !sets(mixedAmbiguous, SESSION_COOKIE_NAME) && !sets(mixedAmbiguous, PORTAL_SESSION_COOKIE_NAME), 'same email + same password on staff and portal accounts → denied');
    const crossRead = await get(`/api/students/${student.id}`, cookieOf(asB, SESSION_COOKIE_NAME));
    assert(crossRead.status === 404, `tenant-B staff cannot read tenant-A student (got ${crossRead.status})`);
    ok('15. Cross-tenant: password selects only its own account; ambiguous (tenant or account-type) → denied; tenant data isolated');

    // ---- session separation ----
    const portalOnStaff = await get('/api/students', stuCookie);
    assert(portalOnStaff.status === 401, `portal session rejected by staff API (got ${portalOnStaff.status})`);
    const staffOnPortal = await get('/api/portal/student/profile', staffCookies.ADMIN);
    assert(staffOnPortal.status === 401, `staff session rejected by portal API (got ${staffOnPortal.status})`);
    ok('Staff and portal sessions stay separate: neither is accepted by the other side');

    // ---- 16: logout ----
    const out = await post('/api/auth/logout', {}, staffCookies.OWNER);
    assert(out.status === 200 && clears(out, SESSION_COOKIE_NAME), 'staff logout clears the session cookie');
    const noCookie = await get('/api/auth/me');
    assert(noCookie.body.authenticated === false, `no session after logout (got ${JSON.stringify(noCookie.body)})`);
    const pout = await post('/api/portal/auth/logout', {}, stuCookie);
    assert(pout.status === 200 && clears(pout, PORTAL_SESSION_COOKIE_NAME), 'portal logout clears the portal cookie');
    const dashAfter = await get('/dashboard');
    assert(dashAfter.status === 307 && dashAfter.location?.endsWith('/login'), `/dashboard without session → /login (got ${dashAfter.status} ${dashAfter.location})`);
    ok('16. Logout (staff and portal) clears the session; protected pages send the user to /login');

    // ---- 17, 18 summary ----
    const me = await get('/api/auth/me', staffCookies.TEACHER);
    const meUser = me.body.user as { userId?: string; role?: string } | null;
    assert(me.status === 200 && me.body.authenticated === true && meUser?.userId === teacher.id && meUser.role === 'TEACHER', `session identity served back by /api/auth/me (got ${me.status})`);
    const pme = await get('/api/portal/auth/me', grdCookie);
    const pmeUser = pme.body.user as { guardianId?: string; portalType?: string } | null;
    assert(pme.status === 200 && pmeUser?.guardianId === guardian.id && pmeUser.portalType === 'GUARDIAN', `portal identity served back by /api/portal/auth/me (got ${pme.status})`);
    ok('17. Session identity: each session resolves to exactly the authenticated account');
    ok('18. Redirects: OWNER/ADMIN/STAFF/TEACHER → /dashboard, STUDENT → /portal/student, GUARDIAN → /portal/guardian (asserted above)');

    // ---- 19: no OTP ----
    const otpReq = await post('/api/auth/otp/request', { phone: '01700000000' });
    assert(otpReq.status === 404 || otpReq.status === 405, `OTP request endpoint removed (got ${otpReq.status})`);
    for (const payload of [
      { identifier: staff.email, otp: '123456', mode: 'otp' },
      { email: staff.email, otp: '123456' },
      { email: staff.email, password: '123456' },
      { identifier: '01700000000', password: PW },
    ]) {
      const r = await post('/api/auth/login', payload);
      assert((r.status === 400 || r.status === 401) && !sets(r, SESSION_COOKIE_NAME) && !sets(r, PORTAL_SESSION_COOKIE_NAME), `no OTP/phone path (${JSON.stringify(payload)} → ${r.status})`);
    }
    const table = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.staff_login_otps')::text AS t`;
    assert(table[0]?.t === null, 'staff_login_otps table dropped');
    const legacyPortalApi = await post('/api/portal/auth/login', { identifier: student.email, password: 'StudentPass123' });
    assert(legacyPortalApi.status === 404 || legacyPortalApi.status === 405, `separate portal login API removed (got ${legacyPortalApi.status})`);
    const legacyPage = await get('/portal/login');
    assert(legacyPage.status === 307 && legacyPage.location?.endsWith('/login'), `/portal/login redirects to /login (got ${legacyPage.status} ${legacyPage.location})`);
    const legacyForgot = await get('/portal/forgot-password');
    assert(legacyForgot.status === 307 && legacyForgot.location?.endsWith('/forgot-password'), `/portal/forgot-password redirects (got ${legacyForgot.status})`);
    for (const path of ['/admin/login', '/teacher/login', '/student/login', '/guardian/login']) {
      assert((await get(path)).status === 404, `${path} does not exist`);
    }
    ok('19. No OTP: endpoint gone, 123456/phone rejected, table dropped; one login route (legacy /portal/login → /login)');

    // ---- 20, 21: source scans ----
    const root = join(__dirname, '..');
    const files = ['app', 'lib', 'components'].flatMap((d) => sourceFiles(join(root, d)));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const rel = f.slice(root.length + 1);
      if (/StaffLoginOtp|staffLoginOtp|AUTH_DEV_OTP_ECHO|OTP_UNAVAILABLE|otp\/request|one-time-code|['"`]123456['"`]/.test(src)) offenders.push(`${rel}: OTP artefact`);
      if (/demo (password|credential)/i.test(src)) offenders.push(`${rel}: demo credentials`);
      if (/(app[\\/]api|lib[\\/](auth|services))/.test(rel) && /password(Hash)?\s*[:=]\s*['"][^'"]+['"]/.test(src)) offenders.push(`${rel}: hardcoded password`);
    }
    const authSrc = readFileSync(join(root, 'lib/services/unified-auth.service.ts'), 'utf8');
    if (/findFirst/.test(authSrc)) offenders.push('unified-auth.service.ts uses findFirst');
    assert(offenders.length === 0, `source scan: ${offenders.join('; ')}`);
    ok('20. No hardcoded credentials / demo passwords / fixed codes in app, lib, components');
    const blank = await post('/api/auth/login', {});
    const garbage = await login(`x${Date.now()}@nowhere.invalid`, 'anything-at-all');
    assert(blank.status === 400 && garbage.status === 401 && !sets(garbage, SESSION_COOKIE_NAME) && !sets(garbage, PORTAL_SESSION_COOKIE_NAME), 'no fallback account');
    ok('21. No first-user fallback: empty/unknown credentials never produce a session; lookup considers every candidate');

    // ---- forgot password ----
    const fps = await Promise.all([staff.email, student.email!, `nobody-${codeA.toLowerCase()}@verify.local`].map((email) => post('/api/auth/forgot-password', { email })));
    assert(fps.every((r) => r.status === 200 && JSON.stringify(r.body) === JSON.stringify(fps[0].body)), 'forgot-password response identical for staff/portal/unknown');
    assert(String(fps[0].body.message).startsWith('If an account exists'), 'generic message');
    const tokens = await prisma.portalAuthToken.count({ where: { portalAccountId: sp.account.id, purpose: 'RESET' } });
    assert(tokens === 1, `portal reset token issued (got ${tokens})`);
    ok('Forgot password: one generic response for every email; portal reset token issued via existing mechanism');

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
      prisma.guardian.count({ where: { name: { startsWith: TAG } } }),
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
