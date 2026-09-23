import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { recordAuditLog } from './audit.service';
import type { RoleCode, UserStatus } from '@prisma/client';

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

export async function authenticateUser(identifier: string, plainPassword: string) {
  const normalized = identifier.trim().toLowerCase();

  // Find user by email or phone
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalized },
        { phone: identifier.trim() },
      ],
    },
    include: {
      coachingCenter: true,
      branch: true,
      roleAssignments: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  if (user.status !== 'ACTIVE') {
    throw new Error('ACCOUNT_INACTIVE');
  }

  const isValid = verifyPassword(plainPassword, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const primaryRole = user.roleAssignments[0]?.role.code || ('STAFF' as RoleCode);

  return {
    userId: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    banglaName: user.banglaName,
    role: primaryRole,
    coachingCenterId: user.coachingCenterId,
    branchId: user.branchId,
  };
}
