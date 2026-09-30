import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { dhakaMonthBounds, type LimitedResource, type MessageChannel } from '@/lib/subscription';

type Db = Prisma.TransactionClient | typeof prisma;

/** Statuses that hold message quota: QUEUED is a reservation for a send that is in flight. */
export const QUOTA_STATUSES = ['QUEUED', 'SENT', 'DELIVERED'] as const;

/**
 * Counts what consumes a plan limit. The rules are documented once, in
 * lib/subscription.ts — this file is their only implementation.
 */
export async function countResource(db: Db, coachingCenterId: string, resource: LimitedResource): Promise<number> {
  switch (resource) {
    case 'STUDENT':
      return db.student.count({ where: { coachingCenterId, status: 'ACTIVE' } });
    case 'TEACHER':
      return db.teacher.count({ where: { coachingCenterId, status: 'ACTIVE' } });
    case 'STAFF':
      return db.user.count({
        where: {
          coachingCenterId,
          status: 'ACTIVE',
          roleAssignments: { some: { role: { code: { in: ['ADMIN', 'STAFF'] } } } },
        },
      });
    case 'PORTAL':
      return db.portalAccount.count({ where: { coachingCenterId, status: 'ACTIVE' } });
    case 'BRANCH':
      return db.branch.count({ where: { coachingCenterId, status: 'ACTIVE' } });
  }
}

/** Messages that count against this month's quota for one channel (Asia/Dhaka calendar month). */
export async function countMessages(db: Db, coachingCenterId: string, channel: MessageChannel, now: Date = new Date()): Promise<number> {
  const { start, end } = dhakaMonthBounds(now);
  return db.communicationLog.count({
    where: {
      coachingCenterId,
      channel,
      status: { in: [...QUOTA_STATUSES] },
      createdAt: { gte: start, lt: end },
    },
  });
}

export async function storageUsedBytes(db: Db, coachingCenterId: string): Promise<number> {
  const agg = await db.media.aggregate({ where: { coachingCenterId }, _sum: { size: true } });
  return agg._sum.size ?? 0;
}

export interface TenantUsage {
  period: string;
  students: number;
  teachers: number;
  staffUsers: number;
  portalAccounts: number;
  branches: number;
  sms: number;
  whatsapp: number;
  email: number;
  storageMb: number;
}

export async function getTenantUsage(coachingCenterId: string, now: Date = new Date()): Promise<TenantUsage> {
  const [students, teachers, staffUsers, portalAccounts, branches, sms, whatsapp, email, bytes] = await Promise.all([
    countResource(prisma, coachingCenterId, 'STUDENT'),
    countResource(prisma, coachingCenterId, 'TEACHER'),
    countResource(prisma, coachingCenterId, 'STAFF'),
    countResource(prisma, coachingCenterId, 'PORTAL'),
    countResource(prisma, coachingCenterId, 'BRANCH'),
    countMessages(prisma, coachingCenterId, 'SMS', now),
    countMessages(prisma, coachingCenterId, 'WHATSAPP', now),
    countMessages(prisma, coachingCenterId, 'EMAIL', now),
    storageUsedBytes(prisma, coachingCenterId),
  ]);
  return {
    period: dhakaMonthBounds(now).label,
    students,
    teachers,
    staffUsers,
    portalAccounts,
    branches,
    sms,
    whatsapp,
    email,
    storageMb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
  };
}
