import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';
import { recordAuditLog } from './audit.service';
import { EVENT_CATEGORY, isNotificationEvent } from '@/lib/notifications/events';

/**
 * Users who explicitly turned off in-app notifications for this event's
 * category (NotificationPreference.inApp === false). Absence of a row means
 * "in-app on" (the default — see notification-preference.service.ts), so
 * only rows with an explicit false are excluded.
 */
async function findOptedOutUserIds(userIds: string[], type: string): Promise<Set<string>> {
  if (!isNotificationEvent(type)) return new Set();
  const category = EVENT_CATEGORY[type];
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds }, category, inApp: false },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export interface NotificationScope {
  coachingCenterId: string;
  user: SessionUser;
}

export function resolveNotificationScope(coachingCenterId: string, user: SessionUser): NotificationScope {
  return { coachingCenterId, user };
}

export interface NotifyUserInput {
  coachingCenterId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

/**
 * Creates a single in-app notification. Never throws — a notification
 * failure must never break the mutation that triggered it (same contract as
 * recordAuditLog).
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  try {
    const optedOut = await findOptedOutUserIds([input.userId], input.type);
    if (optedOut.has(input.userId)) return;

    await prisma.notification.create({
      data: {
        coachingCenterId: input.coachingCenterId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
      },
    });
  } catch (error) {
    // A duplicate (userId, sourceType, sourceId, type) is expected and
    // harmless — it means this exact event already notified this user.
    // Anything else is logged but still never thrown.
    console.error('[NotificationService] Failed to create notification:', error);
  }
}

export interface NotifyUsersInput {
  coachingCenterId: string;
  userIds: string[];
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

/**
 * Bulk in-app notification. Relies on the (userId, sourceType, sourceId,
 * type) unique index + skipDuplicates for duplicate protection (AGENTS.md
 * §40) — no per-row existence check needed.
 */
export async function notifyUsers(input: NotifyUsersInput): Promise<number> {
  const uniqueUserIds = Array.from(new Set(input.userIds));
  if (uniqueUserIds.length === 0) return 0;
  try {
    const optedOut = await findOptedOutUserIds(uniqueUserIds, input.type);
    const targetUserIds = uniqueUserIds.filter((id) => !optedOut.has(id));
    if (targetUserIds.length === 0) return 0;

    const result = await prisma.notification.createMany({
      data: targetUserIds.map((userId) => ({
        coachingCenterId: input.coachingCenterId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
      })),
      skipDuplicates: true,
    });
    return result.count;
  } catch (error) {
    console.error('[NotificationService] Failed to bulk-create notifications:', error);
    return 0;
  }
}

export interface NotificationListParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export async function getNotifications(scope: NotificationScope, params: NotificationListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  const where: Prisma.NotificationWhereInput = {
    coachingCenterId: scope.coachingCenterId,
    userId: scope.user.userId,
    ...(params.unreadOnly ? { isRead: false } : {}),
  };

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    notifications,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getUnreadCount(scope: NotificationScope): Promise<number> {
  return prisma.notification.count({
    where: { coachingCenterId: scope.coachingCenterId, userId: scope.user.userId, isRead: false },
  });
}

export async function markAsRead(scope: NotificationScope, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, coachingCenterId: scope.coachingCenterId },
  });
  if (!notification) throw new Error('NOTIFICATION_NOT_FOUND');
  if (notification.userId !== scope.user.userId) throw new Error('NOTIFICATION_ACCESS_DENIED');

  if (notification.isRead) return notification;

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

  await recordAuditLog({
    coachingCenterId: scope.coachingCenterId,
    userId: scope.user.userId,
    action: 'NOTIFICATION_READ',
    entity: 'Notification',
    entityId: notificationId,
    details: null,
  });

  return updated;
}

export async function markAllAsRead(scope: NotificationScope): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { coachingCenterId: scope.coachingCenterId, userId: scope.user.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  if (result.count > 0) {
    await recordAuditLog({
      coachingCenterId: scope.coachingCenterId,
      userId: scope.user.userId,
      action: 'NOTIFICATION_READ',
      entity: 'Notification',
      entityId: null,
      details: { markAllRead: true, count: result.count },
    });
  }

  return result.count;
}
