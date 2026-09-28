import prisma from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { recordAuditLog } from './audit.service';
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

  const user = await prisma.user.create({
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
  const updated = await prisma.user.update({
    where: { id: userId, coachingCenterId },
    data: { status, sessionVersion: { increment: 1 } },
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
