import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import { PLATFORM_SESSION_COOKIE_NAME } from '../lib/auth/platform-session';
import { createPlatformAdmin } from '../lib/services/platform-auth.service';
import { scrubSecrets } from '../lib/services/platform-audit.service';
import { createQuotaCheckedLog, claimRetryWithQuota } from '../lib/services/message-quota.service';
import { checkBranchLimit } from '../lib/services/subscription.service';
import { getTenantUsage } from '../lib/services/usage.service';
import { createUser } from '../lib/services/user.service';
import { provisionPortalAccount } from '../lib/services/portal-auth.service';
import { dhakaMonthBounds, usageLevel } from '../lib/subscription';

/**
 * Phase 11.4 — SaaS Super Admin, Subscription & Tenant Limits verification.
 * Live server (AUTH_BASE_URL, default localhost:3000) + real DB, throwaway
 * tenants / plans / platform admin that are removed afterwards.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P114-${Date.now()}`;
const PW = 'ValidPass123!';
const PLATFORM_PW = 'PlatformPass-123456';
let passed = 0;

const ok = (label: string) => {
  passed += 1;
  console.log(`✔ [${passed}] ${label}`);
};
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
const eq = (a: unknown, b: unknown, label: string) => assert(Number(a) === Number(b), `${label} — expected ${b}, got ${a}`);

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
const post = (p: string, payload: unknown, cookie?: string) => request('POST', p, { payload, cookie });
const put = (p: string, payload: unknown, cookie?: string) => request('PUT', p, { payload, cookie });
const del = (p: string, cookie?: string) => request('DELETE', p, { cookie });
const get = (p: string, cookie?: string) => request('GET', p, { cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name, centerCode: code, centerPhone: '01700000000', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`, ownerEmail: `${code.toLowerCase()}-owner@verify.local`, ownerPhone: `019${Date.now().toString().slice(-8)}`,
    ownerPassword: PW, branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01',
    sessionEndDate: '2026-12-31', selectedPrograms: ['SSC'], primaryColor: '#063B78', accentColor: '#FFD200',
  } as any);
}

const codeOf = (r: Resp) => r.body.error as string;

async function main() {
  console.log('========================================================');
  console.log(`PHASE 11.4 SUPER ADMIN & SUBSCRIPTION VERIFICATION — ${BASE}`);
  console.log('========================================================');

  // ---------- pure logic ----------
  const sep30 = dhakaMonthBounds(new Date('2026-09-30T17:59:59Z'));
  const oct1 = dhakaMonthBounds(new Date('2026-09-30T18:00:01Z'));
  assert(sep30.label === '2026-09' && oct1.label === '2026-10', `Dhaka month boundary: ${sep30.label} / ${oct1.label}`);
  assert(usageLevel(79, 100) === 'normal' && usageLevel(80, 100) === 'near' && usageLevel(90, 100) === 'critical' && usageLevel(100, 100) === 'reached' && usageLevel(5, null) === 'unlimited', 'usage thresholds');
  const scrubbed = JSON.stringify(scrubSecrets({ a: 1, ownerPassword: 'x', nested: { passwordHash: 'h', token: 't', ok: true } }));
  assert(!/ownerPassword|passwordHash|token/.test(scrubbed) && scrubbed.includes('"ok":true'), 'audit scrubber drops credential-like keys');
  ok('P1. Pure rules: Dhaka month boundary, 80/90/100 % levels, audit secret scrubber');

  const created = { centers: [] as string[], plans: [] as string[], admins: [] as string[] };
  try {
    // ---------- setup ----------
    const platformEmail = `${TAG.toLowerCase()}@platform.local`;
    const pAdmin = await createPlatformAdmin({ email: platformEmail, name: 'Test Super Admin', password: PLATFORM_PW });
    created.admins.push(pAdmin.id);

    const codeA = `T114A${Date.now().toString().slice(-6)}`;
    const codeB = `T114B${Date.now().toString().slice(-6)}`;
    const a = await tenant(codeA, `${TAG} A`);
    const b = await tenant(codeB, `${TAG} B`);
    created.centers.push(a.center.id, b.center.id);
    const ccA = a.center.id;
    const ccB = b.center.id;
    const branchA = a.branch;

    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: ccA } });
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER') =>
      prisma.user.create({
        data: { coachingCenterId: ccA, branchId: branchA.id, email, passwordHash: hashPassword(PW), name: `${TAG} ${email}`, roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId: branchA.id } } },
      });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const adminU = await mkUser(e('admin'), 'ADMIN');
    const staffU = await mkUser(e('staff'), 'STAFF');
    const teacherU = await mkUser(e('teacher'), 'TEACHER');

    const session = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: ccA } });
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccA, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccA, academicProgramId: program.id } });
    const progB = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccB } });
    const classB = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccB, academicProgramId: progB.id } });
    const sessionB = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: ccB } });

    // A student + portal account in tenant B (for the "student portal" check). B stays a LEGACY tenant.
    const studentB = await prisma.student.create({ data: { coachingCenterId: ccB, branchId: b.branch.id, studentIdCode: `SB-${Date.now()}`, name: 'Portal Student', status: 'ACTIVE' } });
    await prisma.portalAccount.create({ data: { coachingCenterId: ccB, portalType: 'STUDENT', studentId: studentB.id, email: `portal-${codeB.toLowerCase()}@verify.local`, passwordHash: hashPassword(PW) } });

    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const adminCookie = cookieOf(await login(adminU.email, PW), SESSION_COOKIE_NAME);
    const staffCookie = cookieOf(await login(staffU.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacherU.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const portalLogin = await login(`portal-${codeB.toLowerCase()}@verify.local`, PW);
    const portalCookie = cookieOf(portalLogin, PORTAL_SESSION_COOKIE_NAME);

    const badPlatform = await post('/api/super-admin/auth/login', { email: platformEmail, password: 'wrong-password-123' });
    assert(badPlatform.status === 401, `wrong platform password → 401, got ${badPlatform.status}`);
    const tenantCredsOnPlatform = await post('/api/super-admin/auth/login', { email: a.owner.email, password: PW });
    assert(tenantCredsOnPlatform.status === 401, `tenant credentials must not work on platform login, got ${tenantCredsOnPlatform.status}`);
    const pl = await post('/api/super-admin/auth/login', { email: platformEmail, password: PLATFORM_PW });
    assert(pl.status === 200 && pl.cookies[PLATFORM_SESSION_COOKIE_NAME], `platform login failed ${pl.status} ${JSON.stringify(pl.body)}`);
    const saCookie = cookieOf(pl, PLATFORM_SESSION_COOKIE_NAME);
    const platformTokenValue = pl.cookies[PLATFORM_SESSION_COOKIE_NAME].value;
    assert(!(SESSION_COOKIE_NAME in pl.cookies) && !(PORTAL_SESSION_COOKIE_NAME in pl.cookies), 'platform login sets only the platform cookie');
    ok('1. Super Admin signs in on the separate platform login (own cookie); wrong password and tenant credentials are rejected');

    // ---------- AUTHORIZATION ----------
    const dash = await get('/api/super-admin/dashboard', saCookie);
    assert(dash.status === 200 && dash.body.dashboard.tenants.total >= 2, `super admin dashboard: ${dash.status}`);
    ok('2. Super Admin can access the platform dashboard (real tenant counts)');

    for (const [label, cookie] of [['OWNER', ownerCookie], ['ADMIN', adminCookie], ['STAFF', staffCookie], ['TEACHER', teacherCookie], ['student portal', portalCookie]] as const) {
      for (const [m, p, body] of [['GET', '/api/super-admin/dashboard', undefined], ['GET', '/api/super-admin/plans', undefined], ['GET', '/api/super-admin/coaching-centers', undefined], ['PUT', `/api/super-admin/coaching-centers/${ccA}/status`, { status: 'SUSPENDED' }]] as const) {
        const r = await request(m, p, { cookie, payload: body });
        assert(r.status === 401 || r.status === 403, `${label} must not reach ${m} ${p}, got ${r.status}`);
      }
    }
    const stillActive = await prisma.coachingCenter.findUniqueOrThrow({ where: { id: ccA } });
    assert(stillActive.status === 'ACTIVE', 'tenant users could not suspend a tenant');
    ok('3-6. OWNER, ADMIN, STAFF, TEACHER and student-portal sessions are all refused by every Super Admin API');

    // Cross-audience token confusion: a staff token in the platform cookie, and a platform token in the staff cookie.
    const staffTokenAsPlatform = await get('/api/super-admin/dashboard', `${PLATFORM_SESSION_COOKIE_NAME}=${ownerCookie.split('=')[1]}`);
    const platformTokenAsStaff = await get('/api/students', `${SESSION_COOKIE_NAME}=${platformTokenValue}`);
    assert(staffTokenAsPlatform.status === 401, `staff token in platform cookie must fail, got ${staffTokenAsPlatform.status}`);
    assert(platformTokenAsStaff.status === 401, `platform token in staff cookie must fail, got ${platformTokenAsStaff.status}`);
    ok('7. Platform and tenant sessions use independent signing keys: neither token verifies as the other');

    // ---------- PLANS ----------
    const planBody = (code: string, over: Record<string, unknown> = {}) => ({
      name: `Plan ${code}`, banglaName: 'প্ল্যান', code, priceMonthly: 5000, priceYearly: 50000, trialDays: 14,
      limits: { maxStudents: 2, maxTeachers: 1, maxStaffUsers: 3, maxPortalAccounts: 1, maxBranches: 1, maxSms: 3, maxWhatsapp: 1, maxEmail: 1, maxStorageMb: 100 },
      features: { ATTENDANCE: true, FEES: true, HOMEWORK: false, EXAMS: true, STUDY_MATERIALS: true, COMMUNICATION: true, ADVANCED_REPORTS: false, ONLINE_PAYMENT: false },
      ...over,
    });
    const pcode = `${TAG}-P1`.slice(0, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    const createPlan = await post('/api/super-admin/plans', planBody(pcode), saCookie);
    assert(createPlan.status === 201, `create plan: ${createPlan.status} ${JSON.stringify(createPlan.body)}`);
    const plan = createPlan.body.plan;
    created.plans.push(plan.id);
    eq(plan.version, 1, 'new plan version');
    const dupPlan = await post('/api/super-admin/plans', planBody(pcode), saCookie);
    assert(dupPlan.status === 409, `duplicate code → 409, got ${dupPlan.status}`);
    const upd = await put(`/api/super-admin/plans/${plan.id}`, { name: 'Plan Renamed' }, saCookie);
    assert(upd.status === 200 && upd.body.plan.version === 1, 'rename alone does not bump the version');
    ok('8. Super Admin creates a plan (limits, features, price); duplicate code refused; cosmetic edit keeps version');

    const p2 = await post('/api/super-admin/plans', planBody(`${pcode}-2`.slice(0, 30), { limits: { maxStudents: 10 } }), saCookie);
    created.plans.push(p2.body.plan.id);

    // ---------- SUBSCRIPTION lifecycle on tenant A ----------
    const noSubA = await get('/api/settings/subscription', ownerCookie);
    assert(noSubA.body.subscription.status === 'LEGACY' && noSubA.body.limits.maxStudents === null, 'tenant with no plan is legacy/unrestricted');

    const assign = await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'ACTIVE', endDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, saCookie);
    assert(assign.status === 200, `assign subscription: ${assign.status} ${JSON.stringify(assign.body)}`);
    const mySub = await get('/api/settings/subscription', ownerCookie);
    eq(mySub.body.limits.maxStudents, 2, 'tenant sees its limit');
    assert(!JSON.stringify(mySub.body).includes(plan.id) && !JSON.stringify(mySub.body).includes(ccA), 'tenant-side view exposes no internal ids');
    const teacherSub = await get('/api/settings/subscription', teacherCookie);
    const adminSub = await get('/api/settings/subscription', adminCookie);
    assert(teacherSub.status === 403 && adminSub.status === 403, 'subscription details are OWNER-only');
    ok('9. Subscription assigned; tenant OWNER sees only their own sanitized plan/usage/features (no ids); others denied');

    // plan versioning: edit the plan's limits → tenant keeps the sold terms until re-synced
    const bump = await put(`/api/super-admin/plans/${plan.id}`, { limits: { maxStudents: 5 } }, saCookie);
    eq(bump.body.plan.version, 2, 'limit edit bumps plan version');
    eq((await get('/api/settings/subscription', ownerCookie)).body.limits.maxStudents, 2, 'existing tenant keeps sold limit after plan edit');
    const detailOutdated = await get(`/api/super-admin/coaching-centers/${ccA}`, saCookie);
    assert(detailOutdated.body.subscription.planVersion === 1 && detailOutdated.body.subscription.currentPlanVersion === 2, 'detail flags an outdated plan version');
    await put(`/api/super-admin/plans/${plan.id}`, { limits: { maxStudents: 2 } }, saCookie); // back to 2 (version 3) for the limit tests
    ok('10. Plan versioning: editing a plan does not silently change existing tenants; outdated version is visible');

    // ---------- STUDENT LIMIT (+ concurrency) ----------
    let phoneSeq = 0;
    const nextPhone = () => `0181${String(3000000 + ++phoneSeq + (Date.now() % 100000))}`;
    const admission = () => ({
      name: `Stu ${Math.random().toString(36).slice(2, 7)}`, gender: 'MALE', dob: '2008-05-15', guardianName: 'Guardian', guardianRelationship: 'FATHER',
      guardianPhone: nextPhone(), preferredChannel: 'SMS', academicSessionId: session.id, branchId: branchA.id, academicProgramId: program.id, academicClassId: klass.id,
    });
    const s1 = await post('/api/students', admission(), ownerCookie);
    const s2 = await post('/api/students', admission(), ownerCookie);
    assert(s1.status === 201 && s2.status === 201, `first two admissions within limit: ${s1.status}/${s2.status} ${JSON.stringify(s1.body)}`);
    const s3 = await post('/api/students', admission(), ownerCookie);
    assert(s3.status === 403 && codeOf(s3) === 'STUDENT_LIMIT_REACHED' && /up to 2 students/.test(s3.body.message), `student #3 must be refused: ${s3.status} ${JSON.stringify(s3.body)}`);
    eq(await prisma.student.count({ where: { coachingCenterId: ccA } }), 2, 'nothing was created or removed by the refusal');
    ok('11. Student limit enforced server-side with a clear message (limit 2: third admission refused, nothing deleted)');

    // concurrency: raise to 3 (one free slot), fire 5 at once → exactly one wins
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, overrides: { limits: { maxStudents: 3 } } }, saCookie);
    const burst = await Promise.all(Array.from({ length: 5 }, () => post('/api/students', admission(), ownerCookie)));
    const wins = burst.filter((r) => r.status === 201).length;
    const refused = burst.filter((r) => r.status === 403 && codeOf(r) === 'STUDENT_LIMIT_REACHED').length;
    assert(wins === 1 && refused === 4, `concurrent admissions with one free slot: ${wins} succeeded, ${refused} refused, statuses ${burst.map((r) => r.status)}`);
    eq(await prisma.student.count({ where: { coachingCenterId: ccA, status: 'ACTIVE' } }), 3, 'never exceeds the limit');
    ok('12. Concurrent student creation cannot exceed the limit (5 simultaneous requests, 1 free slot → exactly 1 created)');

    // ---------- OVERRIDE precedence ----------
    const detailOv = await get(`/api/super-admin/coaching-centers/${ccA}`, saCookie);
    eq(detailOv.body.limits.maxStudents, 3, 'tenant override wins over plan snapshot');
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, overrides: null }, saCookie);
    eq((await get(`/api/super-admin/coaching-centers/${ccA}`, saCookie)).body.limits.maxStudents, 2, 'clearing the override falls back to the plan');
    ok('13. Limit precedence: tenant override → plan snapshot → unlimited (override set and cleared)');

    // ---------- TEACHER limit (+ concurrency) ----------
    const teacherBody = () => ({ name: `Teacher ${Math.random().toString(36).slice(2, 6)}`, phone: nextPhone(), status: 'ACTIVE' });
    const t1 = await post('/api/teachers', teacherBody(), ownerCookie);
    assert(t1.status === 201, `first teacher within limit: ${t1.status} ${JSON.stringify(t1.body)}`);
    const t2 = await post('/api/teachers', teacherBody(), ownerCookie);
    assert(t2.status === 403 && codeOf(t2) === 'TEACHER_LIMIT_REACHED', `second teacher refused: ${t2.status} ${JSON.stringify(t2.body)}`);
    const inactiveT = await post('/api/teachers', { ...teacherBody(), status: 'INACTIVE' }, ownerCookie);
    assert(inactiveT.status === 201, 'an INACTIVE teacher does not consume the limit');
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, overrides: { limits: { maxTeachers: 2 } } }, saCookie);
    const tBurst = await Promise.all(Array.from({ length: 4 }, () => post('/api/teachers', teacherBody(), ownerCookie)));
    eq(tBurst.filter((r) => r.status === 201).length, 1, 'concurrent teacher creation with one free slot creates exactly one');
    ok('14-16. Teacher limit enforced (inactive teachers not counted); concurrent teacher creation cannot exceed it');

    // ---------- STAFF limit ----------
    // staff so far: admin + staff = 2 (OWNER and TEACHER-role are not counted), limit 3
    const mkStaff = (n: string, role: 'STAFF' | 'ADMIN') => createUser(ccA, { email: `${n}-${codeA.toLowerCase()}@verify.local`, phone: nextPhone(), password: PW, name: n, role }, a.owner.id, 'OWNER');
    await mkStaff('extra1', 'STAFF');
    let staffErr = '';
    try { await mkStaff('extra2', 'ADMIN'); } catch (err) { staffErr = (err as Error).message; }
    assert(staffErr.startsWith('STAFF_LIMIT_REACHED'), `staff limit: ${staffErr}`);
    await mkUser(e('teacher2'), 'TEACHER'); // TEACHER-role login accounts never consume the staff limit (but the DB helper bypasses the service)
    let teacherAcctErr = '';
    try { await createUser(ccA, { email: e('teacher3'), phone: nextPhone(), password: PW, name: 't3', role: 'TEACHER' }, a.owner.id, 'OWNER'); } catch (err) { teacherAcctErr = (err as Error).message; }
    assert(teacherAcctErr === '', `TEACHER-role account is not blocked by the staff limit: ${teacherAcctErr}`);
    ok('17. Staff account limit counts ADMIN+STAFF only (not OWNER, not TEACHER-role); creation beyond it refused');

    // ---------- BRANCH limit ----------
    let branchErr = '';
    try { await prisma.$transaction(async (tx) => { await checkBranchLimit(tx, ccA); }); } catch (err) { branchErr = (err as Error).message; }
    assert(branchErr.startsWith('BRANCH_LIMIT_REACHED'), `branch limit (limit 1, has 1): ${branchErr}`);
    ok('18. Branch limit enforced by the centralized check (limit 1, one active branch → refused)');

    // ---------- PORTAL account limit ----------
    const stuIds = (await prisma.student.findMany({ where: { coachingCenterId: ccA }, select: { id: true }, take: 2 })).map((s) => s.id);
    const pa1 = await provisionPortalAccount({ coachingCenterId: ccA, studentId: stuIds[0], actorUserId: a.owner.id });
    assert(pa1.account.id, 'first portal account within limit');
    let portalErr = '';
    try { await provisionPortalAccount({ coachingCenterId: ccA, studentId: stuIds[1], actorUserId: a.owner.id }); } catch (err) { portalErr = (err as Error).message; }
    assert(portalErr.startsWith('PORTAL_LIMIT_REACHED'), `portal limit: ${portalErr}`);
    ok('19. Portal account limit is separate from the student limit (2 students, 1 portal account allowed)');

    // ---------- MESSAGE QUOTA ----------
    const baseLog = (extra: Record<string, unknown> = {}) => ({ coachingCenterId: ccA, message: 'q', event: 'GENERAL_NOTICE', ...extra }) as any;
    const usageNow = () => getTenantUsage(ccA);
    // SMS limit 3: fire 8 at once
    const smsBurst = await Promise.all(Array.from({ length: 8 }, () => createQuotaCheckedLog(ccA, 'SMS', baseLog())));
    eq(smsBurst.filter((r) => r.ok).length, 3, 'SMS: concurrent sends at limit 3 → exactly 3 reserved');
    assert(smsBurst.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'QUOTA_EXCEEDED'), 'refusals are QUOTA_EXCEEDED');
    eq((await usageNow()).sms, 3, 'usage reflects the reservations');
    const wa1 = await createQuotaCheckedLog(ccA, 'WHATSAPP', baseLog());
    const wa2 = await createQuotaCheckedLog(ccA, 'WHATSAPP', baseLog());
    assert(wa1.ok && !wa2.ok, 'WhatsApp quota (1) is enforced independently of SMS');
    const em1 = await createQuotaCheckedLog(ccA, 'EMAIL', baseLog());
    const em2 = await createQuotaCheckedLog(ccA, 'EMAIL', baseLog());
    assert(em1.ok && !em2.ok, 'Email quota (1) is enforced independently');
    ok('20-23. SMS / WhatsApp / Email quotas enforced per channel; 8 concurrent SMS sends against a limit of 3 reserve exactly 3');

    // failed / skipped / previous-month don't consume; retry doesn't double count
    const before = (await usageNow()).sms;
    for (let i = 0; i < 4; i++) await prisma.communicationLog.create({ data: { coachingCenterId: ccA, channel: 'SMS', status: 'FAILED', message: 'f', recipientPhone: '8801700000000', attemptCount: 1 } });
    for (let i = 0; i < 3; i++) await prisma.communicationLog.create({ data: { coachingCenterId: ccA, channel: 'SMS', status: 'SKIPPED', message: 's', errorMessage: 'CHANNEL_DISABLED' } });
    const lastMonth = new Date(dhakaMonthBounds().start.getTime() - 3 * 864e5);
    await prisma.communicationLog.create({ data: { coachingCenterId: ccA, channel: 'SMS', status: 'SENT', message: 'old', createdAt: lastMonth } });
    eq((await usageNow()).sms, before, 'FAILED, SKIPPED and previous-month SENT messages consume no quota');
    ok('24. Failed / skipped messages and last month\'s messages do not consume this month\'s quota');

    // retry: free a slot by failing one reserved row, then retry it — takes the unit back exactly once
    const anyReserved = smsBurst.find((r) => r.ok) as Extract<(typeof smsBurst)[number], { ok: true }>;
    await prisma.communicationLog.update({ where: { id: anyReserved.log.id }, data: { status: 'FAILED', retryable: true } });
    eq((await usageNow()).sms, 2, 'a FAILED row releases its unit');
    const claim = await claimRetryWithQuota(ccA, 'SMS', anyReserved.log.id);
    assert(claim.claimed && claim.reason === null, 'retry claims when a unit is free');
    eq((await usageNow()).sms, 3, 'retry re-takes exactly one unit (not two)');
    const claimAgain = await claimRetryWithQuota(ccA, 'SMS', anyReserved.log.id);
    assert(!claimAgain.claimed, 'a second retry of the same log cannot double-claim');
    // at quota: a different FAILED row cannot be retried
    const failedOther = await prisma.communicationLog.create({ data: { coachingCenterId: ccA, channel: 'SMS', status: 'FAILED', message: 'x', retryable: true, attemptCount: 1 } });
    const blocked = await claimRetryWithQuota(ccA, 'SMS', failedOther.id);
    assert(!blocked.claimed && blocked.reason === 'QUOTA_EXCEEDED', `retry is refused at quota: ${JSON.stringify(blocked)}`);
    assert((await prisma.communicationLog.findUniqueOrThrow({ where: { id: failedOther.id } })).status === 'FAILED', 'refused retry leaves the row FAILED');
    ok('25-26. Retry updates the same log and re-takes one unit exactly once; duplicate retry and over-quota retry are refused');

    // ---------- FEATURES ----------
    const hw = await get('/api/homework', ownerCookie);
    assert(hw.status === 403 && codeOf(hw) === 'FEATURE_NOT_ENABLED', `HOMEWORK off in plan → API refuses: ${hw.status} ${JSON.stringify(hw.body)}`);
    const hwCreate = await post('/api/homework', { title: 'x' }, ownerCookie);
    assert(hwCreate.status === 403 && codeOf(hwCreate) === 'FEATURE_NOT_ENABLED', 'homework write also refused');
    const rep = await get('/api/reports/options', ownerCookie);
    assert(rep.status === 403 && codeOf(rep) === 'FEATURE_NOT_ENABLED', `ADVANCED_REPORTS off → refused: ${rep.status}`);
    const att = await get('/api/attendance/options', ownerCookie);
    assert(att.status !== 403 || codeOf(att) !== 'FEATURE_NOT_ENABLED', 'an included feature is not blocked');
    const meView = await get('/api/auth/me', ownerCookie);
    assert(meView.body.center.features.HOMEWORK === false, 'UI hint mirrors the plan (presentation only)');
    // included feature works: turn HOMEWORK on for this tenant only via an override
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, overrides: { features: { HOMEWORK: true } } }, saCookie);
    const hwOn = await get('/api/homework', ownerCookie);
    assert(hwOn.status !== 403, `HOMEWORK enabled by override → allowed: ${hwOn.status} ${JSON.stringify(hwOn.body).slice(0, 120)}`);
    const portalHw = await get('/api/portal/student/homework', portalCookie); // tenant B is legacy → all features
    assert(portalHw.status !== 403 || codeOf(portalHw) !== 'FEATURE_NOT_ENABLED', 'legacy tenant keeps every feature');
    ok('27-29. Feature access is enforced in the API (403 FEATURE_NOT_ENABLED) — not just hidden; tenant override enables it; legacy tenants unaffected');

    // ---------- regression sanity on legacy tenant B ----------
    const legacyAdmit = await post('/api/students', { name: 'Legacy B', gender: 'MALE', dob: '2008-05-15', guardianName: 'Guardian B', guardianRelationship: 'FATHER', guardianPhone: nextPhone(), academicSessionId: sessionB.id, branchId: b.branch.id, academicProgramId: progB.id, academicClassId: classB.id }, ownerBCookie);
    assert(legacyAdmit.status === 201, `tenant without a subscription is unrestricted: ${legacyAdmit.status} ${JSON.stringify(legacyAdmit.body)}`);
    ok('40. Tenants created before this phase (no subscription) keep working exactly as before');

    // ---------- STATUS: trial / expired / renewal / cancelled / past-due ----------
    const trial = await put(`/api/super-admin/coaching-centers/${ccB}/subscription`, { planId: p2.body.plan.id, trialDays: 14 }, saCookie);
    assert(trial.status === 200 && trial.body.subscription.status === 'TRIAL', `trial assigned: ${JSON.stringify(trial.body)}`);
    const trialEnd = new Date(trial.body.subscription.endDate).getTime() - Date.now();
    assert(trialEnd > 13 * 864e5 && trialEnd < 15 * 864e5, 'trial lasts ~14 days');
    ok('30-31. Active subscription works; trial gets its configured duration and the trial plan\'s limits');

    // expire tenant A: data must be preserved, growth blocked, reading + finance still work
    const snapCounts = async () => ({
      students: await prisma.student.count({ where: { coachingCenterId: ccA } }),
      teachers: await prisma.teacher.count({ where: { coachingCenterId: ccA } }),
      users: await prisma.user.count({ where: { coachingCenterId: ccA } }),
      logs: await prisma.communicationLog.count({ where: { coachingCenterId: ccA } }),
    });
    const beforeExpiry = await snapCounts();
    const expire = await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'ACTIVE', endDate: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), startDate: new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10) }, saCookie);
    assert(expire.status === 200 && expire.body.subscription.status === 'EXPIRED', `computed EXPIRED: ${JSON.stringify(expire.body)}`);
    const grow = await post('/api/students', admission(), ownerCookie);
    assert(grow.status === 403 && codeOf(grow) === 'SUBSCRIPTION_INACTIVE', `expired tenant cannot add students: ${grow.status} ${JSON.stringify(grow.body)}`);
    const growT = await post('/api/teachers', teacherBody(), ownerCookie);
    assert(growT.status === 403 && codeOf(growT) === 'SUBSCRIPTION_INACTIVE', 'expired tenant cannot add teachers');
    const q = await createQuotaCheckedLog(ccA, 'EMAIL', baseLog());
    assert(!q.ok && q.reason === 'SUBSCRIPTION_INACTIVE', 'expired tenant cannot send messages');
    const readStudents = await get('/api/students', ownerCookie);
    assert(readStudents.status === 200 && readStudents.body.students?.length >= 3, `expired tenant can still view its data: ${readStudents.status}`);
    const me = await get('/api/settings/subscription', ownerCookie);
    assert(me.status === 200 && me.body.subscription.status === 'EXPIRED' && me.body.subscription.canGrow === false, 'expired tenant can still open its subscription page');
    const stillLogin = await login(a.owner.email, PW);
    assert(stillLogin.status === 200, `expired tenant can still sign in: ${stillLogin.status}`);
    assert(JSON.stringify(await snapCounts()) === JSON.stringify(beforeExpiry), 'no tenant data was deleted or changed by expiry');
    ok('32-34. Expired: new records + messages blocked; sign-in, reading, subscription page still work; all data preserved');

    // renewal
    const renew = await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'ACTIVE', endDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, saCookie);
    assert(renew.status === 200 && renew.body.subscription.status === 'ACTIVE', 'renewed');
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, overrides: { limits: { maxStudents: 50 } } }, saCookie);
    const afterRenew = await post('/api/students', admission(), ownerCookie);
    assert(afterRenew.status === 201, `renewed tenant can grow again: ${afterRenew.status} ${JSON.stringify(afterRenew.body)}`);
    const cancel = await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'CANCELLED' }, saCookie);
    assert(cancel.body.subscription.status === 'CANCELLED', 'cancelled');
    assert((await post('/api/students', admission(), ownerCookie)).status === 403, 'cancelled tenant cannot grow');
    const pastDue = await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'PAST_DUE', endDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }, saCookie);
    assert(pastDue.body.subscription.status === 'PAST_DUE', 'past due');
    assert((await post('/api/students', admission(), ownerCookie)).status === 201, 'PAST_DUE is a grace state and can still grow');
    await put(`/api/super-admin/coaching-centers/${ccA}/subscription`, { planId: plan.id, status: 'ACTIVE', endDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, saCookie);
    ok('35. Renewal restores access instantly (no restart/scheduler); CANCELLED blocks growth; PAST_DUE is a grace state');

    // archive / delete rules
    const delAssigned = await del(`/api/super-admin/plans/${plan.id}`, saCookie);
    assert(delAssigned.status === 409 && codeOf(delAssigned) === 'PLAN_IN_USE', `cannot delete an assigned plan: ${delAssigned.status}`);
    const arch = await put(`/api/super-admin/plans/${plan.id}`, { status: 'ARCHIVED' }, saCookie);
    assert(arch.status === 200 && arch.body.plan.status === 'ARCHIVED', 'archived');
    const subAfterArchive = await get('/api/settings/subscription', ownerCookie);
    assert(subAfterArchive.body.subscription.planName === 'Plan Renamed' && subAfterArchive.body.limits.maxStudents !== undefined, 'archived plan stays valid for existing subscribers');
    const assignArchived = await put(`/api/super-admin/coaching-centers/${ccB}/subscription`, { planId: plan.id }, saCookie);
    assert(assignArchived.status === 404, `archived plan cannot be newly assigned: ${assignArchived.status}`);
    const delFree = await post('/api/super-admin/plans', planBody(`${pcode}-3`.slice(0, 30)), saCookie);
    const delOk = await del(`/api/super-admin/plans/${delFree.body.plan.id}`, saCookie);
    assert(delOk.status === 200, 'an unassigned plan can be deleted');
    ok('13-14. Assigned plans cannot be deleted (409); archived plans keep serving existing subscribers but cannot be newly assigned');

    // ---------- SUSPENSION ----------
    const susp = await put(`/api/super-admin/coaching-centers/${ccA}/status`, { status: 'SUSPENDED', reason: 'non-payment' }, saCookie);
    assert(susp.status === 200, 'suspended');
    const meAfter = await get('/api/auth/me', ownerCookie);
    assert(meAfter.body.authenticated === false, 'existing sessions of a suspended tenant stop working immediately');
    assert((await get('/api/students', ownerCookie)).status === 401, 'suspended tenant API access refused');
    const loginSusp = await login(a.owner.email, PW);
    assert(loginSusp.status === 403 && loginSusp.body.error === 'TENANT_SUSPENDED', `suspended login: ${loginSusp.status} ${JSON.stringify(loginSusp.body)}`);
    assert((await get('/api/students', ownerBCookie)).status === 200, 'other tenants are unaffected');
    const dataKept = await prisma.student.count({ where: { coachingCenterId: ccA } });
    assert(dataKept >= 3, 'suspension deletes nothing');
    const react = await put(`/api/super-admin/coaching-centers/${ccA}/status`, { status: 'ACTIVE' }, saCookie);
    assert(react.status === 200, 'reactivated');
    assert((await get('/api/students', ownerCookie)).status === 200, 'existing session works again after reactivation');
    ok('8-9,33. Suspend: sessions die at once, login says "Account suspended", other tenants and all data untouched; reactivate restores');

    // ---------- Tenant creation by Super Admin + isolation ----------
    const newCode = `T114C${Date.now().toString().slice(-5)}`;
    const mk = await post('/api/super-admin/coaching-centers', {
      centerName: `${TAG} C`, centerCode: newCode, centerPhone: '01700000001', ownerName: 'C Owner', ownerEmail: `${newCode.toLowerCase()}-owner@verify.local`,
      ownerPhone: '01911111111', ownerPassword: 'SuperSecret-Owner-9', branchName: 'Main', branchCode: 'MAIN', sessionName: '2026',
      sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31', selectedPrograms: ['SSC'], planId: p2.body.plan.id, trialDays: 7,
    }, saCookie);
    assert(mk.status === 201 && mk.body.subscription.status === 'TRIAL', `create tenant: ${mk.status} ${JSON.stringify(mk.body)}`);
    created.centers.push(mk.body.center.id);
    const list = await get('/api/super-admin/coaching-centers?pageSize=100', saCookie);
    const rowC = list.body.tenants.find((t: any) => t.id === mk.body.center.id);
    assert(rowC && rowC.category === 'TRIAL' && rowC.owner?.email && !JSON.stringify(list.body).includes('passwordHash'), 'tenant list shows the new tenant, no password data');
    const detail = await get(`/api/super-admin/coaching-centers/${ccA}`, saCookie);
    assert(detail.status === 200 && !JSON.stringify(detail.body).match(/passwordHash|scrypt/i), 'tenant detail never exposes credentials');
    ok('7-8. Super Admin creates a tenant (with trial), lists and inspects tenants; no credentials are ever exposed');

    const bSees = await get('/api/settings/subscription', ownerBCookie);
    assert(bSees.body.subscription.planName !== 'Plan Renamed' || bSees.body.subscription.status === 'TRIAL', 'tenant B sees only its own subscription');
    assert(bSees.body.usage.students !== undefined && JSON.stringify(bSees.body).indexOf(ccA) === -1, 'tenant B response contains nothing about tenant A');
    ok('10/38-39. Tenant isolation intact: each OWNER sees only their own subscription and usage');

    // ---------- AUDIT ----------
    const logs = await prisma.platformAuditLog.findMany({ where: { OR: [{ coachingCenterId: { in: created.centers } }, { platformAdminId: pAdmin.id }, { entityId: { in: created.plans } }] } });
    const actions = new Set(logs.map((l) => l.action));
    for (const act of ['PLATFORM_LOGIN', 'PLAN_CREATED', 'PLAN_UPDATED', 'PLAN_ARCHIVED', 'PLAN_DELETED', 'TENANT_CREATED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CHANGED', 'LIMITS_CHANGED', 'FEATURE_ENABLED', 'TENANT_OVERRIDE_CREATED', 'TENANT_OVERRIDE_CHANGED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED']) {
      assert(actions.has(act), `platform audit action ${act} missing (have ${[...actions].join(', ')})`);
    }
    assert(logs.every((l) => l.platformAdminId === pAdmin.id || l.platformAdminId === null), 'every platform action is attributed to the acting admin');
    const dump = JSON.stringify(logs);
    assert(!dump.includes(PW) && !dump.includes(PLATFORM_PW) && !dump.includes('SuperSecret-Owner-9') && !/passwordHash|scrypt/i.test(dump), 'no password or secret appears in the platform audit trail');
    const suspLog = logs.find((l) => l.action === 'TENANT_SUSPENDED')!;
    assert((suspLog.details as any).reason === 'non-payment' && (suspLog.details as any).from === 'ACTIVE', 'suspension audit records reason and before/after');
    ok('36-37. Every Super Admin action is audited with actor and before/after; no password/secret is ever logged');


    console.log('\n========================================================');
    console.log(`ALL PHASE 11.4 CHECKS PASSED (${passed})`);
    console.log('========================================================');
  } finally {
    console.log('Cleaning up throwaway data...');
    const centers = created.centers;
    await prisma.platformAuditLog.deleteMany({ where: { OR: [{ coachingCenterId: { in: centers } }, { platformAdminId: { in: created.admins } }] } }).catch(() => null);
    for (const id of centers) await prisma.coachingCenter.delete({ where: { id } }).catch(() => null);
    for (const id of created.plans) await prisma.subscriptionPlan.delete({ where: { id } }).catch(() => null);
    for (const id of created.admins) await prisma.platformAdmin.delete({ where: { id } }).catch(() => null);
    console.log('Cleanup completed.');
  }
}

main()
  .catch((err) => {
    console.error('FATAL VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => null));
