import prisma from '@/lib/db';
import { dispatchToGuardian } from './communication.service';
import { notifyPortalAccountsForEvent } from './portal-notification.service';
import { DEFAULT_EVENT_COPY, type NotificationEvent, type TemplateVariable } from '@/lib/notifications/events';
import { interpolate } from './template-interpolation';

/**
 * Notifies every notification-enabled guardian of one student for a given
 * event. Shared by the attendance/fee/exam/material event hooks so the
 * "find this student's reachable guardians" logic lives in exactly one
 * place (AGENTS.md §9/§17).
 *
 * Also mirrors the event as an in-app Notification for the student's and
 * each guardian's PortalAccount, when one exists (Phase 9) — no new
 * event-detection logic, just a second delivery surface for the same event.
 */
export async function notifyStudentGuardians(params: {
  coachingCenterId: string;
  branchId?: string | null;
  studentId: string;
  event: NotificationEvent;
  vars: Partial<Record<TemplateVariable, string>>;
  triggeredById?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}): Promise<void> {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId: params.studentId, canReceiveNotifications: true },
    select: { guardianId: true },
  });

  for (const link of links) {
    await dispatchToGuardian({
      coachingCenterId: params.coachingCenterId,
      branchId: params.branchId,
      guardianId: link.guardianId,
      studentId: params.studentId,
      event: params.event,
      vars: params.vars,
      triggeredById: params.triggeredById,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });
  }

  const copy = DEFAULT_EVENT_COPY[params.event];
  const title = interpolate(copy.en.title, params.vars);
  const body = interpolate(copy.en.body, params.vars);

  await notifyPortalAccountsForEvent({
    coachingCenterId: params.coachingCenterId,
    studentId: params.studentId,
    type: params.event,
    title,
    body,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
  });
  for (const link of links) {
    await notifyPortalAccountsForEvent({
      coachingCenterId: params.coachingCenterId,
      guardianId: link.guardianId,
      type: params.event,
      title,
      body,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });
  }
}
