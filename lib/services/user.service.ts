import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { recordAuditLog } from './audit.service';
import { randomBytes } from 'node:crypto';
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
  actorUserId?: string
) {
  const existing = await prisma.user.findUnique({
    where: {
      coachingCenterId_email: {
        coachingCenterId,
        email: data.email.toLowerCase(),
      },
    },
  });

  if (existing) {
    throw new Error('A user with this email already exists in this center');
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

export async function updateUserStatus(
  coachingCenterId: string,
  userId: string,
  status: UserStatus,
  actorUserId?: string
) {
  const updated = await prisma.user.update({
    where: { id: userId, coachingCenterId },
    data: { status },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    action: 'USER_STATUS_UPDATED',
    entity: 'User',
    entityId: userId,
    details: { status },
  });

  return updated;
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
}

/**
 * Staff session identity for a verified user. A user with no role
 * assignment gets NO identity (previously defaulted to STAFF) — a missing
 * role must never grant access.
 */
export function toStaffIdentity(user: UserWithRoles): StaffIdentity | null {
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
  };
}

// A valid salt:hash of a random secret, verified against when no account
// matches so "unknown identifier" costs the same scrypt time as "wrong password".
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

/**
 * Canonical staff password authentication.
 *  - Email is unique only per tenant, so every account matching the
 *    identifier is checked; exactly one password match authenticates. Zero
 *    or several (ambiguous across tenants) → failure, never an arbitrary pick.
 *  - The password is verified BEFORE the account status is revealed, so an
 *    attacker without the password cannot learn that an account exists or
 *    is inactive.
 * Returns null for any credential failure (caller responds generically);
 * throws ACCOUNT_INACTIVE only for a correct password on a non-active account.
 */
export async function authenticateUser(identifier: string, plainPassword: string): Promise<StaffIdentity | null> {
  const raw = identifier.trim();
  if (!raw || !plainPassword) return null;

  const candidates = await prisma.user.findMany({
    where: { OR: [{ email: raw.toLowerCase() }, { phone: raw }] },
    include: staffIdentityInclude,
    take: 10,
  });

  if (candidates.length === 0) {
    verifyPassword(plainPassword, DUMMY_HASH);
    return null;
  }

  const verified = candidates.filter((u) => verifyPassword(plainPassword, u.passwordHash));
  if (verified.length !== 1) {
    if (verified.length > 1) console.warn('[auth] Ambiguous staff login: identifier + password match accounts in multiple tenants');
    return null;
  }

  const user = verified[0];
  if (user.status !== 'ACTIVE') throw new Error('ACCOUNT_INACTIVE');

  const identity = toStaffIdentity(user);
  if (!identity) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return identity;
}
