import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PLATFORM_SESSION_COOKIE_NAME } from '../lib/auth/platform-session';
import { createPlatformAdmin } from '../lib/services/platform-auth.service';
import { addCalendarMonths, addDays, computeRenewalEnd, subscriptionNotice } from '../lib/subscription';

/**
 * Phase 11.5 — Subscription Operations verification. Live server (AUTH_BASE_URL,
 * default localhost:3000) + real DB; throwaway tenants/plans/platform admin are
 * removed afterwards. Every mutation goes through the real HTTP API.
 */
const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P115-${Date.now()}`;
const PW = 'ValidPass123!';
const PLATFORM_PW = 'PlatformPass-115-Abcdef';
let passed = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`✔ [${passed}] ${label}`);
};
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
const eq = (a: unknown, b: unknown, label: string) => assert(Number(a) === Number(b), `${label} — expected ${b}, got ${a}`);
const near = (a: Date | string, b: Date, ms: number, label: string) =>
  assert(Math.abs(new Date(a).getTime() - b.getTime()) <= ms, `${label} — ${new Date(a).toISOString()} vs ${b.toISOString()}`);

interface Resp { status: number; body: Record<string, any>; cookies: Record<string, { value: string }> }
async function request(method: string, path: string, opts: { payload?: unknown; cookie?: string } = {}): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.payload !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined, redirect: 'manual' });
  const text = await res.text();
  let body: Record<string, any> = {};
  try { body = JSON.parse(text); } catch { body = { _text: text.slice(0, 300) }; }
  const cookies: Resp['cookies'] = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = { value: pair.slice(i + 1) };
  }
  return { status: res.status, body, cookies };
}
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;
const codeOf = (r: Resp) => r.body.error as string;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name, centerCode: code, centerPhone: '01700000000', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`, ownerEmail: `${code.toLowerCase()}-owner@verify.local`, ownerPhone: `019${Date.now().toString().slice(-8)}`,
    ownerPassword: PW, branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01',
    sessionEndDate: '2026-12-31', selectedPrograms: ['SSC'], primaryColor: '#063B78', accentColor: '#FFD200',
  } as any);
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 11.5 SUBSCRIPTION OPERATIONS VERIFICATION — ${BASE}`);
  console.log('========================================================');

  // ---------- pure rules ----------
  assert(addCalendarMonths(new Date('2026-10-31T00:00:00Z'), 1).toISOString().startsWith('2026-11-30'), '31 Oct + 1 month = 30 Nov');
  assert(addCalendarMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().startsWith('2026-02-28'), '31 Jan + 1 month = 28 Feb');
  assert(addCalendarMonths(new Date('2026-12-15T00:00:00Z'), 2).toISOString().startsWith('2027-02-15'), 'year rollover');
  const now0 = new Date('2026-10-10T00:00:00Z');
  assert(computeRenewalEnd(new Date('2026-10-31T00:00:00Z'), now0, { unit: 'MONTHS', value: 1 }).toISOString().startsWith('2026-11-30'), 'early renewal is added after the current expiry');
  assert(computeRenewalEnd(new Date('2026-09-01T00:00:00Z'), now0, { unit: 'MONTHS', value: 1 }).toISOString().startsWith('2026-11-10'), 'expired renewal starts from now');
  ok('P1. Renewal date rules: 31 Oct+1mo = 30 Nov, month clamping, year rollover, early vs expired renewal');
  const n = (s: any, e: string | null) => subscriptionNotice({ tenantSuspended: s.sus ?? false, status: s.status, endDate: e }, now0);
  assert(n({ status: 'TRIAL' }, '2026-10-15T00:00:00Z').kind === 'TRIAL_ENDS' && n({ status: 'ACTIVE' }, '2026-10-14T00:00:00Z').kind === 'EXPIRING_SOON' && n({ status: 'ACTIVE' }, '2027-01-01T00:00:00Z').kind === 'NONE' && n({ status: 'PAST_DUE' }, null).kind === 'PAST_DUE' && n({ status: 'EXPIRED' }, '2026-09-01T00:00:00Z').kind === 'EXPIRED' && n({ status: 'CANCELLED' }, null).kind === 'CANCELLED' && n({ status: 'ACTIVE', sus: true }, null).kind === 'SUSPENDED', 'notice kinds');
  ok('P2. Tenant notices: trial-ends / expiring-soon / past-due / expired / cancelled / suspended (no amounts invented)');

  const created = { centers: [] as string[], plans: [] as string[], admins: [] as string[] };
  try {
    const pAdmin = await createPlatformAdmin({ email: `${TAG.toLowerCase()}@platform.local`, name: 'Ops Admin', password: PLATFORM_PW });
    created.admins.push(pAdmin.id);
    const codes = ['A', 'B', 'C', 'D'].map((x) => `T115${x}${Date.now().toString().slice(-5)}`);
    const [tA, tB, tC, tD] = [await tenant(codes[0], `${TAG} A`), await tenant(codes[1], `${TAG} B`), await tenant(codes[2], `${TAG} C`), await tenant(codes[3], `${TAG} D`)];
    created.centers.push(tA.center.id, tB.center.id, tC.center.id, tD.center.id);
    const [ccA, ccB, ccC, ccD] = [tA.center.id, tB.center.id, tC.center.id, tD.center.id];

    const roles = await prisma.role.findMany({ where: { coachingCenterId: ccA } });
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER') =>
      prisma.user.create({ data: { coachingCenterId: ccA, branchId: tA.branch.id, email, passwordHash: hashPassword(PW), name: `${TAG} ${email}`, roleAssignments: { create: { roleId: roles.find((r) => r.code === role)!.id, branchId: tA.branch.id } } } });
    const adminU = await mkUser(`admin-${codes[0].toLowerCase()}@verify.local`, 'ADMIN');
    const staffU = await mkUser(`staff-${codes[0].toLowerCase()}@verify.local`, 'STAFF');
    const teacherU = await mkUser(`teacher-${codes[0].toLowerCase()}@verify.local`, 'TEACHER');
    const login = (email: string) => request('POST', '/api/auth/login', { payload: { email, password: PW } });
    const ownerA = cookieOf(await login(tA.owner.email), SESSION_COOKIE_NAME);
    const adminA = cookieOf(await login(adminU.email), SESSION_COOKIE_NAME);
    const staffA = cookieOf(await login(staffU.email), SESSION_COOKIE_NAME);
    const teacherA = cookieOf(await login(teacherU.email), SESSION_COOKIE_NAME);
    const ownerB = cookieOf(await login(tB.owner.email), SESSION_COOKIE_NAME);
    const pl = await request('POST', '/api/super-admin/auth/login', { payload: { email: pAdmin.email, password: PLATFORM_PW } });
    assert(pl.status === 200, `platform login ${pl.status}`);
    const sa = cookieOf(pl, PLATFORM_SESSION_COOKIE_NAME);

    const S = (method: string, path: string, payload?: unknown) => request(method, `/api/super-admin${path}`, { payload, cookie: sa });
    const T = (id: string) => `/coaching-centers/${id}/subscription`;
    const overview = async (id: string) => (await S('GET', T(id))).body;
    const key = () => `idem-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const dbSub = (cc: string) => prisma.subscription.findUniqueOrThrow({ where: { coachingCenterId: cc } });

    // ---------- plans ----------
    const mkPlan = async (code: string, limits: Record<string, number | null>, features: Record<string, boolean>, price: number, trialDays?: number) => {
      const r = await S('POST', '/plans', { name: `${code}`, code: `${TAG}-${code}`.toUpperCase().slice(0, 30), priceMonthly: price, trialDays, limits, features });
      assert(r.status === 201, `plan ${code}: ${r.status} ${JSON.stringify(r.body)}`);
      created.plans.push(r.body.plan.id);
      return r.body.plan as { id: string; version: number };
    };
    const allOn = { ATTENDANCE: true, FEES: true, EXAMS: true, STUDY_MATERIALS: true, COMMUNICATION: true, ADVANCED_REPORTS: true, ONLINE_PAYMENT: true };
    const starter = await mkPlan('STARTER', { maxStudents: 2, maxTeachers: 1, maxStaffUsers: 3, maxPortalAccounts: 1, maxBranches: 1 }, { ...allOn, HOMEWORK: false }, 1000, 7);
    const growth = await mkPlan('GROWTH', { maxStudents: 10, maxTeachers: 5, maxStaffUsers: 5, maxPortalAccounts: 5, maxBranches: 2 }, { ...allOn, HOMEWORK: true }, 3000, 14);
    const pro = await mkPlan('PRO', { maxStudents: 50, maxTeachers: 20, maxStaffUsers: 10, maxPortalAccounts: 50, maxBranches: 5 }, { ...allOn, HOMEWORK: true }, 6000);
    const arch = await mkPlan('ARCH', { maxStudents: 5 }, allOn, 500);
    await S('PUT', `/plans/${arch.id}`, { status: 'ARCHIVED' });

    // ---------- tenants without a subscription ----------
    const dash0 = await S('GET', '/dashboard');
    assert(dash0.body.dashboard.tenants.LEGACY >= 4, `dashboard counts tenants without a subscription: ${dash0.body.dashboard.tenants.LEGACY}`);
    const legacyList = await S('GET', '/coaching-centers?category=LEGACY&pageSize=100');
    const legacyIds = legacyList.body.tenants.map((x: any) => x.id);
    assert([ccA, ccB, ccC, ccD].every((id) => legacyIds.includes(id)), 'tenants with no subscription are listed under the "no subscription" filter');
    // before assignment nothing is enforced (Phase 11.4 behaviour preserved)
    const sessB = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: ccB } });
    const progB = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccB, code: 'SSC' } });
    const clsB = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccB, academicProgramId: progB.id } });
    let ph = 0;
    const phone = () => `0181${String(4000000 + ++ph + (Date.now() % 100000))}`;
    const admit = (cookie: string, ids: { s: string; b: string; p: string; c: string }) =>
      request('POST', '/api/students', { cookie, payload: { name: `Stu ${Math.random().toString(36).slice(2, 7)}`, gender: 'MALE', dob: '2008-05-15', guardianName: 'Guardian X', guardianRelationship: 'FATHER', guardianPhone: phone(), academicSessionId: ids.s, branchId: ids.b, academicProgramId: ids.p, academicClassId: ids.c } });
    const idsB = { s: sessB.id, b: tB.branch.id, p: progB.id, c: clsB.id };
    for (let i = 0; i < 3; i++) assert((await admit(ownerB, idsB)).status === 201, 'unassigned tenant is unrestricted');
    ok('1. Tenants without a subscription are visible (dashboard count + filter) and stay unrestricted until a plan is assigned');

    // ---------- PLAN ASSIGNMENT ----------
    const noConfirmAssign = await S('POST', T(ccA) + '/assign', { planId: growth.id, mode: 'PAID' });
    assert(noConfirmAssign.status === 400, 'paid assignment without a duration is rejected');
    const assignA = await S('POST', T(ccA) + '/assign', { planId: growth.id, mode: 'PAID', duration: { unit: 'MONTHS', value: 1 }, reason: 'Initial sale', idempotencyKey: key() });
    assert(assignA.status === 200 && assignA.body.result.subscription.status === 'ACTIVE', `assign: ${assignA.status} ${JSON.stringify(assignA.body)}`);
    const subA0 = await dbSub(ccA);
    near(subA0.endDate, addCalendarMonths(new Date(), 1), 120_000, 'assigned period is one calendar month');
    ok('2. Assign a valid plan (paid, 1 month): server computes the end date');
    const ov0 = await overview(ccA);
    eq(ov0.limits.find((l: any) => l.key === 'maxStudents').planValue, 10, 'snapshot plan value');
    eq(ov0.subscription.planVersion, growth.version, 'snapshot records the plan version');
    ok('3. Plan snapshot is stored with the plan\'s limits and version');
    assert((await S('POST', T(ccA) + '/assign', { planId: pro.id, mode: 'PAID', duration: { unit: 'MONTHS', value: 1 } })).body.error === 'SUBSCRIPTION_EXISTS', 'assign on an existing subscription is refused');
    ok('4. Assigning again is refused (use Change Plan / Renew)');
    const archAssign = await S('POST', T(ccB) + '/assign', { planId: arch.id, mode: 'PAID', duration: { unit: 'MONTHS', value: 1 } });
    assert(archAssign.status === 400 && codeOf(archAssign) === 'PLAN_ARCHIVED', `archived plan rejected: ${archAssign.status} ${JSON.stringify(archAssign.body)}`);
    ok('5. Archived plans cannot be assigned');

    // ---------- RENEWAL ----------
    const endBefore = (await dbSub(ccA)).endDate;
    const renew1 = await S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, reason: 'Paid by bKash', idempotencyKey: key() });
    assert(renew1.status === 200, `renew: ${JSON.stringify(renew1.body)}`);
    const endAfter = (await dbSub(ccA)).endDate;
    eq(endAfter.getTime(), addCalendarMonths(endBefore, 1).getTime(), 'early renewal adds one month AFTER the current expiry');
    assert(endAfter.getTime() > endBefore.getTime(), 'renewing early never shortens the subscription');
    ok('6-7. Renew an active subscription early: +1 month after current expiry, never shortened');
    const endBefore3 = (await dbSub(ccA)).endDate;
    await S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 5 }, idempotencyKey: key() });
    eq((await dbSub(ccA)).endDate.getTime(), addCalendarMonths(endBefore3, 5).getTime(), 'custom 5-month duration');
    ok('8. Custom duration (5 months)');
    for (const bad of [{ unit: 'MONTHS', value: 0 }, { unit: 'MONTHS', value: -3 }, { unit: 'MONTHS', value: 61 }, { unit: 'DAYS', value: 5000 }, { unit: 'YEARS', value: 1 }, { unit: 'MONTHS', value: 1.5 }]) {
      const r = await S('POST', T(ccA) + '/renew', { duration: bad });
      assert(r.status === 400, `invalid duration ${JSON.stringify(bad)} rejected, got ${r.status}`);
    }
    assert((await S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, endDate: '2000-01-01' })).status === 200, 'a client-supplied endDate is ignored (dates are server-computed)');
    assert((await dbSub(ccA)).endDate.getFullYear() >= 2026, 'client-supplied dates never reach the subscription');
    ok('9. Invalid durations rejected (0, negative, over max, unknown unit, fractional); client-supplied dates ignored');
    // expired renewal starts from now
    await prisma.subscription.update({ where: { coachingCenterId: ccA }, data: { endDate: addDays(new Date(), -40), status: 'ACTIVE' } });
    assert((await overview(ccA)).subscription.status === 'EXPIRED', 'expired state detected');
    await S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: key() });
    const subE = await dbSub(ccA);
    near(subE.endDate, addCalendarMonths(new Date(), 1), 120_000, 'renewing an expired subscription starts from today');
    eq((await overview(ccA)).subscription.status === 'ACTIVE' ? 1 : 0, 1, 'renewal restores ACTIVE');
    ok('10. Renew an expired subscription: starts from today and returns to ACTIVE (expired state detected first)');
    // idempotency
    const k1 = key();
    const e0 = (await dbSub(ccA)).endDate;
    const [r1, r2] = await Promise.all([S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: k1 }), S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: k1 })]);
    assert(r1.status === 200 && r2.status === 200 && [r1, r2].filter((r) => r.body.result.replay === true).length === 1, 'exactly one of two identical requests is a replay');
    eq((await dbSub(ccA)).endDate.getTime(), addCalendarMonths(e0, 1).getTime(), 'same idempotency key applies once (+1 month, not +2)');
    ok('11. Concurrent renewals with the SAME key apply exactly once');
    const e1 = (await dbSub(ccA)).endDate;
    const [c1, c2] = await Promise.all([S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: key() }), S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: key() })]);
    assert(c1.status === 200 && c2.status === 200, 'both concurrent renewals succeed');
    eq((await dbSub(ccA)).endDate.getTime(), addCalendarMonths(addCalendarMonths(e1, 1), 1).getTime(), 'two different concurrent renewals add exactly +2 months, no corruption');
    eq(await prisma.subscription.count({ where: { coachingCenterId: ccA } }), 1, 'still exactly one subscription row');
    ok('12. Concurrent renewals with different keys serialize: end date = +2 months exactly, one subscription row');
    // extend
    const e2 = (await dbSub(ccA)).endDate;
    await S('POST', T(ccA) + '/extend', { days: 10, reason: 'goodwill', idempotencyKey: key() });
    eq((await dbSub(ccA)).endDate.getTime(), addDays(e2, 10).getTime(), 'manual extension adds days');
    assert((await S('POST', T(ccA) + '/extend', { days: 0 })).status === 400 && (await S('POST', T(ccA) + '/extend', { days: -5 })).status === 400, 'invalid extension rejected');
    ok('13. Manual extension (+10 days) and invalid extension rejected');

    // ---------- TRIAL ----------
    const trialC = await S('POST', T(ccC) + '/assign', { planId: growth.id, mode: 'TRIAL', trialDays: 10, reason: 'demo', idempotencyKey: key() });
    assert(trialC.status === 200 && trialC.body.result.subscription.status === 'TRIAL', `trial start: ${JSON.stringify(trialC.body)}`);
    near((await dbSub(ccC)).endDate, addDays(new Date(), 10), 120_000, 'custom 10-day trial');
    const trialD = await S('POST', T(ccD) + '/assign', { planId: growth.id, mode: 'TRIAL' });
    assert(trialD.status === 200, 'trial with the plan default days');
    near((await dbSub(ccD)).endDate, addDays(new Date(), 14), 120_000, 'plan default trial (14 days)');
    ok('14-15. Start a trial with custom days and with the plan\'s default days');
    const tEnd0 = (await dbSub(ccC)).endDate;
    await S('POST', T(ccC) + '/trial', { action: 'extend', days: 7, reason: 'needs more time', idempotencyKey: key() });
    eq((await dbSub(ccC)).endDate.getTime(), addDays(tEnd0, 7).getTime(), 'trial extended by 7 days');
    assert((await dbSub(ccC)).status === 'TRIAL', 'extending keeps it a trial');
    assert((await S('POST', T(ccC) + '/trial', { action: 'extend', days: 0 })).status === 400 && (await S('POST', T(ccC) + '/trial', { action: 'extend', days: 91 })).status === 400, 'impossible trial extensions rejected');
    assert((await S('POST', T(ccA) + '/trial', { action: 'extend', days: 3 })).body.error === 'INVALID_TRANSITION', 'cannot extend a trial on a paid subscription');
    ok('16-17. Extend trial (+7 days, still TRIAL); impossible values and non-trial tenants rejected');
    assert((await S('POST', T(ccC) + '/trial', { action: 'end', reason: 'x' })).status === 400, 'ending a trial needs reason (3+ chars) and confirm');
    assert((await S('POST', T(ccC) + '/trial', { action: 'end', reason: 'customer declined' })).status === 400, 'ending a trial needs explicit confirmation');
    const endTrial = await S('POST', T(ccC) + '/trial', { action: 'end', reason: 'customer declined', confirm: true, idempotencyKey: key() });
    assert(endTrial.status === 200 && (await overview(ccC)).subscription.status === 'EXPIRED', 'trial ended → expired');
    ok('18. End trial requires reason + confirmation; tenant becomes expired (data untouched)');
    const restart = await S('POST', T(ccC) + '/trial', { action: 'start', trialDays: 5, idempotencyKey: key() });
    assert(restart.status === 200 && (await dbSub(ccC)).status === 'TRIAL', 'a trial can be started again for an expired tenant');
    const convert = await S('POST', T(ccC) + '/trial', { action: 'convert', duration: { unit: 'MONTHS', value: 3 }, reason: 'paid', idempotencyKey: key() });
    assert(convert.status === 200, `convert: ${JSON.stringify(convert.body)}`);
    const subC = await dbSub(ccC);
    assert(subC.status === 'ACTIVE', 'converted to paid');
    near(subC.endDate, addCalendarMonths(new Date(), 3), 120_000, 'paid period starts today (3 months)');
    assert((await S('POST', T(ccC) + '/trial', { action: 'convert', duration: { unit: 'MONTHS', value: 3 } })).body.error === 'INVALID_TRANSITION', 'cannot convert a subscription that is not a trial');
    assert((await S('POST', T(ccC) + '/trial', { action: 'convert' })).status === 400 && (await S('POST', T(ccC) + '/trial', { action: 'nonsense' })).status === 400, 'invalid trial requests rejected');
    ok('19-20. Restart trial for an expired tenant; convert trial → paid (3 months from today); invalid conversions rejected');

    // ---------- PLAN CHANGE ----------
    const sessA = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: ccA } });
    const progA = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccA, code: 'SSC' } });
    const clsA = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccA, academicProgramId: progA.id } });
    const idsA = { s: sessA.id, b: tA.branch.id, p: progA.id, c: clsA.id };
    for (let i = 0; i < 4; i++) assert((await admit(ownerA, idsA)).status === 201, `seed student ${i} under GROWTH (limit 10)`);
    const counts = async () => ({ students: await prisma.student.count({ where: { coachingCenterId: ccA } }), invoices: await prisma.feeInvoice.count({ where: { coachingCenterId: ccA } }), users: await prisma.user.count({ where: { coachingCenterId: ccA } }) });
    const before = await counts();
    const prev = await S('POST', T(ccA) + '/change-plan', { planId: starter.id, preview: true });
    assert(prev.status === 200, `preview: ${JSON.stringify(prev.body)}`);
    const pv = prev.body.result.preview;
    assert(pv.overLimits.some((o: any) => o.key === 'maxStudents' && o.used === 4 && o.limit === 2 && o.over === 2), `preview reports 4/2 over by 2: ${JSON.stringify(pv.overLimits)}`);
    assert((await dbSub(ccA)).planId === growth.id, 'preview changes nothing');
    ok('21. Plan-change preview shows before/after limits and over-limit counts without changing anything');
    assert((await S('POST', T(ccA) + '/change-plan', { planId: starter.id })).status === 400, 'change-plan requires reason');
    assert((await S('POST', T(ccA) + '/change-plan', { planId: starter.id, reason: 'downgrade requested' })).status === 400, 'change-plan requires explicit confirmation');
    assert((await S('POST', T(ccA) + '/change-plan', { planId: growth.id, reason: 'same', confirm: true })).body.error === 'PLAN_UNCHANGED', 'same-plan change rejected');
    assert((await S('POST', T(ccA) + '/change-plan', { planId: arch.id, reason: 'archived', confirm: true })).body.error === 'PLAN_ARCHIVED', 'cannot change to an archived plan');
    ok('22. Plan change needs reason + confirmation; same plan and archived plan refused');
    // set an override first so we can verify it is cleared by default
    await S('PUT', T(ccA) + '/overrides', { limits: { maxTeachers: 9 }, features: {}, reason: 'temporary' });
    const down = await S('POST', T(ccA) + '/change-plan', { planId: starter.id, reason: 'customer downgraded', confirm: true, idempotencyKey: key() });
    assert(down.status === 200 && down.body.result.direction === 'DOWNGRADE', `downgrade: ${JSON.stringify(down.body)}`);
    const ovD = await overview(ccA);
    eq(ovD.limits.find((l: any) => l.key === 'maxStudents').effective, 2, 'downgrade snapshot applied');
    assert(ovD.limits.find((l: any) => l.key === 'maxTeachers').overridden === false, 'custom limits cleared by default on plan change');
    ok('23-24. Downgrade: new snapshot applied, direction=DOWNGRADE, custom limits cleared unless kept');
    assert(JSON.stringify(await counts()) === JSON.stringify(before), 'downgrade deleted nothing');
    ok('25. Lower limit deletes/deactivates no records (students, invoices, users unchanged)');
    assert(ovD.overLimits.some((o: any) => o.key === 'maxStudents' && o.used === 4 && o.limit === 2 && o.over === 2), 'over-limit state detected: 4 / 2, over by 2');
    const blocked = await admit(ownerA, idsA);
    assert(blocked.status === 403 && codeOf(blocked) === 'STUDENT_LIMIT_REACHED', `new admission blocked while over limit: ${blocked.status} ${JSON.stringify(blocked.body)}`);
    eq((await counts()).students, 4, 'blocked admission created nothing');
    const ownerView = await request('GET', '/api/settings/subscription', { cookie: ownerA });
    assert(ownerView.body.overLimits.some((o: any) => o.key === 'maxStudents' && o.over === 2), 'tenant OWNER sees the over-limit state too');
    ok('26. Over-limit detected (4/2, over by 2), creation blocked, OWNER can see why');
    const up = await S('POST', T(ccA) + '/change-plan', { planId: pro.id, reason: 'upgrade', confirm: true, keepOverrides: true, idempotencyKey: key() });
    assert(up.status === 200 && up.body.result.direction === 'UPGRADE', 'upgrade');
    eq((await overview(ccA)).limits.find((l: any) => l.key === 'maxStudents').effective, 50, 'upgrade snapshot applied');
    assert((await admit(ownerA, idsA)).status === 201, 'creation works again after the upgrade');
    ok('27. Upgrade: new snapshot applied and creation resumes');
    // plan edits do not alter the tenant until an explicit resync
    await S('PUT', `/plans/${pro.id}`, { limits: { maxStudents: 80 } });
    eq((await overview(ccA)).limits.find((l: any) => l.key === 'maxStudents').effective, 50, 'editing the plan does not change the sold snapshot');
    const outdated = (await overview(ccA)).subscription;
    assert(outdated.planOutdated === true, 'plan is flagged outdated');
    assert((await S('POST', T(ccA) + '/resync', { reason: 'apply new terms' })).status === 400, 'resync needs confirmation');
    assert((await S('POST', T(ccA) + '/resync', { reason: 'apply new terms', confirm: true })).status === 200, 'resync');
    eq((await overview(ccA)).limits.find((l: any) => l.key === 'maxStudents').effective, 80, 'explicit resync applies the latest terms');
    ok('28. Editing a plan never changes existing tenants; only an explicit, confirmed resync does');

    // ---------- OVERRIDES ----------
    const ovRes = await S('PUT', T(ccA) + '/overrides', { limits: { maxStudents: 100, maxTeachers: 30, maxStaffUsers: 25, maxBranches: 7, maxPortalAccounts: 120 }, features: {}, reason: 'Enterprise negotiation' });
    assert(ovRes.status === 200, `overrides: ${JSON.stringify(ovRes.body)}`);
    const ovS = await overview(ccA);
    for (const [k, v, planV] of [['maxStudents', 100, 80], ['maxTeachers', 30, 20], ['maxStaffUsers', 25, 10], ['maxBranches', 7, 5], ['maxPortalAccounts', 120, 50]] as const) {
      const row = ovS.limits.find((l: any) => l.key === k);
      assert(row.overridden && row.overrideValue === v && row.planValue === planV && row.effective === v, `${k}: plan ${planV} / override ${v} / effective ${v} — got ${JSON.stringify(row)}`);
    }
    ok('29-33. Student / teacher / staff / branch / portal-account overrides: plan value, override and effective limit shown separately');
    const meta = ovS.limits.find((l: any) => l.key === 'maxStudents').overrideMeta;
    assert(meta.reason === 'Enterprise negotiation' && meta.updatedBy === 'Ops Admin' && meta.createdBy === 'Ops Admin' && meta.updatedAt, 'override records reason / created by / updated by / timestamps');
    assert(!JSON.stringify(ovS).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/), 'the override view exposes no internal ids');
    ok('34. Override metadata (reason, by, at) recorded; no internal ids in the view');
    for (const bad of [{ maxStudents: -1 }, { maxStudents: 1.5 }, { maxStudents: 'lots' }, { maxStudents: 999999999999 }]) {
      const r = await S('PUT', T(ccA) + '/overrides', { limits: bad, features: {}, reason: 'bad' });
      assert(r.status === 400, `invalid override ${JSON.stringify(bad)} rejected, got ${r.status}`);
    }
    assert((await S('PUT', T(ccA) + '/overrides', { limits: { maxStudents: 5 }, features: {} })).status === 400, 'override requires a reason');
    ok('35. Invalid overrides (negative, fractional, non-numeric, absurd) and missing reason rejected');
    // functional: override above plan value is honoured (teacher limit 30 > plan 20; make plan lower via override 1 then creation blocked)
    await S('PUT', T(ccA) + '/overrides', { limits: { maxTeachers: 1 }, features: {}, reason: 'tighten' });
    const teacherBody = () => ({ name: `Teacher ${Math.random().toString(36).slice(2, 6)}`, phone: phone(), status: 'ACTIVE' });
    assert((await request('POST', '/api/teachers', { cookie: ownerA, payload: teacherBody() })).status === 201, 'first teacher within override limit 1');
    const t2 = await request('POST', '/api/teachers', { cookie: ownerA, payload: teacherBody() });
    assert(t2.status === 403 && codeOf(t2) === 'TEACHER_LIMIT_REACHED', 'override below the plan value is enforced');
    await S('PUT', T(ccA) + '/overrides', { limits: { maxTeachers: 3 }, features: {}, reason: 'raise' });
    assert((await request('POST', '/api/teachers', { cookie: ownerA, payload: teacherBody() })).status === 201, 'raised override takes effect immediately');
    ok('36. Overrides change what the tenant can actually create (enforced by the same limit service)');
    // feature override
    const featRes = await request('GET', '/api/reports/options', { cookie: ownerA });
    assert(featRes.status !== 403 || codeOf(featRes) !== 'FEATURE_NOT_ENABLED', 'ADVANCED_REPORTS is on under PRO');
    await S('PUT', T(ccA) + '/overrides', { limits: { maxTeachers: 3 }, features: { ADVANCED_REPORTS: false }, reason: 'feature off' });
    const featOff = await request('GET', '/api/reports/options', { cookie: ownerA });
    assert(featOff.status === 403 && codeOf(featOff) === 'FEATURE_NOT_ENABLED', 'feature override OFF is enforced by the API');
    const frow = (await overview(ccA)).features.find((f: any) => f.key === 'ADVANCED_REPORTS');
    assert(frow.planValue === true && frow.overridden && frow.overrideValue === false && frow.effective === false, `feature row: plan / override / effective: ${JSON.stringify(frow)}`);
    await S('PUT', T(ccA) + '/overrides', { limits: {}, features: {}, reason: 'clear all' });
    assert((await overview(ccA)).limits.every((l: any) => !l.overridden), 'clearing removes all overrides');
    ok('37. Feature override: plan default vs override vs effective shown; enforced server-side; clearing restores the plan');
    const hist = await S('GET', T(ccA) + '/history');
    assert(hist.body.history.some((h: any) => h.action === 'SUBSCRIPTION_OVERRIDE_UPDATED' && h.reason && h.by === 'Ops Admin'), 'override changes appear in history with actor and reason');
    assert(!JSON.stringify(hist.body).includes('idempotencyKey'), 'history hides internal idempotency keys');
    ok('38. Subscription history lists changes with actor, time and reason (built from the platform audit trail)');

    // ---------- LIFECYCLE ----------
    assert((await S('PUT', `/coaching-centers/${ccA}/status`, { status: 'SUSPENDED' })).status === 400, 'suspension requires a reason');
    const susp = await S('PUT', `/coaching-centers/${ccA}/status`, { status: 'SUSPENDED', reason: 'unpaid invoice' });
    assert(susp.status === 200, 'suspended');
    assert((await request('GET', '/api/students', { cookie: ownerA })).status === 401, 'suspended tenant sessions stop immediately');
    ok('39. Suspend requires a reason and takes effect immediately (no data deleted)');
    await prisma.subscription.update({ where: { coachingCenterId: ccA }, data: { endDate: addDays(new Date(), -3) } });
    const react = await S('PUT', `/coaching-centers/${ccA}/status`, { status: 'ACTIVE' });
    assert(react.status === 200 && react.body.result.warnings.includes('SUBSCRIPTION_EXPIRED'), `reactivating an expired tenant warns instead of pretending it is healthy: ${JSON.stringify(react.body)}`);
    assert((await overview(ccA)).subscription.status === 'EXPIRED', 'reactivation did not touch the subscription');
    const still = await admit(ownerA, idsA);
    assert(still.status === 403 && codeOf(still) === 'SUBSCRIPTION_INACTIVE', 'expired subscription still blocks growth after reactivation');
    ok('40-41. Reactivate lifts only the suspension: expired subscription is reported and stays expired until renewed');
    await S('POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 }, idempotencyKey: key() });
    assert((await admit(ownerA, idsA)).status === 201, 'after explicit renewal the tenant can grow again');
    // cancel / restore
    assert((await S('POST', T(ccA) + '/cancel', { reason: 'no' })).status === 400, 'cancel requires 3+ char reason and confirmation');
    assert((await S('POST', T(ccA) + '/cancel', { reason: 'customer left' })).status === 400, 'cancel requires confirmation');
    const cancel = await S('POST', T(ccA) + '/cancel', { reason: 'customer left', confirm: true, idempotencyKey: key() });
    assert(cancel.status === 200, 'cancelled');
    const dCancelled = await overview(ccA);
    assert(dCancelled.subscription.status === 'CANCELLED' && dCancelled.subscription.cancelledAt, 'CANCELLED with timestamp');
    const cnt = await counts();
    assert(cnt.students >= 5, 'cancellation deleted no data');
    const growC = await admit(ownerA, idsA);
    assert(growC.status === 403 && codeOf(growC) === 'SUBSCRIPTION_INACTIVE', 'cancelled tenant cannot grow');
    assert((await request('GET', '/api/students', { cookie: ownerA })).status === 200, 'cancelled tenant can still read its data');
    ok('42. Cancel needs reason + confirmation; data preserved; growth stops; reading still works');
    for (const [p, body] of [['/renew', { duration: { unit: 'MONTHS', value: 1 } }], ['/extend', { days: 5 }], ['/change-plan', { planId: growth.id, reason: 'try', confirm: true }]] as const) {
      const r = await S('POST', T(ccA) + p, body);
      assert(r.status === 409 && codeOf(r) === 'INVALID_TRANSITION', `${p} on a cancelled subscription refused: ${r.status} ${JSON.stringify(r.body)}`);
    }
    assert((await S('POST', T(ccA) + '/cancel', { reason: 'again', confirm: true })).body.error === 'INVALID_TRANSITION', 'cancelling twice refused');
    assert((await S('POST', T(ccC) + '/restore', { duration: { unit: 'MONTHS', value: 1 }, reason: 'nope', confirm: true })).body.error === 'INVALID_TRANSITION', 'only a cancelled subscription can be restored');
    ok('43. Invalid lifecycle transitions rejected (renew/extend/change on cancelled, double cancel, restore of non-cancelled)');
    const restore = await S('POST', T(ccA) + '/restore', { duration: { unit: 'MONTHS', value: 2 }, reason: 'customer returned', confirm: true, idempotencyKey: key() });
    assert(restore.status === 200 && (await overview(ccA)).subscription.status === 'ACTIVE', 'restored');
    near((await dbSub(ccA)).endDate, addCalendarMonths(new Date(), 2), 120_000, 'restored period starts today');
    assert((await admit(ownerA, idsA)).status === 201, 'restored tenant can grow');
    ok('44. Restore a cancelled subscription → ACTIVE, fresh period from today, growth works');
    await prisma.subscription.update({ where: { coachingCenterId: ccA }, data: { status: 'PAST_DUE', endDate: addDays(new Date(), 3) } });
    assert((await admit(ownerA, idsA)).status === 201, 'PAST_DUE is a grace state');
    const pdOwner = await request('GET', '/api/settings/subscription', { cookie: ownerA });
    assert(pdOwner.body.notice.kind === 'PAST_DUE', `past-due notice: ${JSON.stringify(pdOwner.body.notice)}`);
    await prisma.subscription.update({ where: { coachingCenterId: ccA }, data: { status: 'ACTIVE', endDate: addDays(new Date(), 4) } });
    assert((await request('GET', '/api/settings/subscription', { cookie: ownerA })).body.notice.kind === 'EXPIRING_SOON', 'expiring-soon notice');
    ok('45. Past-due is a grace state with its own notice; expiring-soon notice appears within 7 days');

    // ---------- AUTHORIZATION / ISOLATION ----------
    const ops: Array<[string, string, unknown]> = [
      ['POST', T(ccA) + '/assign', { planId: growth.id, mode: 'PAID', duration: { unit: 'MONTHS', value: 1 } }],
      ['POST', T(ccA) + '/renew', { duration: { unit: 'MONTHS', value: 1 } }],
      ['POST', T(ccA) + '/extend', { days: 5 }],
      ['POST', T(ccA) + '/change-plan', { planId: growth.id, reason: 'x1', confirm: true }],
      ['POST', T(ccA) + '/trial', { action: 'extend', days: 3 }],
      ['POST', T(ccA) + '/cancel', { reason: 'x1x', confirm: true }],
      ['POST', T(ccA) + '/restore', { duration: { unit: 'MONTHS', value: 1 }, reason: 'x1x', confirm: true }],
      ['PUT', T(ccA) + '/overrides', { limits: { maxStudents: 9999 }, features: {}, reason: 'x1x' }],
      ['PUT', `/coaching-centers/${ccA}/status`, { status: 'SUSPENDED', reason: 'x1x' }],
      ['GET', T(ccA), undefined],
      ['GET', T(ccA) + '/history', undefined],
      ['GET', '/coaching-centers', undefined],
    ];
    const snap = JSON.stringify(await dbSub(ccA));
    for (const [label, cookie] of [['OWNER', ownerA], ['ADMIN', adminA], ['STAFF', staffA], ['TEACHER', teacherA], ['other tenant OWNER', ownerB], ['anonymous', undefined]] as const) {
      for (const [m, p, body] of ops) {
        const r = await request(m, `/api/super-admin${p}`, { cookie, payload: body });
        assert(r.status === 401 || r.status === 403, `${label} must not reach ${m} ${p}, got ${r.status}`);
      }
    }
    assert(JSON.stringify(await dbSub(ccA)) === snap, 'no tenant user changed any subscription state');
    assert((await prisma.coachingCenter.findUniqueOrThrow({ where: { id: ccA } })).status === 'ACTIVE', 'tenant users could not suspend');
    ok('46-51. OWNER, ADMIN, STAFF, TEACHER, another tenant\'s OWNER and anonymous callers are refused on every subscription operation; state untouched');
    for (const m of ['PUT', 'POST', 'PATCH', 'DELETE']) {
      const r = await request(m, '/api/settings/subscription', { cookie: ownerA, payload: { status: 'ACTIVE' } });
      assert(r.status === 405 || r.status === 404, `tenant subscription endpoint is read-only (${m} → ${r.status})`);
    }
    const iso = await request('GET', `/api/settings/subscription?tenantId=${ccB}`, { cookie: ownerA });
    const isoB = await request('GET', '/api/settings/subscription', { cookie: ownerB });
    assert(iso.status === 200 && JSON.stringify(iso.body) !== JSON.stringify(isoB.body) && !JSON.stringify(iso.body).includes(ccB), 'a client-supplied tenantId is ignored: OWNER A always sees tenant A');
    assert(!JSON.stringify(iso.body).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/), 'tenant view exposes no internal ids');
    ok('52-53. OWNER page is read-only (no write methods); tenant isolation: client-supplied tenant ids are ignored and no ids leak');

    // ---------- CONCURRENCY: plan changes, and plan change during creation ----------
    const cc1 = await S('POST', T(ccA) + '/change-plan', { planId: growth.id, reason: 'reset for concurrency', confirm: true, idempotencyKey: key() });
    assert(cc1.status === 200, `reset: ${JSON.stringify(cc1.body)}`);
    const [pcA, pcB] = await Promise.all([S('POST', T(ccA) + '/change-plan', { planId: pro.id, reason: 'race one', confirm: true, idempotencyKey: key() }), S('POST', T(ccA) + '/change-plan', { planId: starter.id, reason: 'race two', confirm: true, idempotencyKey: key() })]);
    assert(pcA.status === 200 && pcB.status === 200, `both concurrent plan changes succeed: ${pcA.status}/${pcB.status}`);
    const finalSub = await dbSub(ccA);
    const snapPlan = (finalSub.planSnapshot as any).planName as string;
    const expectedByPlan: Record<string, number> = { [starter.id]: 2, [pro.id]: 80 };
    assert(expectedByPlan[finalSub.planId] !== undefined && snapPlan.includes(finalSub.planId === starter.id ? 'STARTER' : 'PRO'), 'final planId and snapshot belong to the SAME plan (no mixed state)');
    eq((await overview(ccA)).limits.find((l: any) => l.key === 'maxStudents').effective, expectedByPlan[finalSub.planId], 'effective limits match the winning plan');
    eq(await prisma.subscription.count({ where: { coachingCenterId: ccA } }), 1, 'one subscription row');
    ok('54. Concurrent plan changes end in one consistent state (planId, snapshot and limits agree)');
    await S('POST', T(ccA) + '/change-plan', { planId: pro.id, reason: 'race reset', confirm: true, idempotencyKey: key() }).catch(() => null);
    await S('POST', T(ccA) + '/resync', { reason: 'apply', confirm: true }).catch(() => null);
    const race = await Promise.all([
      ...Array.from({ length: 6 }, () => admit(ownerA, idsA)),
      S('POST', T(ccA) + '/change-plan', { planId: starter.id, reason: 'race during creation', confirm: true, idempotencyKey: key() }),
    ]);
    const statuses = race.slice(0, 6).map((r) => r.status);
    assert(statuses.every((s) => s === 201 || s === 403), `no server errors while the subscription changes mid-creation: ${statuses}`);
    assert(race[6].status === 200 || race[6].status === 400, 'the plan change itself completed or was a clean no-op');
    const after = await overview(ccA);
    const endSub = await dbSub(ccA);
    assert(endSub.planId === starter.id && (endSub.planSnapshot as any).planName.includes('STARTER') && after.limits.find((l: any) => l.key === 'maxStudents').effective === 2, 'final subscription is the consistent STARTER state');
    const refused = race.slice(0, 6).filter((r) => r.status === 403).every((r) => ['STUDENT_LIMIT_REACHED'].includes(codeOf(r)));
    assert(refused, 'every refusal was a clean limit refusal');
    const blockedNow = await admit(ownerA, idsA);
    assert(blockedNow.status === 403 && codeOf(blockedNow) === 'STUDENT_LIMIT_REACHED', 'after the change the new (lower) limit is what creation sees');
    ok('55. Subscription change during concurrent student creation: no errors, consistent state, new limit enforced afterwards');

    // ---------- ENFORCEMENT AFTER ASSIGNING A PLAN TO A PREVIOUSLY UNRESTRICTED TENANT ----------
    const assignB = await S('POST', T(ccB) + '/assign', { planId: starter.id, mode: 'PAID', duration: { unit: 'MONTHS', value: 1 }, reason: 'first plan' });
    assert(assignB.status === 200, `assign to existing tenant: ${JSON.stringify(assignB.body)}`);
    eq(await prisma.student.count({ where: { coachingCenterId: ccB } }), 3, 'existing tenant data untouched by assignment');
    const enforcedB = await admit(ownerB, idsB);
    assert(enforcedB.status === 403 && codeOf(enforcedB) === 'STUDENT_LIMIT_REACHED', `enforced after assignment (3 students vs limit 2): ${enforcedB.status} ${JSON.stringify(enforcedB.body)}`);
    const legacyAfter = await S('GET', '/coaching-centers?category=LEGACY&pageSize=100');
    assert(!legacyAfter.body.tenants.some((x: any) => x.id === ccB), 'the tenant leaves the "no subscription" list');
    ok('56-58. Assign a plan to an existing tenant: it leaves the no-subscription list, data untouched, limits now enforced');

    // ---------- LIST / FILTERS / DASHBOARD ----------
    const byPlan = await S('GET', `/coaching-centers?planId=${starter.id}&pageSize=100`);
    assert(byPlan.body.tenants.length >= 2 && byPlan.body.tenants.every((x: any) => x.plan?.name === 'STARTER'), 'filter by plan');
    const trials = await S('GET', '/coaching-centers?kind=trial&pageSize=100');
    assert(trials.body.tenants.some((x: any) => x.id === ccD) && trials.body.tenants.every((x: any) => x.isTrial), 'filter: trial only');
    const paid = await S('GET', '/coaching-centers?kind=paid&pageSize=100');
    assert(paid.body.tenants.some((x: any) => x.id === ccA) && paid.body.tenants.every((x: any) => x.isTrial === false), 'filter: paid only');
    const bySearchEmail = await S('GET', `/coaching-centers?search=${encodeURIComponent(tD.owner.email)}`);
    assert(bySearchEmail.body.tenants.length === 1 && bySearchEmail.body.tenants[0].id === ccD, 'search by owner email');
    const ownerPhone = (await prisma.user.findFirstOrThrow({ where: { coachingCenterId: ccD, email: tD.owner.email } })).phone!;
    const bySearchPhone = await S('GET', `/coaching-centers?search=${encodeURIComponent(ownerPhone)}`);
    assert(bySearchPhone.body.tenants.some((x: any) => x.id === ccD), 'search by owner phone');
    const rowD = trials.body.tenants.find((x: any) => x.id === ccD);
    assert(rowD.startDate && rowD.subscriptionEnd && rowD.limits && rowD.limits.maxStudents === 10, 'list rows carry start date, expiry and effective limits');
    const susp2 = await S('GET', '/coaching-centers?category=EXPIRED&pageSize=100');
    assert(Array.isArray(susp2.body.tenants), 'expired filter works');
    const dash = (await S('GET', '/dashboard')).body.dashboard;
    const t = dash.tenants;
    eq(t.total, t.ACTIVE + t.TRIAL + t.PAST_DUE + t.EXPIRED + t.CANCELLED + t.SUSPENDED + t.LEGACY, 'dashboard categories add up to the total (all from the database)');
    const dbTotal = await prisma.coachingCenter.count();
    eq(t.total, dbTotal, 'dashboard total equals the real tenant count');
    ok('59-61. Tenant list filters (plan, trial, paid, status) and owner email/phone search; rows show start/expiry/effective limits; dashboard adds up to the real total');

    // ---------- AUDIT ----------
    const logs = await prisma.platformAuditLog.findMany({ where: { OR: [{ coachingCenterId: { in: created.centers } }, { platformAdminId: pAdmin.id }] } });
    const actions = new Set(logs.map((l) => l.action));
    for (const a of ['SUBSCRIPTION_ASSIGNED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION_PLAN_CHANGED', 'SUBSCRIPTION_PLAN_RESYNCED', 'SUBSCRIPTION_TRIAL_STARTED', 'SUBSCRIPTION_TRIAL_EXTENDED', 'SUBSCRIPTION_TRIAL_ENDED', 'SUBSCRIPTION_TRIAL_CONVERTED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_RESTORED', 'SUBSCRIPTION_OVERRIDE_UPDATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED']) {
      assert(actions.has(a), `audit action ${a} missing (have ${[...actions].join(', ')})`);
    }
    const planChanged = logs.find((l) => l.action === 'SUBSCRIPTION_PLAN_CHANGED' && (l.details as any).reason === 'customer downgraded')!;
    const pd = planChanged.details as any;
    assert(pd.direction === 'DOWNGRADE' && pd.before && pd.after && pd.before.planVersion && planChanged.platformAdminId === pAdmin.id && planChanged.coachingCenterId === ccA && planChanged.createdAt, 'plan-change audit has actor, tenant, before/after, reason, direction, timestamp');
    const dump = JSON.stringify(logs);
    assert(!dump.includes(PW) && !dump.includes(PLATFORM_PW) && !/passwordHash|scrypt/i.test(dump), 'no password/secret in the audit trail');
    ok('62-63. Every subscription operation is audited (actor, tenant, before/after, reason, time); no secrets logged');

    // ---------- extra safety checks ----------
    const fullHist = (await S('GET', T(ccA) + '/history')).body.history as Array<{ at: string; action: string; by: string | null }>;
    assert(fullHist.length >= 12, `history is populated: ${fullHist.length}`);
    assert(fullHist.every((h, i) => i === 0 || new Date(fullHist[i - 1].at).getTime() >= new Date(h.at).getTime()), 'history is newest-first');
    assert(fullHist.every((h) => h.by === 'Ops Admin') && new Set(fullHist.map((h) => h.action)).size >= 8, 'every history entry names the acting platform admin; many distinct event types');
    ok('64. Subscription history: newest first, every entry attributed, covers the full lifecycle');

    const ghost = '00000000-0000-4000-8000-000000000000';
    const g1 = await S('POST', T(ghost) + '/renew', { duration: { unit: 'MONTHS', value: 1 } });
    const g2 = await S('POST', T(ccB) + '/change-plan', { planId: ghost, reason: 'ghost plan', confirm: true });
    const g3 = await S('GET', T(ghost));
    assert(g1.status === 404 && g2.status === 404 && g3.status === 404, `unknown tenant / plan ids are refused server-side: ${g1.status}/${g2.status}/${g3.status}`);
    ok('65. Unknown tenant ids and plan ids are verified server-side and refused (404); nothing trusted from the client');

    const snapBad = JSON.stringify(await dbSub(ccA));
    const badBodies = await Promise.all([
      request('POST', `/api/super-admin${T(ccA)}/renew`, { cookie: sa, payload: 'not-an-object' }),
      request('POST', `/api/super-admin${T(ccA)}/extend`, { cookie: sa, payload: {} }),
      request('PUT', `/api/super-admin${T(ccA)}/overrides`, { cookie: sa, payload: { limits: { maxStudents: 5 } } }),
    ]);
    assert(badBodies.every((r) => r.status === 400), `malformed requests are 400: ${badBodies.map((r) => r.status)}`);
    assert(JSON.stringify(await dbSub(ccA)) === snapBad, 'malformed requests changed nothing');
    ok('66. Malformed / incomplete requests are rejected with 400 and leave the subscription untouched');

    console.log('\n========================================================');
    console.log(`ALL PHASE 11.5 CHECKS PASSED (${passed})`);
    console.log('========================================================');
  } finally {
    console.log('Cleaning up throwaway data...');
    await prisma.platformAuditLog.deleteMany({ where: { OR: [{ coachingCenterId: { in: created.centers } }, { platformAdminId: { in: created.admins } }] } }).catch(() => null);
    for (const id of created.centers) await prisma.coachingCenter.delete({ where: { id } }).catch(() => null);
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
