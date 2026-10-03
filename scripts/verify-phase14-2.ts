import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { RoleCode } from '@prisma/client';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { createSessionToken, verifySessionToken, type SessionUser } from '../lib/auth/session';
import {
  ALL_PERMISSION_CODES,
  DEFAULT_ROLE_PERMISSIONS,
  OWNER_LOCKED_CODES,
  can,
  canAny,
  defaultPermissionsFor,
  type PermissionCode,
} from '../lib/auth/permissions';
import { NAV_ITEMS, bottomNavigation, filterNavigation, isNavActive, type NavItem } from '../lib/navigation';
import { ROUTE_RULES, canAccessRoute, getRouteRequirement, isUnguardedPath } from '../lib/route-access';
import { updateRolePermissions, getTenantRolePermissions } from '../lib/services/permission.service';
import type { RouteAuthEntry } from './phase14-2/types';
import { entries as academic } from './phase14-2/manifest.academic';
import { entries as attendanceExams } from './phase14-2/manifest.attendance_exams';
import { entries as content } from './phase14-2/manifest.content';
import { entries as finance } from './phase14-2/manifest.finance';
import { entries as platform } from './phase14-2/manifest.platform';

/**
 * Phase 14.2 — permission-driven navigation, page guards and API authorization.
 *
 * Static + pure checks always run. Live checks (HTTP against the running app,
 * real sessions, real permission changes) run when BASE_URL (default
 * http://localhost:3000) answers; otherwise they are reported as SKIPPED.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TAG = `P142VERIFY-${Date.now()}`;
const PW = 'Password123!';
const ROOT = process.cwd();
const FAKE = '00000000-0000-0000-0000-000000000000';

let passed = 0;
let skipped = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`✔ ${label}`);
};
const skip = (label: string) => {
  skipped += 1;
  console.log(`○ SKIPPED (server not reachable): ${label}`);
};
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
const ROLES: RoleCode[] = ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'];

const ENTRIES: RouteAuthEntry[] = [...academic, ...attendanceExams, ...content, ...finance, ...platform];

const user = (role: RoleCode, permissions: readonly string[] = defaultPermissionsFor(role)) => ({ role, permissions });

function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, match, out);
    } else if (match(p)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p: string) => fs.readFileSync(p, 'utf8');

/** '/api/students/[studentId]' -> app/api/students/[studentId]/route.ts */
const baseRoute = (route: string) => route.split('#')[0]; // '/api/reports/[category]#finance' -> the dynamic route; one pseudo-entry per category
const routeFile = (route: string) => path.join(ROOT, 'app', baseRoute(route).replace(/^\//, ''), 'route.ts');
/** Concrete URL for a manifest route: dynamic segments -> a fake id; '#cat' pseudo-entries -> that category. */
const urlFor = (route: string) => {
  const [base, cat] = route.split('#');
  return (cat ? base.replace('[category]', cat) : base).replace(/\[[^\]]+\]/g, FAKE);
};

// Endpoints that are intentionally outside the staff permission model.
const EXCLUDED_API = [
  '/api/portal/', '/api/super-admin/', '/api/payments/gateways/', '/api/webhooks/', '/api/auth/',
  '/api/health', '/api/setup', '/api/communication/retry/process-due',
];

async function main() {
  console.log('\n==================================================');
  console.log('Phase 14.2 — Permission-driven Navigation, Pages & APIs');
  console.log('==================================================\n');

  let tenantAId = '';
  let tenantBId = '';

  try {
    // ------------------------------------------------------------------
    // PERMISSION ENGINE (1-4)
    // ------------------------------------------------------------------
    assert(can(user('STAFF'), 'students.read'), 'granted');
    ok('Test 1: permission granted -> access allowed');
    assert(!can(user('STAFF', defaultPermissionsFor('STAFF').filter((c) => c !== 'students.read')), 'students.read'), 'removed');
    ok('Test 2: permission removed -> access denied');
    assert(!can(user('ADMIN'), 'nope.nothing' as PermissionCode) && !can(user('OWNER'), 'nope.nothing' as PermissionCode), 'unknown');
    ok('Test 3: unknown permission -> denied (even for OWNER)');
    assert(ALL_PERMISSION_CODES.every((c) => can(user('OWNER', []), c)), 'owner');
    ok('Test 4: OWNER -> allowed for every catalogued permission, independent of stored rows');

    // ------------------------------------------------------------------
    // NAVIGATION (5-10, 34-36)
    // ------------------------------------------------------------------
    const ids = (u: ReturnType<typeof user>, f?: Record<string, boolean>) => filterNavigation(u, f).map((i) => i.id);
    const teacherAll = defaultPermissionsFor('TEACHER');
    assert(ids(user('TEACHER')).includes('attendance') && !ids(user('TEACHER')).includes('fees'), 'baseline teacher nav');
    assert(ids(user('TEACHER', [...teacherAll, 'fees.read'])).includes('fees'), 'granted -> visible');
    ok('Test 5: permission granted -> sidebar item visible');
    assert(!ids(user('STAFF', defaultPermissionsFor('STAFF').filter((c) => c !== 'students.read'))).includes('students'), 'removed -> hidden');
    ok('Test 6: permission removed -> sidebar item hidden');
    const staffNoFees = user('STAFF', defaultPermissionsFor('STAFF').filter((c) => c !== 'fees.read'));
    const drawer = filterNavigation(staffNoFees, null);
    assert(!drawer.some((i) => i.id === 'fees'), 'drawer hides fees');
    ok('Test 7: permission removed -> mobile drawer hidden (drawer uses the same filterNavigation result)');
    const bottom = bottomNavigation(drawer).map((i) => i.id);
    assert(!bottom.includes('fees') && bottom.includes('students'), `bottom nav ${bottom}`);
    assert(bottomNavigation(filterNavigation(user('STAFF'), null)).map((i) => i.id).includes('fees'), 'bottom nav shows fees when granted');
    ok('Test 8: permission removed -> bottom nav hidden (and shown again when granted)');
    const tree: NavItem[] = [
      { id: 'finance', icon: 'wallet', href: '/finance', children: [
        { id: 'fees', icon: 'wallet', href: '/fees', permission: 'fees.read' },
        { id: 'salary', icon: 'banknote', href: '/salary', permission: 'salary.read' },
        { id: 'reports', icon: 'doc', href: '/reports/finance', permission: 'reports.finance.read' },
      ] },
    ];
    const noFin = user('TEACHER');
    assert(filterNavigation(noFin, null, tree).length === 0, 'empty parent hidden');
    assert(filterNavigation(user('TEACHER', ['salary.read']), null, tree)[0]?.children?.length === 1, 'parent shows only visible children');
    ok('Test 9: parent section disappears when all children disappear');
    const adminU = user('ADMIN');
    assert(ids(adminU, { HOMEWORK: true }).includes('homework') && !ids(adminU, { HOMEWORK: false }).includes('homework'), 'feature off hides');
    assert(!ids(user('ADMIN', defaultPermissionsFor('ADMIN').filter((c) => c !== 'homework.read')), { HOMEWORK: true }).includes('homework'), 'permission off hides');
    assert(!ids(adminU, { ADVANCED_REPORTS: false }).includes('reports'), 'reports feature');
    assert(ids(user('TEACHER', ['reports.teachers.read']), { ADVANCED_REPORTS: true }).includes('reports'), 'one report permission is enough');
    ok('Test 10: feature flag AND permission are both required');

    // 34-36
    const sidebarSrc = read(path.join(ROOT, 'components/Sidebar.tsx'));
    const mobileSrc = read(path.join(ROOT, 'components/MobileNav.tsx'));
    assert(/from '@\/lib\/navigation'/.test(sidebarSrc) && /from '@\/lib\/navigation'/.test(mobileSrc), 'both import lib/navigation');
    assert(/filterNavigation\(/.test(sidebarSrc) && /filterNavigation\(/.test(mobileSrc) && /bottomNavigation\(/.test(mobileSrc), 'both call the shared filter');
    for (const [n, src] of [['Sidebar', sidebarSrc], ['MobileNav', mobileSrc]] as const) {
      assert(!/const (NAV_ITEMS|BOTTOM_ITEMS)\b/.test(src) && !/staffOnly/.test(src), `${n} has no private nav list / staffOnly`);
    }
    const everywhere = walk(path.join(ROOT, 'components'), (f) => /\.(tsx|ts)$/.test(f)).concat(walk(path.join(ROOT, 'app'), (f) => /\.(tsx|ts)$/.test(f)));
    const staffOnlyHits = everywhere.filter((f) => /staffOnly/.test(read(f)));
    assert(staffOnlyHits.length === 0, `staffOnly remains: ${staffOnlyHits.map(rel)}`);
    ok('Test 34: desktop sidebar, drawer and bottom bar all consume the single lib/navigation config (no private lists, no staffOnly)');
    const ownerFallback = everywhere.filter((f) => /(role|Role)\s*\|\|\s*'OWNER'/.test(read(f)));
    assert(ownerFallback.length === 0, `Owner fallback remains: ${ownerFallback.map(rel)}`);
    assert(filterNavigation(null, null).length === 0 && bottomNavigation(filterNavigation(undefined, null)).length === 0, 'null user sees nothing');
    assert(!canAccessRoute(null, '/dashboard') && !canAccessRoute(undefined, '/students'), 'null user cannot access pages');
    const appShell = read(path.join(ROOT, 'components/AppShell.tsx'));
    assert(/authStatus/.test(appShell) && /canAccessRoute/.test(appShell), 'shell uses auth status + route guard');
    ok('Test 35: no Owner fallback anywhere; loading/logged-out users see no navigation and cannot pass the page guard');
    assert(isNavActive('/students/123/edit', '/students') && isNavActive('/fees/invoices', '/fees') && isNavActive('/', '/dashboard'), 'nested active');
    assert(!isNavActive('/students-archive', '/students') && !isNavActive('/exams', '/exam'), 'no false prefix match');
    ok('Test 36: nested-route active state works on real path segments (no false prefix matches)');

    // ------------------------------------------------------------------
    // PAGE GUARDS (11-14) — pure
    // ------------------------------------------------------------------
    const pageFiles = walk(path.join(ROOT, 'app'), (f) => f.endsWith(`${path.sep}page.tsx`) && !f.includes(`${path.sep}api${path.sep}`));
    const pageRoutes = pageFiles
      .map((f) => '/' + rel(path.dirname(f)).replace(/^app\/?/, ''))
      .map((r) => r.replace(/\([^)]*\)\/?/g, '').replace(/\/$/, '') || '/')
      .map((r) => r.replace(/\[[^\]]+\]/g, 'x'));
    const staffPages = pageRoutes.filter((r) => !isUnguardedPath(r));
    const unruled = staffPages.filter((r) => !getRouteRequirement(r));
    assert(unruled.length === 0, `staff pages with no access rule: ${unruled}`);
    ok(`Page coverage: all ${staffPages.length} staff pages resolve to an access rule (unknown pages are denied by default)`);
    assert(!canAccessRoute(user('TEACHER'), '/fees') && !canAccessRoute(user('TEACHER'), '/fees/invoices/x') && !canAccessRoute(user('TEACHER'), '/salary'), 'teacher blocked');
    assert(canAccessRoute(user('TEACHER', [...teacherAll, 'fees.read']), '/fees'), 'granted -> allowed');
    assert(!canAccessRoute(user('TEACHER'), '/unknown/page') && !canAccessRoute(user('OWNER'), '/unknown/page'), 'unknown page denied by default');
    ok('Test 11: hidden module direct URL -> forbidden (page guard), including unknown pages');
    assert(canAccessRoute(user('TEACHER'), '/attendance') && canAccessRoute(user('STAFF'), '/students') && canAccessRoute(user('ADMIN'), '/fees'), 'visible allowed');
    assert(canAccessRoute(user('TEACHER'), '/teachers/x'), 'own-profile detail page stays reachable');
    ok('Test 12: visible module direct URL -> accessible');
    assert(!canAccessRoute(user('ADMIN'), '/settings/roles-permissions') && !canAccessRoute(user('ADMIN'), '/settings/subscription') && canAccessRoute(user('OWNER'), '/settings/roles-permissions') && canAccessRoute(user('OWNER'), '/settings/subscription'), 'owner-only pages');
    assert(!canAccessRoute(user('ADMIN', [...ALL_PERMISSION_CODES]), '/settings/subscription'), 'subscription is owner-locked even if a row existed');
    ok('Test 13: Owner-only pages (roles-permissions, subscription) -> non-owner forbidden, even with a stray row');
    assert(!canAccessRoute(null, '/dashboard'), 'logged out');
    const shellSrc = appShell;
    assert(/router\.replace\('\/login'\)/.test(shellSrc) && /unauthenticated/.test(shellSrc), 'redirect to login');
    ok('Test 14: logged-out user -> shell redirects to /login and never mounts the page');
    for (const [pageRoute, perm] of [['/students', 'students.read'], ['/exams', 'exams.read'], ['/reports/finance', 'reports.finance.read'], ['/settings/communication', 'settings.communication.update']] as const) {
      const without = user('ADMIN', defaultPermissionsFor('ADMIN').filter((c) => c !== perm));
      assert(!canAccessRoute(without, pageRoute) && canAccessRoute(user('ADMIN'), pageRoute), pageRoute);
    }
    ok('Per-module page guard: removing the permission blocks the page, restoring it opens it (students, exams, finance report, communication settings)');
    assert(canAccessRoute(user('TEACHER', ['reports.teachers.read']), '/reports/teachers') && !canAccessRoute(user('TEACHER', ['reports.finance.read']), '/reports/students'), 'report categories independent');
    ok('Reports: one category permission never opens another category');

    // ------------------------------------------------------------------
    // ROUTE COMPLETENESS & SOURCE CHECKS
    // ------------------------------------------------------------------
    const apiFiles = walk(path.join(ROOT, 'app/api'), (f) => f.endsWith(`${path.sep}route.ts`));
    const handlerList: { route: string; method: string }[] = [];
    for (const f of apiFiles) {
      const route = '/api/' + rel(path.dirname(f)).replace(/^app\/api\/?/, '');
      const norm = route.replace(/\/$/, '');
      if (EXCLUDED_API.some((x) => norm === x || norm.startsWith(x))) continue;
      for (const m of read(f).matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) handlerList.push({ route: norm, method: m[1] });
    }
    const keyOf = (e: { route: string; method: string }) => `${e.method} ${e.route}`;
    const baseKey = (e: { route: string; method: string }) => `${e.method} ${baseRoute(e.route)}`;
    const manifestKeys = new Set(ENTRIES.map(keyOf));
    assert(manifestKeys.size === ENTRIES.length, `duplicate manifest entries: ${ENTRIES.length - manifestKeys.size}`);
    const manifestBaseKeys = new Set(ENTRIES.map(baseKey));
    const missing = handlerList.filter((h) => !manifestBaseKeys.has(keyOf(h))).map(keyOf);
    assert(missing.length === 0, `handlers with no manifest entry (unaudited): ${missing.join(', ')}`);
    const phantom = ENTRIES.filter((e) => !handlerList.some((h) => keyOf(h) === baseKey(e))).map(keyOf);
    assert(phantom.length === 0, `manifest entries without a handler: ${phantom.join(', ')}`);
    ok(`Completeness: all ${handlerList.length} staff API handlers have exactly one authorization manifest entry`);

    const servicesText = walk(path.join(ROOT, 'lib/services'), (f) => f.endsWith('.ts')).map(read).join('\n') + '\n' + walk(path.join(ROOT, 'lib/reports'), (f) => f.endsWith('.ts')).map(read).join('\n');
    const notEnforced: string[] = [];
    for (const e of ENTRIES) {
      if (!e.permissions) continue;
      const text = read(routeFile(e.route));
      for (const code of e.permissions) {
        if (!text.includes(`'${code}'`) && !servicesText.includes(`'${code}'`)) notEnforced.push(`${keyOf(e)} -> ${code}`);
      }
    }
    assert(notEnforced.length === 0, `permission named in manifest but not referenced by route/service: ${notEnforced.join('; ')}`);
    ok('Every manifest permission is actually referenced by the route (or its service)');

    const routeFilesText = apiFiles.map((f) => ({ f, t: read(f) }));
    const stillRole = routeFilesText.filter(({ t }) => /requireRole\(/.test(t)).map(({ f }) => rel(f));
    const allowedRole = ENTRIES.filter((e) => e.ownerOnlyRole).map((e) => routeFile(e.route)).map(rel);
    const unexpected = stillRole.filter((f) => !allowedRole.includes(f));
    assert(unexpected.length === 0, `requireRole still used in: ${unexpected.join(', ')}`);
    ok(`requireRole remains ONLY on documented Owner-immutable routes (${stillRole.length} files: ${stillRole.map((f) => f.replace('app/api/', '')).join(', ') || 'none'})`);

    // ------------------------------------------------------------------
    // PARITY (30-33)
    // ------------------------------------------------------------------
    const mismatches: string[] = [];
    const tally: Record<string, { oldAllowed: number; newAllowed: number }> = {};
    for (const role of ROLES) tally[role] = { oldAllowed: 0, newAllowed: 0 };
    for (const e of ENTRIES) {
      for (const role of ROLES) {
        const oldAllowed = e.oldRoles === 'ANY' ? true : e.oldRoles.includes(role);
        let newAllowed: boolean;
        if (e.ownerOnlyRole) newAllowed = role === 'OWNER';
        else if (!e.permissions) newAllowed = true;
        else newAllowed = e.permissions.every((p) => can(user(role), p));
        if (e.selfAllowedRoles?.includes(role)) newAllowed = true;
        if (e.residualDeny?.includes(role)) newAllowed = false;
        if (oldAllowed) tally[role].oldAllowed += 1;
        if (newAllowed) tally[role].newAllowed += 1;
        if (oldAllowed !== newAllowed) mismatches.push(`${keyOf(e)} role=${role} old=${oldAllowed} new=${newAllowed} permission=${e.permissions?.join('+') ?? 'none'}`);
      }
    }
    assert(mismatches.length === 0, `PARITY MISMATCHES (${mismatches.length}):\n  ` + mismatches.join('\n  '));
    for (const [role, t] of Object.entries(tally)) console.log(`   parity ${role.padEnd(8)} old-allowed=${t.oldAllowed} new-allowed=${t.newAllowed} of ${ENTRIES.length} handlers`);
    ok('Test 30: ADMIN old/new authorization parity (every handler)');
    ok('Test 31: STAFF old/new authorization parity (every handler)');
    ok('Test 32: TEACHER old/new authorization parity (every handler)');
    ok('Test 33: OWNER behavior preserved (every handler)');

    // CRUD independence (20-23) — pure
    const only = (...c: PermissionCode[]) => user('STAFF', c);
    assert(can(only('students.read'), 'students.read') && !can(only('students.read'), 'students.create'), 'read only');
    ok('Test 20: read is independent from create');
    assert(can(only('students.create'), 'students.create') && !can(only('students.create'), 'students.update'), 'create only');
    ok('Test 21: create is independent from update');
    assert(can(only('courses.update'), 'courses.update') && !can(only('courses.update'), 'courses.delete'), 'update only');
    ok('Test 22: update is independent from delete');
    assert(!can(only('salary.generate'), 'salary.pay') && !can(only('salary.pay'), 'salary.finalize') && !can(only('attendance.update'), 'attendance.reopen') && !can(only('exams.publish'), 'exams.reopen'), 'special');
    ok('Test 23: special actions (salary generate/finalize/pay, attendance reopen, exam publish/reopen) are independent');
    assert(OWNER_LOCKED_CODES.every((c) => !can(user('ADMIN', ALL_PERMISSION_CODES), c) && can(user('OWNER'), c)), 'owner locked');
    ok('Owner-locked permissions (fees.discount.approve, settings.subscription.read) stay Owner-only even if granted');
    assert(canAny(user('TEACHER'), ['fees.read', 'attendance.read']) && !canAny(user('TEACHER'), ['fees.read', 'salary.read']), 'canAny');

    // ------------------------------------------------------------------
    // LIVE: tenants, sessions, HTTP
    // ------------------------------------------------------------------
    const serverUp = await fetch(`${BASE_URL}/api/health`).then((r) => r.status < 500).catch(() => false);
    if (!serverUp) {
      for (const l of [
        'Test 15: missing permission -> 403 on every migrated route',
        'Test 16: granted permission -> existing authorization path',
        'Test 17: cross-tenant denied',
        'Test 18: branch isolation still enforced',
        'Test 19: teacher self-scope still enforced',
        'Test 24: tenant A permissions do not affect tenant B',
        'Tests 25-29: live permission change with an existing session',
      ]) skip(l);
    } else {
      const stamp = Date.now().toString().slice(-6);
      const mkSetup = (letter: string, phonePrefix: string) =>
        completeInitialSetup({
          centerName: `Center ${letter} ${TAG}`, centerCode: `T142${letter}${stamp}`, centerPhone: '01711000001',
          centerCity: 'Dhaka', centerDistrict: 'Dhaka', ownerName: `Owner ${letter}`,
          ownerEmail: `owner-t142${letter}${stamp}@test.local`.toLowerCase(), ownerPhone: `${phonePrefix}${Date.now().toString().slice(-8)}`,
          ownerPassword: PW, branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026',
          sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31', selectedPrograms: [], primaryColor: '#063B78', accentColor: '#FFD200',
        } as any);
      const setupA = await mkSetup('A', '017');
      const setupB = await mkSetup('B', '018');
      tenantAId = setupA.center.id;
      tenantBId = setupB.center.id;
      const branch1 = setupA.branch;
      const branch2 = await prisma.branch.create({ data: { coachingCenterId: tenantAId, name: 'Dhanmondi', code: 'DHAN' } });

      const mkAcademic = async (tenantId: string, sessionId: string, tag: string) => {
        const program = await prisma.academicProgram.create({ data: { coachingCenterId: tenantId, name: `HSC${tag}`, code: `HSC${tag}` } });
        const klass = await prisma.academicClass.create({ data: { coachingCenterId: tenantId, academicProgramId: program.id, name: 'Class 12', code: `C12${tag}` } });
        const subject = await prisma.subject.create({ data: { coachingCenterId: tenantId, academicClassId: klass.id, name: 'Math', code: `MATH${tag}` } });
        const course = await prisma.course.create({ data: { coachingCenterId: tenantId, academicProgramId: program.id, academicClassId: klass.id, name: `Course${tag}`, code: `CRS${tag}`, status: 'ACTIVE' } });
        const mkBatch = (name: string, code: string, branchId: string) =>
          prisma.batch.create({ data: { coachingCenterId: tenantId, branchId, academicSessionId: sessionId, academicProgramId: program.id, academicClassId: klass.id, courseId: course.id, name, code, status: 'ACTIVE' } });
        return { subject, mkBatch };
      };
      const acA = await mkAcademic(tenantAId, setupA.session.id, 'A');
      const acB = await mkAcademic(tenantBId, setupB.session.id, 'B');
      const batchA1 = await acA.mkBatch('Morning', 'MORN', branch1.id);
      const batchA2 = await acA.mkBatch('Dhanmondi', 'DHAN', branch2.id);
      const batchB1 = await acB.mkBatch('Morning B', 'MORNB', setupB.branch.id);

      const mkUser = async (tenantId: string, branchId: string | null, role: 'ADMIN' | 'STAFF' | 'TEACHER', n: number, label = role.toLowerCase()) => {
        const roleRow = await prisma.role.findFirstOrThrow({ where: { coachingCenterId: tenantId, code: role } });
        return prisma.user.create({
          data: {
            coachingCenterId: tenantId, branchId, email: `${label}-${tenantId.slice(0, 4)}-${stamp}@test.local`,
            phone: `01${3 + n}${Date.now().toString().slice(-8)}`, name: `${label} ${tenantId.slice(0, 4)}`,
            passwordHash: hashPassword(PW), status: 'ACTIVE',
            roleAssignments: { create: { roleId: roleRow.id, branchId } },
          },
        });
      };
      const adminA = await mkUser(tenantAId, branch1.id, 'ADMIN', 1);
      const staffA = await mkUser(tenantAId, branch1.id, 'STAFF', 2);
      const teacherUserA = await mkUser(tenantAId, branch1.id, 'TEACHER', 3);
      const teacherUserA2 = await mkUser(tenantAId, branch1.id, 'TEACHER', 4, 'teacher2');
      const staffB = await mkUser(tenantBId, setupB.branch.id, 'STAFF', 5);
      const tA = await prisma.teacher.create({ data: { coachingCenterId: tenantAId, branchId: branch1.id, teacherCode: 'T1', name: 'Teacher One', phone: '01911111111', userId: teacherUserA.id } });
      const tA2 = await prisma.teacher.create({ data: { coachingCenterId: tenantAId, branchId: branch1.id, teacherCode: 'T2', name: 'Teacher Two', phone: '01922222222', userId: teacherUserA2.id } });
      const mkSchedule = (teacherId: string) =>
        prisma.classSchedule.create({
          data: { coachingCenterId: tenantAId, branchId: branch1.id, batchId: batchA1.id, subjectId: acA.subject.id, teacherId, dayOfWeek: 'SUNDAY', startTime: '10:00', endTime: '11:00', status: 'ACTIVE' } as any,
        });
      const schedOwn = await mkSchedule(tA.id);
      const schedOther = await mkSchedule(tA2.id);

      // Sessions (one per role). Login budget: 5 (+1 owner B).
      const cookies: Record<string, string> = {};
      const login = async (email: string) => {
        const res = await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
        assert(res.ok, `login ${email} -> ${res.status}`);
        const set = res.headers.getSetCookie().find((c) => c.startsWith('coaching_os_session='));
        assert(set, 'session cookie');
        return set.split(';')[0];
      };
      cookies.owner = await login(setupA.owner.email);
      cookies.admin = await login(adminA.email);
      cookies.staff = await login(staffA.email);
      cookies.teacher = await login(teacherUserA.email);
      cookies.staffB = await login(staffB.email);
      const call = (who: string, method: string, route: string, body?: unknown) =>
        fetch(`${BASE_URL}${urlFor(route)}`, {
          method,
          headers: { cookie: cookies[who], 'Content-Type': 'application/json' },
          body: body === undefined ? (method === 'GET' || method === 'DELETE' ? undefined : '{}') : JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.timeout(90_000),
        }).then((r) => {
          return r;
        }).catch((e) => {
          throw new Error(`request ${method} ${route} failed/timed out: ${e instanceof Error ? e.message : e}`);
        });
      const ownerSession = async () => (await verifySessionToken(await createSessionToken({ userId: setupA.owner.id, sessionVersion: 0 }))) as SessionUser;
      const ownerA = await ownerSession();
      // Remote-DB friendly: a transaction that cannot start in time (P2028) is retried; real errors still throw.
      const setRole = async (role: 'ADMIN' | 'STAFF' | 'TEACHER', codes: readonly PermissionCode[]) => {
        for (let attempt = 1; ; attempt++) {
          try {
            return await updateRolePermissions(ownerA, role, [...codes]);
          } catch (e) {
            if (attempt >= 4 || (e as { code?: string })?.code !== 'P2028') throw e;
          }
        }
      };
      const reset = async () => {
        for (const r of ['ADMIN', 'STAFF', 'TEACHER'] as const) await setRole(r, DEFAULT_ROLE_PERMISSIONS[r]);
      };
      const isPermissionDenied = async (res: Response) => {
        if (res.status !== 403) return false;
        const body = await res.json().catch(() => ({}));
        return typeof body?.error === 'string' && /^forbidden$/i.test(body.error);
      };

      // ---- Test 15: with NO permissions, every migrated route denies (403). ADMIN and TEACHER both.
      await setRole('ADMIN', []);
      await setRole('TEACHER', []);
      await setRole('STAFF', []);
      const skipZero = process.env.SKIP_ZERO === '1';
      const gated = ENTRIES.filter((e) => e.permissions && e.permissions.length > 0 && !e.ownerOnlyRole && !e.residualDeny?.length && !e.selfAllowedRoles?.length);
      const notDenied: string[] = [];
      for (const who of skipZero ? [] : ['teacher', 'admin', 'staff']) {
        for (const e of gated) {
          const res = await call(who, e.method, e.route);
          if (res.status !== 403) notDenied.push(`${who} ${keyOf(e)} -> ${res.status}`);
        }
      }
      assert(notDenied.length === 0, `routes reachable with ZERO permissions:\n  ${notDenied.join('\n  ')}`);
      if (skipZero) console.log('○ Test 15 sweep skipped (SKIP_ZERO=1)');
      else ok(`Test 15: with every permission removed, ${gated.length} gated handlers return 403 for ADMIN, STAFF and TEACHER (${gated.length * 3} live requests)`);
      // owner-only routes
      for (const who of ['admin', 'staff', 'teacher']) {
        assert((await call(who, 'GET', '/api/settings/roles-permissions')).status === 403, `${who} roles-permissions`);
      }
      assert((await call('owner', 'GET', '/api/settings/roles-permissions')).status === 200, 'owner roles-permissions');
      ok('Owner-only routes (roles-permissions) stay Owner-only regardless of permissions');

      // ---- Test 16: with defaults restored, no GET handler is refused for lack of permission.
      await reset();
      const refused: string[] = [];
      for (const who of ['admin', 'staff', 'teacher']) {
        for (const e of ENTRIES.filter((x) => x.method === 'GET' && x.permissions && x.permissions.length > 0 && !x.ownerOnlyRole)) {
          const oldAllowed = e.oldRoles === 'ANY' ? true : e.oldRoles.includes(who.toUpperCase() as RoleCode);
          if (!oldAllowed) continue;
          const t0 = Date.now();
          const res = await call(who, 'GET', e.route);
          if (Date.now() - t0 > 15000) console.log(`   slow (${Math.round((Date.now() - t0) / 1000)}s): ${who} ${keyOf(e)} -> ${res.status}`);
          if (await isPermissionDenied(res)) refused.push(`${who} ${keyOf(e)}`);
          if (res.status === 401) refused.push(`${who} ${keyOf(e)} -> 401`);
        }
      }
      assert(refused.length === 0, `default-permitted GET routes refused:\n  ${refused.join('\n  ')}`);
      ok('Test 16: with default permissions, every GET handler a role could reach before is still reachable (no permission refusal)');

      // ---- Tests 25-29 + CRUD independence over HTTP (STAFF / students)
      const staffGet = async () => (await call('staff', 'GET', '/api/students')).status;
      assert((await staffGet()) === 200, 'staff baseline');
      const staffCodes = DEFAULT_ROLE_PERMISSIONS.STAFF;
      await setRole('STAFF', staffCodes.filter((c) => c !== 'students.read'));
      const afterRemove = await staffGet(); // SAME cookie, next request
      assert(afterRemove === 403, `after removal expected 403 got ${afterRemove}`);
      const meRemoved = (await (await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookies.staff } })).json()).user.permissions as string[];
      assert(!meRemoved.includes('students.read'), '/api/auth/me reflects removal');
      ok('Tests 25-27: permission removed -> the existing session\'s very next request returns 403 (and /api/auth/me reflects it)');
      await setRole('STAFF', staffCodes);
      assert((await staffGet()) === 200, 'after grant expected 200');
      ok('Tests 28-29: permission granted -> the next request succeeds');

      await setRole('STAFF', ['dashboard.read', 'students.read']);
      assert((await call('staff', 'GET', '/api/students')).status === 200, 'read ok');
      assert((await call('staff', 'POST', '/api/students', {})).status === 403, 'create blocked');
      assert((await call('staff', 'PUT', '/api/students/[studentId]', {})).status === 403, 'update blocked');
      await setRole('STAFF', ['dashboard.read', 'students.read', 'students.create']);
      const createStatus = (await call('staff', 'POST', '/api/students', {})).status;
      assert(createStatus !== 403 && createStatus !== 401, `create now reaches validation (${createStatus})`);
      assert((await call('staff', 'PUT', '/api/students/[studentId]', {})).status === 403, 'update still blocked');
      ok('CRUD over HTTP: read, create and update are enforced independently (students.read -> create -> update)');

      // Attendance: remove attendance.update, keep read (task example)
      await reset();
      await setRole('TEACHER', DEFAULT_ROLE_PERMISSIONS.TEACHER.filter((c) => c !== 'attendance.update'));
      assert((await call('teacher', 'GET', '/api/attendance')).status === 200, 'teacher still reads attendance');
      assert((await call('teacher', 'PUT', '/api/attendance/sessions/[sessionId]', { marks: [] })).status === 403, 'marking forbidden without attendance.update');
      ok('Read/update separation: TEACHER without attendance.update still reads Attendance but cannot mark it');

      // ---- Test 19: teacher self-scope still enforced (permission granted, wrong class)
      await reset();
      const today = new Date().toISOString().slice(0, 10);
      const otherRes = await call('teacher', 'POST', '/api/attendance/sessions', { classScheduleId: schedOther.id, date: today });
      const otherBody = await otherRes.json().catch(() => ({}));
      assert(otherRes.status === 403 && /TEACHER_SCOPE/.test(String(otherBody.error)), `other teacher's class must stay forbidden (${otherRes.status} ${JSON.stringify(otherBody)})`);
      const ownRes = await call('teacher', 'POST', '/api/attendance/sessions', { classScheduleId: schedOwn.id, date: today });
      assert(ownRes.status === 200 || ownRes.status === 201, `own class allowed (${ownRes.status})`);
      ok('Test 19: attendance.create is not enough — teacher self-scope still refuses another teacher\'s class (FORBIDDEN_TEACHER_SCOPE) and allows their own');

      // ---- Test 18: branch isolation (STAFF locked to branch 1) ----
      const ownBatch = await call('staff', 'GET', `/api/batches/${batchA1.id}`);
      const otherBranchBatch = await call('staff', 'GET', `/api/batches/${batchA2.id}`);
      assert(ownBatch.status === 200 && otherBranchBatch.status === 403, `branch isolation: own=${ownBatch.status} other=${otherBranchBatch.status}`);
      ok('Test 18: permission does not bypass branch isolation (branch-1 STAFF reads branch-1 batch, 403 on branch-2 batch)');

      // ---- Test 17: cross-tenant ----
      const cross = await call('staff', 'GET', `/api/batches/${batchB1.id}`);
      assert(cross.status === 404 || cross.status === 403, `cross-tenant got ${cross.status}`);
      const crossBody = JSON.stringify(await cross.json().catch(() => ({})));
      assert(!crossBody.includes(batchB1.id) && !crossBody.includes('Morning B'), 'no tenant B data leaked');
      ok(`Test 17: cross-tenant batch is not readable (${cross.status}) and nothing leaks`);

      // ---- Test 24: tenant isolation of permission changes
      await setRole('STAFF', ['dashboard.read']);
      const bStaffPerms = (await (await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: cookies.staffB } })).json()).user.permissions as string[];
      assert(setEqual(bStaffPerms, DEFAULT_ROLE_PERMISSIONS.STAFF), 'tenant B staff unchanged');
      assert((await getTenantRolePermissions(tenantBId)).STAFF.length === DEFAULT_ROLE_PERMISSIONS.STAFF.length, 'tenant B rows unchanged');
      assert((await call('staffB', 'GET', '/api/students')).status === 200, 'tenant B staff still reads students');
      ok('Test 24: removing permissions in tenant A leaves tenant B untouched (session permissions, rows and API access)');

      // ---- Fees example from the task: TEACHER, fees.read
      await reset();
      await setRole('TEACHER', [...DEFAULT_ROLE_PERMISSIONS.TEACHER, 'fees.read']);
      const f1 = (await call('teacher', 'GET', '/api/fees/dashboard')).status;
      assert(f1 !== 403 && f1 !== 401, `teacher with fees.read reaches fees API (${f1})`);
      await setRole('TEACHER', DEFAULT_ROLE_PERMISSIONS.TEACHER);
      assert((await call('teacher', 'GET', '/api/fees/dashboard')).status === 403, 'fees.read removed -> 403');
      ok('Task example: granting/removing fees.read on TEACHER toggles the fees API immediately');
      await reset();
    }

    console.log('\n==================================================');
    console.log(`Phase 14.2 Verification Complete: ${passed} checks passed, ${skipped} skipped`);
    console.log('==================================================\n');
  } finally {
    console.log('Cleaning up test tenants...');
    if (tenantAId) await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch((e) => console.error('cleanup A failed', e?.message));
    if (tenantBId) await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch((e) => console.error('cleanup B failed', e?.message));
    console.log('Cleanup complete.');
    await prisma.$disconnect();
  }
}

function setEqual(a: Iterable<string>, b: Iterable<string>) {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
