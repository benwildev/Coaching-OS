import prisma from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { recordAuditLog } from './audit.service';
import { checkStaffLimit } from './subscription.service';
import type { Prisma, RoleCode, UserStatus } from '@prisma/client';

export async function getUsersByTenant(coachingCenterId: string) {
  return prisma.user.findMany({
    where: { coachingCenterId },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      banglaName: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
      roleAssignments: {
        include: {
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createUser(
  coachingCenterId: string,
  data: {
    email: string;
    phone: string;
    password: string;
    name: string;
    banglaName?: string;
    role: RoleCode;
    branchId?: string;
  },
  actorUserId: string,
  actorRole: RoleCode
) {
  // Phase 10.4: only an OWNER may create another OWNER-level account —
  // otherwise an ADMIN (itself created by an OWNER) could mint a peer/
  // superior account for itself or an accomplice.
  if (data.role === 'OWNER' && actorRole !== 'OWNER') {
    throw new Error('FORBIDDEN_OWNER_PROTECTED: Only an OWNER can create another OWNER account.');
  }

  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, coachingCenterId } });
    if (!branch) throw new Error('BRANCH_NOT_FOUND');
  }

  const existing = await prisma.user.findUnique({
    where: {
      coachingCenterId_email: {
        coachingCenterId,
        email: data.email.toLowerCase(),
      },
    },
  });

  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS: A user with this email already exists in this center.');
  }

  // Find or create role
  let role = await prisma.role.findFirst({
    where: { coachingCenterId, code: data.role },
  });

  if (!role) {
    role = await prisma.role.create({
      data: {
        coachingCenterId,
        name: data.role,
        code: data.role,
        isSystem: true,
      },
    });
  }

  const passwordHash = hashPassword(data.password);

  // Phase 11.4: ADMIN/STAFF accounts count toward the plan staff limit (OWNER and
  // TEACHER accounts do not — see lib/subscription.ts). Checked under an advisory
  // lock in the same transaction as the insert.
  const user = await prisma.$transaction(async (tx) => {
    if (data.role === "ADMIN" || data.role === "STAFF") await checkStaffLimit(tx, coachingCenterId);
    return tx.user.create({
    data: {
      coachingCenterId,
      branchId: data.branchId,
      email: data.email.toLowerCase(),
      phone: data.phone,
      name: data.name,
      banglaName: data.banglaName,
      passwordHash,
      status: 'ACTIVE',
      roleAssignments: {
        create: {
          roleId: role.id,
          branchId: data.branchId,
        },
      },
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      banglaName: true,
      status: true,
    },
  });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    action: 'USER_CREATED',
    entity: 'User',
    entityId: user.id,
    details: { email: user.email, role: data.role },
  });

  return user;
}

/**
 * Phase 13.1: Transaction-safe helper to create a TEACHER User inside an existing transaction.
 * Checks checkStaffLimit under advisory lock (per Phase 13.1 instructions).
 * Enforces email uniqueness and branch scope.
 */
export async function createTeacherUserInTx(
  tx: Prisma.TransactionClient,
  coachingCenterId: string,
  params: {
    email: string;
    phone: string;
    name: string;
    banglaName?: string | null;
    password: string;
    branchId?: string | null;
  },
  actorUserId?: string
): Promise<{ id: string; email: string; phone: string; name: string }> {
  // Phase 13.1 §12: check staff limit under advisory lock before creating User
  await checkStaffLimit(tx, coachingCenterId);

  const existing = await tx.user.findFirst({
    where: {
      coachingCenterId,
      email: { equals: params.email.trim().toLowerCase(), mode: 'insensitive' },
    },
  });
  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS: A user with this email already exists in this center.');
  }

  let role = await tx.role.findFirst({
    where: { coachingCenterId, code: 'TEACHER' },
  });

  if (!role) {
    role = await tx.role.create({
      data: {
        coachingCenterId,
        name: 'TEACHER',
        code: 'TEACHER',
        isSystem: true,
      },
    });
  }

  const passwordHash = hashPassword(params.password);

  const user = await tx.user.create({
    data: {
      coachingCenterId,
      branchId: params.branchId || null,
      email: params.email.trim().toLowerCase(),
      phone: params.phone,
      name: params.name.trim(),
      banglaName: params.banglaName?.trim() || null,
      passwordHash,
      status: 'ACTIVE',
      roleAssignments: {
        create: {
          roleId: role.id,
          branchId: params.branchId || null,
        },
      },
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      status: true,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    action: 'TEACHER_USER_ACCOUNT_CREATED',
    entity: 'User',
    entityId: user.id,
    details: { email: user.email, role: 'TEACHER' },
  });

  return {
    id: user.id,
    email: user.email,
    phone: user.phone || '',
    name: user.name,
  };
}

/**
 * A tenant must always keep at least one ACTIVE OWNER — otherwise nobody
 * could ever manage the center again. Called before any status/role change
 * that would remove the last one.
 */
async function assertNotLastActiveOwner(coachingCenterId: string, targetUserId: string): Promise<void> {
  const activeOwnerCount = await prisma.user.count({
    where: {
      coachingCenterId,
      status: 'ACTIVE',
      id: { not: targetUserId },
      roleAssignments: { some: { role: { code: 'OWNER' } } },
    },
  });
  if (activeOwnerCount === 0) {
    throw new Error('LAST_OWNER_PROTECTED: At least one active OWNER must remain for this center.');
  }
}

/**
 * Phase 10.4: ADMIN must never be able to disable/demote an OWNER, and no
 * one (including another OWNER) may remove the last active OWNER. The
 * caller's role and the target's current role are both required so this
 * check cannot be bypassed by calling the service directly with a
 * different role than the API route validated.
 */
export async function updateUserStatus(
  coachingCenterId: string,
  userId: string,
  status: UserStatus,
  actorUserId: string,
  actorRole: RoleCode
) {
  const target = await prisma.user.findFirst({
    where: { id: userId, coachingCenterId },
    include: { roleAssignments: { include: { role: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!target) throw new Error('USER_NOT_FOUND');

  const targetRole = target.roleAssignments[0]?.role.code;
  if (targetRole === 'OWNER' && actorRole !== 'OWNER') {
    throw new Error('FORBIDDEN_OWNER_PROTECTED: Only an OWNER can change another OWNER\'s status.');
  }
  if (targetRole === 'OWNER' && status !== 'ACTIVE') {
    await assertNotLastActiveOwner(coachingCenterId, userId);
  }

  // Any status change revokes every outstanding session for this account
  // (Phase 10.4 §8/§9) — a disabled or reinstated user must not be able to
  // keep using a token issued before the change.
  const updated = await prisma.$transaction(async (tx) => {
    // Phase 11.4: re-activating an ADMIN/STAFF account takes a staff slot again.
    if (status === 'ACTIVE' && target.status !== 'ACTIVE' && (targetRole === 'ADMIN' || targetRole === 'STAFF')) {
      await checkStaffLimit(tx, coachingCenterId);
    }
    return tx.user.update({
      where: { id: userId, coachingCenterId },
      data: { status, sessionVersion: { increment: 1 } },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        banglaName: true,
        status: true,
      },
    });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    action: 'USER_STATUS_UPDATED',
    entity: 'User',
    entityId: userId,
    details: { status, targetRole },
  });

  return updated;
}

/** Bumps sessionVersion only — used by logout to revoke every outstanding token for this account. */
export async function bumpUserSessionVersion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

/** Include needed to turn a User row into a staff session identity. Role order is deterministic. */
export const staffIdentityInclude = {
  roleAssignments: { include: { role: true }, orderBy: { createdAt: 'asc' } },
  // Phase 11.4: a suspended tenant's staff sessions are invalid immediately.
  coachingCenter: { select: { status: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof staffIdentityInclude }>;

export interface StaffIdentity {
  userId: string;
  email: string;
  phone: string | null;
  name: string;
  banglaName: string | null;
  role: RoleCode;
  coachingCenterId: string;
  branchId: string | null;
  /** Phase 10.4: must match User.sessionVersion for the session to remain valid. */
  sessionVersion: number;
}

/**
 * Staff session identity for a verified user. A user with no role
 * assignment gets NO identity (previously defaulted to STAFF) — a missing
 * role must never grant access. Also returns null for a non-ACTIVE user, so
 * a disabled account can never produce a usable session identity even if a
 * caller forgets to check `status` separately.
 */
export function toStaffIdentity(user: UserWithRoles): StaffIdentity | null {
  if (user.status !== 'ACTIVE') return null;
  if (user.coachingCenter.status === 'SUSPENDED') return null;
  const role = user.roleAssignments[0]?.role.code;
  if (!role) return null;
  return {
    userId: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    banglaName: user.banglaName,
    role,
    coachingCenterId: user.coachingCenterId,
    branchId: user.branchId,
    sessionVersion: user.sessionVersion,
  };
}
