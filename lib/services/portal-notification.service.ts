import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { PortalSessionUser } from '@/lib/auth/portal-session';
import { recordAuditLog } from './audit.service';

/**
 * In-app notifications for portal identities — sibling to Phase 8's
 * notification.service.ts (left untouched, still userId/staff-scoped).
 * Writes to the same Notification table, now with nullable studentId/
 * guardianId columns (see prisma/schema.prisma).
 */

export interface NotifyStudentInput {
  coachingCenterId: string;
  studentId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

export async function notifyStudent(input: NotifyStudentInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        coachingCenterId: input.coachingCenterId,
        studentId: input.studentId,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
      },
    });
  } catch (error) {
    // A duplicate (studentId, sourceType, sourceId, type) is expected and
    // harmless. Never throws — same contract as recordAuditLog.
    console.error('[PortalNotificationService] Failed to notify student:', error);
  }
}

export interface NotifyGuardianInput {
  coachingCenterId: string;
  guardianId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  /**
   * Phase 10.5: which child this notification is about, when there is one.
   * REQUIRED for student-specific events (attendance/fee/exam/result/
   * material) so a guardian with several children doesn't have their
   * second child's notification silently dropped as a "duplicate" of the
   * first. Stored in the dedicated `guardianStudentId` column — deliberately
   * NOT the same `studentId` column a student's OWN notification row uses
   * (that has its own, unrelated unique constraint keyed only on studentId;
   * reusing it here would make two DIFFERENT guardians of the same child
   * collide with each other). Leave undefined for a genuinely guardian-level
   * event (e.g. a notice) that is the same regardless of which child it
   * concerns; callers with several children in scope for the same such
   * event are responsible for calling this at most once per guardian
   * themselves (see notice.service.ts) rather than relying on this
   * function to dedupe across students.
   */
  aboutStudentId?: string | null;
}

export async function notifyGuardian(input: NotifyGuardianInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        coachingCenterId: input.coachingCenterId,
        guardianId: input.guardianId,
        guardianStudentId: input.aboutStudentId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
      },
    });
  } catch (error) {
    console.error('[PortalNotificationService] Failed to notify guardian:', error);
  }
}

/**
 * If a Student/Guardian has a PortalAccount, mirror the event as an in-app
 * notification.
 *
 * `studentId` means "this event is about this student" and is used for
 * BOTH branches below: it addresses the student's own notification (when
 * `studentId` is given with no `guardianId`) AND, when both are given,
 * tags the guardian's notification with which child it concerns (Phase
 * 10.5 — see notifyGuardian's doc comment). Passing `guardianId` alone
 * with no `studentId` is for a genuinely guardian-level event (e.g. a
 * notice) that doesn't belong to one particular child.
 */
export async function notifyPortalAccountsForEvent(params: {
  coachingCenterId: string;
  studentId?: string | null;
  guardianId?: string | null;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}): Promise<void> {
  if (params.studentId) {
    const account = await prisma.portalAccount.findUnique({ where: { studentId: params.studentId }, select: { id: true } });
    if (account) {
      await notifyStudent({
        coachingCenterId: params.coachingCenterId,
        studentId: params.studentId,
        type: params.type,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      });
    }
  }
  if (params.guardianId) {
    const account = await prisma.portalAccount.findUnique({ where: { guardianId: params.guardianId }, select: { id: true } });
    if (account) {
      await notifyGuardian({
        coachingCenterId: params.coachingCenterId,
        guardianId: params.guardianId,
        aboutStudentId: params.studentId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      });
    }
  }
}

function recipientWhere(session: PortalSessionUser): Prisma.NotificationWhereInput {
  return session.portalType === 'STUDENT'
    ? { coachingCenterId: session.coachingCenterId, studentId: session.studentId }
    : { coachingCenterId: session.coachingCenterId, guardianId: session.guardianId };
}

export interface PortalNotificationListParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export async function getPortalNotifications(session: PortalSessionUser, params: PortalNotificationListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  const where: Prisma.NotificationWhereInput = {
    ...recipientWhere(session),
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

  return { notifications, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function getPortalUnreadCount(session: PortalSessionUser): Promise<number> {
  return prisma.notification.count({ where: { ...recipientWhere(session), isRead: false } });
}

export async function markPortalNotificationRead(session: PortalSessionUser, notificationId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, ...recipientWhere(session) } });
  if (!notification) throw new Error('NOTIFICATION_NOT_FOUND');
  if (notification.isRead) return notification;

  const updated = await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true, readAt: new Date() } });

  await recordAuditLog({
    coachingCenterId: session.coachingCenterId,
    studentId: session.studentId,
    guardianId: session.guardianId,
    action: 'PORTAL_NOTIFICATION_READ',
    entity: 'Notification',
    entityId: notificationId,
    details: null,
  });

  return updated;
}

export async function markAllPortalNotificationsRead(session: PortalSessionUser): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { ...recipientWhere(session), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  if (result.count > 0) {
    await recordAuditLog({
      coachingCenterId: session.coachingCenterId,
      studentId: session.studentId,
      guardianId: session.guardianId,
      action: 'PORTAL_NOTIFICATION_READ',
      entity: 'Notification',
      entityId: null,
      details: { markAllRead: true, count: result.count },
    });
  }

  return result.count;
}
