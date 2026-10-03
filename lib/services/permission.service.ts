/**
 * Phase 14.1 — persistence for the permission catalog and per-tenant role
 * permissions, on top of the existing `Permission` / `RolePermission` / `Role`
 * tables (no schema change).
 *
 *   Permission (global)  ->  RolePermission  ->  Role (tenant-scoped)
 *
 * Rules enforced here:
 *  - OWNER is unrestricted and never gets RolePermission rows.
 *  - OWNER-locked codes are never stored for a configurable role.
 *  - Sync is additive and idempotent: it never deletes a Permission and never
 *    removes a RolePermission.
 *  - An Owner's deliberate removal of a default permission is NOT undone by a
 *    later sync (see `seedTenantRolePermissions`).
 *  - Only an OWNER may read or change role permissions, and only for their own
 *    tenant (the role is always resolved from the session's tenant, never from
 *    a client-supplied id).
 */
import prisma from '@/lib/db';
import type { Prisma, RoleCode } from '@prisma/client';
import {
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  isOwnerLockedPermission,
  isPermissionCode,
  type ConfigurableRole,
  type PermissionCode,
} from '@/lib/auth/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';

type Db = Prisma.TransactionClient | typeof prisma;

export const SYSTEM_ROLE_DEFINITIONS: { code: RoleCode; name: string; description: string }[] = [
  { code: 'OWNER', name: 'Owner', description: 'Complete administrative ownership of the coaching center' },
  { code: 'ADMIN', name: 'Administrator', description: 'Center management, operations, and academic administration' },
  { code: 'STAFF', name: 'Staff', description: 'Front desk, fee receipts, and attendance tracking' },
  { code: 'TEACHER', name: 'Teacher', description: 'Teaching faculty, marks entry, and batch schedule access' },
];

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ---------------------------------------------------------------------------
// Catalog sync
// ---------------------------------------------------------------------------

export interface CatalogSyncResult {
  created: number;
  updated: number;
  existing: number;
  /** Codes created by THIS run — they are the only ones eligible for incremental default seeding. */
  createdCodes: Set<string>;
}

/** Upserts the `Permission` mirror of the catalog. Never deletes anything. */
export async function syncPermissionCatalog(db: Db = prisma): Promise<CatalogSyncResult> {
  const rows = await db.permission.findMany({ select: { id: true, code: true, module: true, action: true, description: true } });
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const toCreate: { code: string; module: string; action: string; description: string }[] = [];
  let updated = 0;
  let existing = 0;

  for (const def of PERMISSION_CATALOG) {
    const row = byCode.get(def.code);
    if (!row) {
      toCreate.push({ code: def.code, module: def.module, action: def.action, description: def.description });
      continue;
    }
    if (row.module !== def.module || row.action !== def.action || row.description !== def.description) {
      await db.permission.update({
        where: { id: row.id },
        data: { module: def.module, action: def.action, description: def.description },
      });
      updated += 1;
    } else {
      existing += 1;
    }
  }

  if (toCreate.length > 0) {
    await db.permission.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { created: toCreate.length, updated, existing, createdCodes: new Set(toCreate.map((p) => p.code)) };
}

async function permissionIdMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.permission.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

// ---------------------------------------------------------------------------
// Tenant roles
// ---------------------------------------------------------------------------

/** Creates any of the four system roles a tenant is missing. Returns code -> roleId. */
export async function ensureTenantSystemRoles(db: Db, coachingCenterId: string): Promise<Map<RoleCode, string>> {
  const roles = await db.role.findMany({ where: { coachingCenterId }, select: { id: true, code: true } });
  const map = new Map<RoleCode, string>(roles.map((r) => [r.code, r.id]));
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    if (map.has(def.code)) continue;
    const created = await db.role.create({
      data: { coachingCenterId, name: def.name, code: def.code, description: def.description, isSystem: true },
      select: { id: true },
    });
    map.set(def.code, created.id);
  }
  return map;
}

export interface SeedResult {
  ADMIN: number;
  STAFF: number;
  TEACHER: number;
}

/**
 * Adds default RolePermission rows for a tenant's ADMIN/STAFF/TEACHER roles.
 *
 * A role that has NO rows yet is seeded with its full default set. A role that
 * already has rows is left alone, EXCEPT for permission codes created by this
 * very sync run (a catalog addition cannot have been "deliberately removed" by
 * an Owner yet). That is what keeps an Owner's removals from being resurrected
 * by every later sync. `restoreMissing` is the explicit opt-in that re-adds
 * every missing default.
 */
export async function seedTenantRolePermissions(
  db: Db,
  coachingCenterId: string,
  options: { createdCodes?: ReadonlySet<string>; restoreMissing?: boolean; idMap?: Map<string, string> } = {}
): Promise<SeedResult> {
  const roleIds = await ensureTenantSystemRoles(db, coachingCenterId);
  const ids = options.idMap ?? (await permissionIdMap(db));
  const result: SeedResult = { ADMIN: 0, STAFF: 0, TEACHER: 0 };

  for (const role of CONFIGURABLE_ROLES) {
    const roleId = roleIds.get(role)!;
    const current = await db.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { code: true } } } });
    const have = new Set(current.map((c) => c.permission.code));

    let candidates: readonly PermissionCode[];
    if (options.restoreMissing || have.size === 0) {
      candidates = DEFAULT_ROLE_PERMISSIONS[role];
    } else {
      candidates = DEFAULT_ROLE_PERMISSIONS[role].filter((c) => options.createdCodes?.has(c));
    }

    const data = candidates
      .filter((code) => !have.has(code) && !isOwnerLockedPermission(code) && ids.has(code))
      .map((code) => ({ roleId, permissionId: ids.get(code)! }));

    if (data.length > 0) {
      await db.rolePermission.createMany({ data, skipDuplicates: true });
    }
    result[role] = data.length;
  }
  return result;
}

/** New-tenant hook: make sure the catalog exists, then seed the tenant's defaults. */
export async function initializeTenantPermissions(db: Db, coachingCenterId: string): Promise<SeedResult> {
  const sync = await syncPermissionCatalog(db);
  return seedTenantRolePermissions(db, coachingCenterId, { createdCodes: sync.createdCodes });
}

/** A single role row that was created lazily (e.g. by user creation) still needs its defaults. */
export async function seedRoleIfConfigurable(db: Db, coachingCenterId: string, code: RoleCode): Promise<void> {
  if (code === 'OWNER') return;
  await initializeTenantPermissions(db, coachingCenterId);
}

export interface FullSyncSummary {
  catalog: { created: number; updated: number; existing: number };
  tenants: number;
  added: SeedResult;
}

/** Backfill for every existing tenant (used by scripts/sync-permissions.ts). */
export async function syncAllTenants(
  db: Db = prisma,
  options: { restoreMissing?: boolean } = {}
): Promise<FullSyncSummary> {
  const sync = await syncPermissionCatalog(db);
  const idMap = await permissionIdMap(db);
  const tenants = await db.coachingCenter.findMany({ select: { id: true } });
  const added: SeedResult = { ADMIN: 0, STAFF: 0, TEACHER: 0 };
  for (const t of tenants) {
    const r = await seedTenantRolePermissions(db, t.id, { createdCodes: sync.createdCodes, restoreMissing: options.restoreMissing, idMap });
    added.ADMIN += r.ADMIN;
    added.STAFF += r.STAFF;
    added.TEACHER += r.TEACHER;
  }
  return { catalog: { created: sync.created, updated: sync.updated, existing: sync.existing }, tenants: tenants.length, added };
}

/**
 * One-off, explicit, additive grant of specific (role, code) pairs to EVERY
 * tenant — used when a baseline default is corrected after tenants were
 * already seeded (a normal sync deliberately never touches a role that already
 * has rows). Only adds missing rows; never removes anything. Owner-locked codes
 * are refused.
 */
export async function grantToAllTenants(
  db: Db,
  grants: { role: ConfigurableRole; code: PermissionCode }[]
): Promise<{ tenants: number; added: number }> {
  for (const g of grants) {
    if (isOwnerLockedPermission(g.code)) throw new Error(`INVALID_PERMISSIONS: "${g.code}" is reserved for the Owner.`);
  }
  await syncPermissionCatalog(db);
  const ids = await permissionIdMap(db);
  const tenants = await db.coachingCenter.findMany({ select: { id: true } });
  let added = 0;
  for (const t of tenants) {
    const roleIds = await ensureTenantSystemRoles(db, t.id);
    const data = grants.map((g) => ({ roleId: roleIds.get(g.role)!, permissionId: ids.get(g.code)! }));
    const res = await db.rolePermission.createMany({ data, skipDuplicates: true });
    added += res.count;
  }
  return { tenants: tenants.length, added };
}

/**
 * Phase 14.4: Realigns TEACHER role permissions across all tenants by revoking
 * obsolete default grants (students.id_card, teachers.read, reports.teachers.read)
 * that were removed from the TEACHER baseline.
 */
export async function realignTeacherBaseline(
  db: Db = prisma
): Promise<{ tenants: number; removed: number }> {
  const obsoleteCodes: PermissionCode[] = ['students.id_card', 'teachers.read', 'reports.teachers.read'];
  const permissions = await db.permission.findMany({
    where: { code: { in: obsoleteCodes } },
    select: { id: true, code: true },
  });
  if (permissions.length === 0) return { tenants: 0, removed: 0 };
  const permIds = permissions.map((p) => p.id);

  const teacherRoles = await db.role.findMany({
    where: { code: 'TEACHER' },
    select: { id: true, coachingCenterId: true },
  });

  const res = await db.rolePermission.deleteMany({
    where: {
      roleId: { in: teacherRoles.map((r) => r.id) },
      permissionId: { in: permIds },
    },
  });

  return { tenants: teacherRoles.length, removed: res.count };
}

// ---------------------------------------------------------------------------
// Owner management
// ---------------------------------------------------------------------------

function assertOwner(actor: SessionUser) {
  if (actor.role !== 'OWNER') throw new Error('FORBIDDEN');
}

function parseRole(role: unknown): ConfigurableRole {
  if (typeof role === 'string' && (CONFIGURABLE_ROLES as readonly string[]).includes(role)) return role as ConfigurableRole;
  throw new Error('INVALID_ROLE: Only ADMIN, STAFF and TEACHER permissions can be configured.');
}

function parseDesired(codes: unknown): Set<PermissionCode> {
  if (!Array.isArray(codes)) throw new Error('INVALID_PERMISSIONS: permissions must be a list of permission codes.');
  const out = new Set<PermissionCode>();
  for (const c of codes) {
    if (!isPermissionCode(c)) throw new Error(`INVALID_PERMISSIONS: unknown permission "${String(c).slice(0, 80)}".`);
    if (isOwnerLockedPermission(c)) throw new Error(`INVALID_PERMISSIONS: "${c}" is reserved for the Owner and cannot be granted.`);
    out.add(c);
  }
  return out;
}

/** Granted codes per configurable role for a tenant. A role with no row/permissions yields []. */
export async function getTenantRolePermissions(coachingCenterId: string): Promise<Record<ConfigurableRole, PermissionCode[]>> {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { coachingCenterId, code: { in: [...CONFIGURABLE_ROLES] } } },
    select: { role: { select: { code: true } }, permission: { select: { code: true } } },
  });
  const out: Record<ConfigurableRole, PermissionCode[]> = { ADMIN: [], STAFF: [], TEACHER: [] };
  for (const r of rows) {
    const code = r.permission.code;
    if (isPermissionCode(code) && !isOwnerLockedPermission(code) && r.role.code in out) {
      out[r.role.code as ConfigurableRole].push(code);
    }
  }
  return out;
}

export interface RolePermissionChange {
  role: ConfigurableRole;
  granted: PermissionCode[];
  added: PermissionCode[];
  removed: PermissionCode[];
}

async function applyRolePermissions(
  actor: SessionUser,
  roleInput: unknown,
  desired: Set<PermissionCode>,
  event: 'ROLE_PERMISSIONS_UPDATED' | 'ROLE_PERMISSIONS_RESET',
  ctx: AuditContext
): Promise<RolePermissionChange> {
  assertOwner(actor);
  const role = parseRole(roleInput);
  const coachingCenterId = actor.coachingCenterId;

  return prisma.$transaction(async (tx) => {
    // Make sure the catalog mirror exists even if sync has not been run yet.
    await syncPermissionCatalog(tx);
    const ids = await permissionIdMap(tx);
    const roleIds = await ensureTenantSystemRoles(tx, coachingCenterId);
    const roleId = roleIds.get(role)!;

    const current = await tx.rolePermission.findMany({
      where: { roleId },
      select: { permissionId: true, permission: { select: { code: true } } },
    });
    const have = new Map(current.map((c) => [c.permission.code, c.permissionId]));

    const added = [...desired].filter((c) => !have.has(c));
    const removedRows = [...have.entries()].filter(([code]) => !desired.has(code as PermissionCode));

    if (added.length > 0) {
      await tx.rolePermission.createMany({
        data: added.map((code) => ({ roleId, permissionId: ids.get(code)! })),
        skipDuplicates: true,
      });
    }
    if (removedRows.length > 0) {
      await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { in: removedRows.map(([, id]) => id) } } });
    }

    const removed = removedRows.map(([code]) => code as PermissionCode);
    await recordAuditLog(
      {
        coachingCenterId,
        userId: actor.userId,
        action: event,
        entity: 'Role',
        entityId: roleId,
        details: { role, added: [...added].sort(), removed: [...removed].sort(), grantedCount: desired.size },
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
      tx
    );

    return { role, granted: [...desired], added, removed };
  });
}

/** OWNER only: replace a role's permission set with exactly `codes` (diffed, atomic, tenant-scoped). */
export function updateRolePermissions(actor: SessionUser, role: unknown, codes: unknown, ctx: AuditContext = {}) {
  assertOwner(actor);
  return applyRolePermissions(actor, role, parseDesired(codes), 'ROLE_PERMISSIONS_UPDATED', ctx);
}

/** OWNER only: restore a role to the Phase 14.1 baseline. */
export function resetRolePermissions(actor: SessionUser, role: unknown, ctx: AuditContext = {}) {
  assertOwner(actor);
  const r = parseRole(role);
  return applyRolePermissions(actor, r, new Set(DEFAULT_ROLE_PERMISSIONS[r]), 'ROLE_PERMISSIONS_RESET', ctx);
}
