import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { createSessionToken, verifySessionToken, type SessionUser } from '../lib/auth/session';
import {
  ALL_PERMISSION_CODES,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  OWNER_LOCKED_CODES,
  PERMISSION_CATALOG,
  can,
  type ConfigurableRole,
  type PermissionCode,
} from '../lib/auth/permissions';
import {
  ensureTenantSystemRoles,
  getTenantRolePermissions,
  resetRolePermissions,
  seedRoleIfConfigurable,
  seedTenantRolePermissions,
  syncPermissionCatalog,
  updateRolePermissions,
} from '../lib/services/permission.service';

/**
 * Phase 14.1 — permission foundation verification.
 *
 * Service-level checks always run. Checks that need the running app
 * (/api/auth/me, the Owner-only routes, audit IP/user-agent through the real
 * route) run when BASE_URL (default http://localhost:3000) answers; otherwise
 * they are reported as SKIPPED — never as passed.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TAG = `P141VERIFY-${Date.now()}`;
const PW = 'Password123!';

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
async function expectError(fn: () => Promise<unknown> | unknown, expected: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(expected), `${label} — expected "${expected}", got "${msg}"`);
    ok(label);
    return;
  }
  throw new Error(`FAIL: ${label} (expected "${expected}", but it succeeded)`);
}
const setEq = (a: Iterable<string>, b: Iterable<string>) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// Independent baseline snapshot (NOT derived from DEFAULT_ROLE_PERMISSIONS) so a
// careless edit of the defaults is caught here.
const BASELINE = {
  ADMIN: {
    allowed: ['fees.refund', 'salary.generate', 'salary.pay', 'settings.users.create', 'attendance.reopen', 'exams.publish', 'compensation.manage', 'portal_accounts.manage', 'reports.finance.read'],
    denied: ['fees.discount.approve', 'settings.subscription.read'],
  },
  STAFF: {
    allowed: ['students.create', 'students.promote', 'teachers.read', 'fees.collect', 'fees.discount.request', 'salary.read', 'salary.pay', 'attendance.update', 'exams.marks.enter', 'reports.finance.read', 'upload.use'],
    denied: ['fees.refund', 'fees.discount.approve', 'fees.structures.create', 'salary.generate', 'salary.finalize', 'salary.cancel', 'settings.users.read', 'attendance.reopen', 'exams.publish', 'courses.create', 'compensation.read'],
  },
  TEACHER: {
    allowed: ['students.read', 'attendance.read', 'attendance.create', 'attendance.update', 'exams.marks.enter', 'homework.create', 'notices.create', 'reports.students.read', 'dashboard.read'],
    denied: ['students.create', 'students.update', 'students.id_card', 'teachers.read', 'reports.teachers.read', 'fees.read', 'salary.read', 'salary.generate', 'salary.pay', 'settings.users.read', 'communication.templates.read', 'reports.finance.read', 'attendance.reopen', 'exams.publish'],
  },
} as const;
const EXPECTED_COUNTS = { total: 111, ADMIN: 109, STAFF: 70, TEACHER: 42 };

async function main() {
  console.log('\n==================================================');
  console.log('Phase 14.1 — Permission Foundation Verification');
  console.log('==================================================\n');

  let tenantAId = '';
  let tenantBId = '';
  const cookies: Record<string, string> = {};
  let serverUp = false;

  try {
    // ------------------------------------------------------------------
    // PERMISSION CATALOG (1-6)
    // ------------------------------------------------------------------
    const codes = PERMISSION_CATALOG.map((p) => p.code);
    assert(new Set(codes).size === codes.length, 'duplicate code');
    ok('Test 1: every permission code is unique');
    assert(PERMISSION_CATALOG.every((p) => p.module && !p.module.includes('.')), 'module');
    ok('Test 2: every permission has a module');
    assert(PERMISSION_CATALOG.every((p) => p.action && `${p.module}.${p.action}` === p.code), 'action');
    ok('Test 3: every permission has an action consistent with its code');
    assert(PERMISSION_CATALOG.every((p) => p.label.trim().length > 0), 'EN label');
    ok('Test 4: every permission has an EN label');
    assert(PERMISSION_CATALOG.every((p) => /[ঀ-৿]/.test(p.bn)), 'BN label');
    ok('Test 5: every permission has a Bengali label (contains Bengali script)');
    assert(new Set(PERMISSION_CATALOG.map((p) => p.label)).size === PERMISSION_CATALOG.length, 'duplicate EN label');
    assert(ALL_PERMISSION_CODES.length === PERMISSION_CATALOG.length, 'catalog length');
    ok('Test 6: no duplicate catalog entries / labels');
    assert(PERMISSION_CATALOG.length === EXPECTED_COUNTS.total, `catalog size ${PERMISSION_CATALOG.length} != ${EXPECTED_COUNTS.total}`);
    assert(setEq(OWNER_LOCKED_CODES, ['fees.discount.approve', 'settings.subscription.read']), 'owner-locked set');
    ok(`Catalog size ${PERMISSION_CATALOG.length}; owner-locked = fees.discount.approve, settings.subscription.read`);

    // ------------------------------------------------------------------
    // Fixtures: two tenants (created through the real onboarding path)
    // ------------------------------------------------------------------
    const stamp = Date.now().toString().slice(-6);
    const mkSetup = (letter: string, phonePrefix: string) =>
      completeInitialSetup({
        centerName: `Center ${letter} ${TAG}`,
        centerCode: `T141${letter}${stamp}`,
        centerPhone: '01711000001',
        centerCity: 'Dhaka',
        centerDistrict: 'Dhaka',
        ownerName: `Owner ${letter}`,
        ownerEmail: `owner-t141${letter}${stamp}@test.local`.toLowerCase(),
        ownerPhone: `${phonePrefix}${Date.now().toString().slice(-8)}`,
        ownerPassword: PW,
        branchName: 'Main Campus',
        branchCode: 'MAIN',
        sessionName: '2026',
        sessionStartDate: '2026-01-01',
        sessionEndDate: '2026-12-31',
        selectedPrograms: [],
        primaryColor: '#063B78',
        accentColor: '#FFD200',
      } as any);
    const setupA = await mkSetup('A', '017');
    const setupB = await mkSetup('B', '018');
    tenantAId = setupA.center.id;
    tenantBId = setupB.center.id;

    const mkUser = async (tenantId: string, branchId: string, role: 'ADMIN' | 'STAFF' | 'TEACHER', n: number) => {
      const roleRow = await prisma.role.findFirstOrThrow({ where: { coachingCenterId: tenantId, code: role } });
      const email = `${role.toLowerCase()}-${tenantId.slice(0, 4)}-${stamp}@test.local`;
      return prisma.user.create({
        data: {
          coachingCenterId: tenantId,
          branchId,
          email,
          phone: `01${6 + n}${Date.now().toString().slice(-8)}`,
          name: `${role} ${tenantId.slice(0, 4)}`,
          passwordHash: hashPassword(PW),
          status: 'ACTIVE',
          roleAssignments: { create: { roleId: roleRow.id, branchId } },
        },
      });
    };
    const adminA = await mkUser(tenantAId, setupA.branch.id, 'ADMIN', 1);
    const staffA = await mkUser(tenantAId, setupA.branch.id, 'STAFF', 2);
    const teacherA = await mkUser(tenantAId, setupA.branch.id, 'TEACHER', 3);
    const teacherB = await mkUser(tenantBId, setupB.branch.id, 'TEACHER', 4);

    const identity = async (userId: string): Promise<SessionUser> => {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
      const token = await createSessionToken({ userId, sessionVersion: u.sessionVersion });
      const id = await verifySessionToken(token);
      assert(id, 'session identity resolves');
      return id;
    };
    const ownerA = await identity(setupA.owner.id);
    const ownerB = await identity(setupB.owner.id);

    // ------------------------------------------------------------------
    // Seeding via the new-tenant path
    // ------------------------------------------------------------------
    const rolesA = await prisma.role.findMany({ where: { coachingCenterId: tenantAId } });
    assert(rolesA.length === 4, 'tenant has four system roles');
    const ownerRoleA = rolesA.find((r) => r.code === 'OWNER')!;
    assert((await prisma.rolePermission.count({ where: { roleId: ownerRoleA.id } })) === 0, 'OWNER role has no RolePermission rows');
    ok('New tenant: OWNER role has 0 RolePermission rows (unrestricted by design)');

    // ------------------------------------------------------------------
    // OWNER (7-8)
    // ------------------------------------------------------------------
    assert(ownerA.role === 'OWNER' && ALL_PERMISSION_CODES.every((c) => can(ownerA, c)), 'owner can everything');
    ok('Test 7: OWNER can() is true for every catalogued permission (no RolePermission rows exist)');
    // Even a stray, partial row set on the OWNER role must not restrict the owner,
    // and a stray row for an owner-locked code on ADMIN must not grant it.
    const permRows = await prisma.permission.findMany({ where: { code: { in: ['students.read', 'fees.discount.approve'] } } });
    const pid = (c: string) => permRows.find((p) => p.code === c)!.id;
    await prisma.rolePermission.create({ data: { roleId: ownerRoleA.id, permissionId: pid('students.read') } });
    const adminRoleA = rolesA.find((r) => r.code === 'ADMIN')!;
    await prisma.rolePermission.create({ data: { roleId: adminRoleA.id, permissionId: pid('fees.discount.approve') } });
    const ownerA2 = await identity(setupA.owner.id);
    assert(ALL_PERMISSION_CODES.every((c) => can(ownerA2, c)), 'owner still unrestricted with stray rows');
    const adminIdStray = await identity(adminA.id);
    assert(!can(adminIdStray, 'fees.discount.approve') && !adminIdStray.permissions?.includes('fees.discount.approve'), 'stray owner-locked row ignored for ADMIN');
    await prisma.rolePermission.deleteMany({ where: { roleId: ownerRoleA.id, permissionId: pid('students.read') } });
    await prisma.rolePermission.deleteMany({ where: { roleId: adminRoleA.id, permissionId: pid('fees.discount.approve') } });
    ok('Test 8: OWNER cannot be restricted via RolePermission; owner-locked codes are ignored for ADMIN even if a row exists');

    // ------------------------------------------------------------------
    // Defaults per role (9, 12, 15)
    // ------------------------------------------------------------------
    const granted = await getTenantRolePermissions(tenantAId);
    for (const r of CONFIGURABLE_ROLES) {
      assert(setEq(granted[r], DEFAULT_ROLE_PERMISSIONS[r]), `${r} defaults persisted`);
      assert(granted[r].length === EXPECTED_COUNTS[r], `${r} count ${granted[r].length} != ${EXPECTED_COUNTS[r]}`);
      for (const c of BASELINE[r].allowed) assert(granted[r].includes(c as PermissionCode), `${r} should have ${c}`);
      for (const c of BASELINE[r].denied) assert(!granted[r].includes(c as PermissionCode), `${r} must not have ${c}`);
    }
    ok(`Test 9: ADMIN defaults match baseline (${EXPECTED_COUNTS.ADMIN} permissions)`);
    ok(`Test 12: STAFF defaults match baseline (${EXPECTED_COUNTS.STAFF} permissions)`);
    ok(`Test 15: TEACHER defaults match baseline (${EXPECTED_COUNTS.TEACHER} permissions)`);

    const idAdmin = await identity(adminA.id);
    const idStaff = await identity(staffA.id);
    const idTeacher = await identity(teacherA.id);
    assert(setEq(idAdmin.permissions ?? [], DEFAULT_ROLE_PERMISSIONS.ADMIN), 'admin identity perms');
    assert(setEq(idStaff.permissions ?? [], DEFAULT_ROLE_PERMISSIONS.STAFF), 'staff identity perms');
    assert(setEq(idTeacher.permissions ?? [], DEFAULT_ROLE_PERMISSIONS.TEACHER), 'teacher identity perms');
    assert(can(idTeacher, 'students.read') && !can(idTeacher, 'students.create') && !can(idTeacher, 'fees.read'), 'teacher can()');
    ok('Session identity carries exactly the role defaults; can() agrees');

    // ------------------------------------------------------------------
    // Custom grant / remove (10, 11, 13, 14, 16, 17) + visibility on next request (27)
    // ------------------------------------------------------------------
    const ctx = { ipAddress: '203.0.113.9', userAgent: `${TAG}-agent` };
    const withChange = async (role: ConfigurableRole, mutate: (s: Set<PermissionCode>) => void) => {
      const cur = new Set((await getTenantRolePermissions(tenantAId))[role]);
      mutate(cur);
      return updateRolePermissions(ownerA, role, [...cur], ctx);
    };

    // ADMIN: remove then grant
    let r = await withChange('ADMIN', (s) => s.delete('fees.refund'));
    assert(r.removed.length === 1 && r.removed[0] === 'fees.refund' && r.added.length === 0, 'diff only removes');
    assert(!can(await identity(adminA.id), 'fees.refund'), 'ADMIN lost fees.refund on next request');
    ok('Test 11: custom ADMIN permission can be removed (effective on the next request)');
    r = await withChange('ADMIN', (s) => s.add('fees.refund'));
    assert(r.added[0] === 'fees.refund' && can(await identity(adminA.id), 'fees.refund'), 'ADMIN regained');
    ok('Test 10: custom ADMIN permission can be granted (effective on the next request)');
    // STAFF
    await withChange('STAFF', (s) => s.add('fees.refund'));
    assert(can(await identity(staffA.id), 'fees.refund'), 'STAFF granted');
    ok('Test 13: custom STAFF permission can be granted');
    await withChange('STAFF', (s) => s.delete('fees.read'));
    assert(!can(await identity(staffA.id), 'fees.read') && can(await identity(staffA.id), 'fees.collect'), 'STAFF removed only the one');
    ok('Test 14: custom STAFF permission can be removed');
    // TEACHER
    await withChange('TEACHER', (s) => s.add('fees.read'));
    assert(can(await identity(teacherA.id), 'fees.read'), 'TEACHER granted');
    ok('Test 16: custom TEACHER permission can be granted');
    await withChange('TEACHER', (s) => s.delete('attendance.create'));
    assert(!can(await identity(teacherA.id), 'attendance.create') && can(await identity(teacherA.id), 'attendance.read'), 'TEACHER removed');
    ok('Test 17: custom TEACHER permission can be removed');
    ok('Test 27 (service): permission changes are visible on the very next session read (no stale cache)');

    // ------------------------------------------------------------------
    // SECURITY (18-22)
    // ------------------------------------------------------------------
    assert(!can(ownerA, 'nope.nothing' as PermissionCode) && !can(idTeacher, 'nope.nothing' as PermissionCode) && !can(null, 'students.read'), 'unknown/none denies');
    assert(!can({ role: 'TEACHER' as const, permissions: undefined }, 'students.read'), 'missing permissions list denies');
    ok('Test 18: unknown permission denies (even for OWNER); missing user / missing permission list denies');
    const { resolvePermissionCodes } = await import('../lib/services/user.service');
    assert(resolvePermissionCodes('TEACHER', undefined).length === 0, 'unloaded permissions deny');
    assert(resolvePermissionCodes('TEACHER', [{ permission: { code: 'bogus.code' } }]).length === 0, 'unknown stored code dropped');
    ok('Fail-closed: unloaded permissions and unknown stored codes yield no access');

    await expectError(() => updateRolePermissions(idAdmin, 'TEACHER', ['students.read']), 'FORBIDDEN', 'Test 19a: ADMIN cannot update RolePermission');
    await expectError(() => updateRolePermissions(idStaff, 'TEACHER', ['students.read']), 'FORBIDDEN', 'Test 19b: STAFF cannot update RolePermission');
    await expectError(() => updateRolePermissions(idTeacher, 'TEACHER', ['students.read']), 'FORBIDDEN', 'Test 19c: TEACHER cannot update RolePermission');
    await expectError(() => resetRolePermissions(idAdmin, 'ADMIN'), 'FORBIDDEN', 'Test 19d: non-owner cannot reset');
    await expectError(() => updateRolePermissions(ownerA, 'OWNER', []), 'INVALID_ROLE', 'OWNER permissions cannot be configured');
    await expectError(() => updateRolePermissions(ownerA, 'ADMIN', ['nope.nothing']), 'INVALID_PERMISSIONS', 'unknown code rejected on save');
    await expectError(() => updateRolePermissions(ownerA, 'ADMIN', ['fees.discount.approve']), 'INVALID_PERMISSIONS', 'owner-locked code cannot be granted to ADMIN');
    await expectError(() => updateRolePermissions(ownerA, 'TEACHER', 'students.read'), 'INVALID_PERMISSIONS', 'non-array payload rejected');

    // Cross-tenant: owner B changes B's TEACHER; tenant A must be untouched.
    const beforeA = JSON.stringify(await getTenantRolePermissions(tenantAId));
    await updateRolePermissions(ownerB, 'TEACHER', ['dashboard.read']);
    const afterA = JSON.stringify(await getTenantRolePermissions(tenantAId));
    assert(beforeA === afterA, 'tenant A unchanged');
    ok('Test 20: cross-tenant role cannot be modified (the role is resolved from the actor\'s own tenant)');
    const bPerms = await getTenantRolePermissions(tenantBId);
    assert(setEq(bPerms.TEACHER, ['dashboard.read']), 'tenant B changed');
    assert(setEq(bPerms.STAFF, DEFAULT_ROLE_PERMISSIONS.STAFF), 'tenant B STAFF still default');
    const aPerms = await getTenantRolePermissions(tenantAId);
    assert(aPerms.TEACHER.includes('fees.read') && aPerms.TEACHER.length > 1, 'tenant A teacher config not leaked from B');
    ok('Test 21: cross-tenant permission configuration does not leak');
    const idTeacherB = await identity(teacherB.id);
    const idTeacherA2 = await identity(teacherA.id);
    assert(setEq(idTeacherB.permissions ?? [], ['dashboard.read']) && !setEq(idTeacherA2.permissions ?? [], idTeacherB.permissions ?? []), 'identities isolated');
    assert(idTeacherB.coachingCenterId === tenantBId && idTeacherA2.coachingCenterId === tenantAId, 'tenant ids intact');
    ok('Test 22: Tenant A permissions do not affect Tenant B (and vice versa)');
    ok('Test 28 (service): tenant isolation intact — identities keep their own coachingCenterId');

    // ------------------------------------------------------------------
    // IDEMPOTENCY (23, 24)
    // ------------------------------------------------------------------
    const countRows = () => prisma.rolePermission.count({ where: { role: { coachingCenterId: { in: [tenantAId, tenantBId] } } } });
    const permCount0 = await prisma.permission.count();
    const rows0 = await countRows();
    const s1 = await syncPermissionCatalog(prisma);
    const seed1 = await seedTenantRolePermissions(prisma, tenantAId, { createdCodes: s1.createdCodes });
    const seed1b = await seedTenantRolePermissions(prisma, tenantBId, { createdCodes: s1.createdCodes });
    const s2 = await syncPermissionCatalog(prisma);
    const seed2 = await seedTenantRolePermissions(prisma, tenantAId, { createdCodes: s2.createdCodes });
    assert(s1.created === 0 && s2.created === 0, 'no permissions created on re-sync');
    assert(seed1.ADMIN + seed1.STAFF + seed1.TEACHER + seed1b.ADMIN + seed1b.STAFF + seed1b.TEACHER + seed2.ADMIN + seed2.STAFF + seed2.TEACHER === 0, 'seed adds nothing');
    assert((await prisma.permission.count()) === permCount0 && (await countRows()) === rows0, 'row counts unchanged');
    ok('Test 23: running sync/seed repeatedly creates no duplicates and adds no rows');
    const afterSync = await getTenantRolePermissions(tenantAId);
    assert(!afterSync.STAFF.includes('fees.read') && afterSync.STAFF.includes('fees.refund'), 'STAFF custom config preserved');
    assert(afterSync.TEACHER.includes('fees.read') && !afterSync.TEACHER.includes('attendance.create'), 'TEACHER custom config preserved');
    ok('Test 24: existing custom permission assignments (grants AND removals) survive a sync');
    // Catalog growth: a code that is "new in this run" is added to roles that already have rows; other removals stay removed.
    await seedTenantRolePermissions(prisma, tenantAId, { createdCodes: new Set(['fees.read']) });
    const grown = await getTenantRolePermissions(tenantAId);
    assert(grown.STAFF.includes('fees.read') && !grown.TEACHER.includes('attendance.create'), 'new-code default added; other removals preserved');
    ok('Catalog growth: a newly created code gets its default, other deliberate removals stay removed');
    await seedTenantRolePermissions(prisma, tenantAId, { restoreMissing: true });
    assert(setEq((await getTenantRolePermissions(tenantAId)).TEACHER, [...DEFAULT_ROLE_PERMISSIONS.TEACHER, 'fees.read']), '--restore-missing-defaults re-adds baseline, keeps extras');
    ok('Opt-in restore re-adds every missing baseline permission and still keeps custom extras');

    // Lazy role creation path gets defaults too.
    await prisma.role.delete({ where: { coachingCenterId_code: { coachingCenterId: tenantBId, code: 'STAFF' } } });
    const rolesB = await ensureTenantSystemRoles(prisma, tenantBId);
    await seedRoleIfConfigurable(prisma, tenantBId, 'STAFF');
    assert(rolesB.has('STAFF') && setEq((await getTenantRolePermissions(tenantBId)).STAFF, DEFAULT_ROLE_PERMISSIONS.STAFF), 'recreated role seeded');
    ok('A lazily (re)created role is seeded with its defaults');

    // ------------------------------------------------------------------
    // Reset + audit (29-31)
    // ------------------------------------------------------------------
    await updateRolePermissions(ownerA, 'TEACHER', ['dashboard.read', 'students.read'], ctx);
    const reset = await resetRolePermissions(ownerA, 'TEACHER', ctx);
    assert(reset.role === 'TEACHER' && setEq((await getTenantRolePermissions(tenantAId)).TEACHER, DEFAULT_ROLE_PERMISSIONS.TEACHER), 'reset to baseline');
    assert((await getTenantRolePermissions(tenantAId)).STAFF.includes('fees.refund'), 'reset touches only the selected role');
    assert(ALL_PERMISSION_CODES.every((c) => can(ownerA, c)), 'owner unaffected');
    ok('Reset to Defaults restores exactly the selected role\'s baseline (other roles and OWNER untouched)');

    const audits = await prisma.auditLog.findMany({
      where: { coachingCenterId: tenantAId, action: { in: ['ROLE_PERMISSIONS_UPDATED', 'ROLE_PERMISSIONS_RESET'] } },
      orderBy: { createdAt: 'asc' },
    });
    const upd = audits.filter((a) => a.action === 'ROLE_PERMISSIONS_UPDATED');
    const rst = audits.filter((a) => a.action === 'ROLE_PERMISSIONS_RESET');
    assert(upd.length >= 7 && rst.length >= 1, 'audit rows exist');
    const lastUpd = upd[upd.length - 1];
    const d = JSON.parse(lastUpd.details as string);
    assert(lastUpd.userId === setupA.owner.id && lastUpd.entity === 'Role' && lastUpd.entityId === rolesA.find((x) => x.code === 'TEACHER')!.id && d.role === 'TEACHER' && Array.isArray(d.added) && Array.isArray(d.removed), 'update audit fields');
    assert(lastUpd.ipAddress === ctx.ipAddress && lastUpd.userAgent === ctx.userAgent, 'audit ip/user-agent');
    ok('Test 29: permission update creates an audit log (actor, tenant, role, added/removed, ip, user-agent, timestamp)');
    const lastRst = rst[rst.length - 1];
    const dr = JSON.parse(lastRst.details as string);
    assert(dr.role === 'TEACHER' && dr.added.length > 0 && lastRst.createdAt instanceof Date && lastRst.ipAddress === ctx.ipAddress, 'reset audit fields');
    ok('Test 30: permission reset creates an audit log');
    const blob = JSON.stringify(audits.map((a) => ({ ...a })));
    assert(!/password|secret|token|hash|cookie/i.test(blob.replace(/ROLE_PERMISSIONS|userAgent|"userId"/g, '')), 'audit contains no secrets');
    assert(Object.keys(d).every((k) => ['role', 'added', 'removed', 'grantedCount'].includes(k)), 'audit details limited to safe keys');
    ok('Test 31: audit log contains no secrets (details limited to role + added/removed codes)');

    // ------------------------------------------------------------------
    // JWT (26)
    // ------------------------------------------------------------------
    const token = await createSessionToken({ userId: teacherA.id, sessionVersion: 0 });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    assert(!('permissions' in payload) && !('role' in payload) && !/students\.read|\.read"/.test(JSON.stringify(payload)), 'jwt has no permissions');
    assert(Object.keys(payload).sort().join(',') === 'exp,iat,sessionVersion,sub,type', `jwt claims unchanged: ${Object.keys(payload)}`);
    ok('Test 26: permission codes are not included in the JWT (claims unchanged: type, sub, sessionVersion, iat, exp)');

    // ------------------------------------------------------------------
    // HTTP (25, 27, route authorization, audit via route)
    // ------------------------------------------------------------------
    serverUp = await fetch(`${BASE_URL}/api/health`).then((r) => r.ok || r.status < 500).catch(() => false);
    if (serverUp) {
      const login = async (email: string) => {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: PW }),
        });
        assert(res.ok, `login ${email} -> ${res.status}`);
        const set = res.headers.getSetCookie().find((c) => c.startsWith('coaching_os_session='));
        assert(set, 'session cookie set');
        return set.split(';')[0];
      };
      const ownerEmail = (await prisma.user.findUniqueOrThrow({ where: { id: setupA.owner.id } })).email;
      cookies.owner = await login(ownerEmail);
      cookies.admin = await login(adminA.email);
      cookies.staff = await login(staffA.email);
      cookies.teacher = await login(teacherA.email);
      cookies.ownerB = await login((await prisma.user.findUniqueOrThrow({ where: { id: setupB.owner.id } })).email);
      const call = (who: string, path: string, init: RequestInit = {}) =>
        fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers || {}), cookie: cookies[who], 'Content-Type': 'application/json', 'user-agent': `${TAG}-http`, 'x-forwarded-for': '198.51.100.7' } });

      // 25: /api/auth/me
      const me = await (await call('teacher', '/api/auth/me')).json();
      assert(Array.isArray(me.user.permissions) && me.user.role === 'TEACHER', 'me.permissions');
      assert(setEq(me.user.permissions, (await getTenantRolePermissions(tenantAId)).TEACHER), 'me.permissions equals role grants');
      const meText = JSON.stringify(me.user);
      assert(!/roleId|permissionId|"role_id"/.test(meText) && me.user.permissions.every((c: string) => typeof c === 'string'), 'me exposes codes only');
      const ownerMe = await (await call('owner', '/api/auth/me')).json();
      assert(setEq(ownerMe.user.permissions, ALL_PERMISSION_CODES), 'owner me lists the catalog');
      ok('Test 25: /api/auth/me returns permission codes (strings only, no role/permission ids)');

      // Owner-only routes
      for (const who of ['admin', 'staff', 'teacher']) {
        assert((await call(who, '/api/settings/roles-permissions')).status === 403, `${who} GET denied`);
        assert((await call(who, '/api/settings/roles-permissions/TEACHER', { method: 'PUT', body: JSON.stringify({ permissions: ['students.read'] }) })).status === 403, `${who} PUT denied`);
        assert((await call(who, '/api/settings/roles-permissions/TEACHER/reset', { method: 'POST' })).status === 403, `${who} reset denied`);
      }
      assert((await fetch(`${BASE_URL}/api/settings/roles-permissions`)).status === 401, 'anonymous GET 401');
      ok('Test 19e: the API independently rejects ADMIN/STAFF/TEACHER (403) and anonymous (401) for read, update and reset');
      const g = await (await call('owner', '/api/settings/roles-permissions')).json();
      assert(g.success && Object.keys(g.roles).sort().join() === 'ADMIN,STAFF,TEACHER' && !JSON.stringify(g).match(/"id"/), 'owner GET shape (codes only)');

      // 27 over HTTP: staff loses a permission, next request sees it
      const staffBefore = (await (await call('staff', '/api/auth/me')).json()).user.permissions as string[];
      assert(staffBefore.includes('fees.collect'), 'staff has fees.collect');
      const cur = new Set((await getTenantRolePermissions(tenantAId)).STAFF);
      cur.delete('fees.collect');
      const put = await call('owner', '/api/settings/roles-permissions/STAFF', { method: 'PUT', body: JSON.stringify({ permissions: [...cur] }) });
      assert(put.status === 200, `owner PUT -> ${put.status}`);
      const staffAfter = (await (await call('staff', '/api/auth/me')).json()).user.permissions as string[];
      assert(!staffAfter.includes('fees.collect'), 'removed permission visible on the next request with the SAME cookie');
      cur.add('fees.collect');
      await call('owner', '/api/settings/roles-permissions/STAFF', { method: 'PUT', body: JSON.stringify({ permissions: [...cur] }) });
      assert((await (await call('staff', '/api/auth/me')).json()).user.permissions.includes('fees.collect'), 'granted permission visible on the next request');
      ok('Test 27: permission removal and grant are visible on the next request over HTTP, same session cookie');

      // bad payloads
      assert((await call('owner', '/api/settings/roles-permissions/OWNER', { method: 'PUT', body: JSON.stringify({ permissions: [] }) })).status === 400, 'OWNER role rejected');
      assert((await call('owner', '/api/settings/roles-permissions/ADMIN', { method: 'PUT', body: JSON.stringify({ permissions: ['fees.discount.approve'] }) })).status === 400, 'locked code rejected');
      assert((await call('owner', '/api/settings/roles-permissions/ADMIN', { method: 'PUT', body: '{not json' })).status === 400, 'malformed body 400');

      // cross-tenant over HTTP
      const aBefore = JSON.stringify(await getTenantRolePermissions(tenantAId));
      assert((await call('ownerB', '/api/settings/roles-permissions/TEACHER', { method: 'PUT', body: JSON.stringify({ permissions: ['dashboard.read', 'students.read'] }) })).status === 200, 'ownerB PUT');
      assert(aBefore === JSON.stringify(await getTenantRolePermissions(tenantAId)), 'tenant A untouched by owner B over HTTP');
      assert((await (await call('teacher', '/api/auth/me')).json()).user.permissions.length === (await getTenantRolePermissions(tenantAId)).TEACHER.length, 'tenant A teacher unaffected');
      ok('Test 28 (HTTP): Tenant B\'s Owner cannot change Tenant A, tenant A sessions unaffected');

      // audit via real route (ip/user-agent from headers)
      const routeAudit = await prisma.auditLog.findFirst({
        where: { coachingCenterId: tenantAId, action: 'ROLE_PERMISSIONS_UPDATED', userAgent: `${TAG}-http` },
        orderBy: { createdAt: 'desc' },
      });
      assert(routeAudit && routeAudit.ipAddress === '198.51.100.7', 'route audit captured ip + user-agent');
      const rr = await call('owner', '/api/settings/roles-permissions/ADMIN/reset', { method: 'POST' });
      assert(rr.status === 200, 'reset route');
      const resetAudit = await prisma.auditLog.findFirst({ where: { coachingCenterId: tenantAId, action: 'ROLE_PERMISSIONS_RESET', userAgent: `${TAG}-http` } });
      assert(resetAudit, 'reset audited through route');
      ok('Audit through the real routes records IP and user-agent for both update and reset');
    } else {
      skip('Test 25: /api/auth/me returns permission codes');
      skip('Test 19e: Owner-only API enforcement (403/401) over HTTP');
      skip('Test 27 (HTTP): next-request visibility with a live session cookie');
      skip('Test 28 (HTTP): cross-tenant over HTTP');
      skip('Audit IP / user-agent through the real routes');
    }

    console.log('\n==================================================');
    console.log(`Phase 14.1 Verification Complete: ${passed} checks passed, ${skipped} skipped`);
    console.log('==================================================\n');
  } finally {
    console.log('Cleaning up test tenants...');
    if (tenantAId) await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch((e) => console.error('cleanup A failed', e?.message));
    if (tenantBId) await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch((e) => console.error('cleanup B failed', e?.message));
    console.log('Cleanup complete.');
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
