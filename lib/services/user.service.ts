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
