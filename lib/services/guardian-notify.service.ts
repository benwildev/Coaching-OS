import { dispatchToGuardian } from './communication.service';
import { notifyPortalAccountsForEvent } from './portal-notification.service';
import { DEFAULT_EVENT_COPY, type NotificationEvent, type TemplateVariable } from '@/lib/notifications/events';
import { interpolate } from './template-interpolation';
import { resolveNotificationRecipients } from './notification-policy.service';

/**
 * Notifies recipients of one student for a given event, governed by the
 * center's NotificationAlertPolicy.
 *
 * Checks which recipients (STUDENT, GUARDIAN) and which channels (IN_APP,
 * SMS, WHATSAPP, EMAIL) are permitted by policy before dispatching.
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
  const resolved = await resolveNotificationRecipients({
    coachingCenterId: params.coachingCenterId,
    notificationType: params.event,
    context: { studentId: params.studentId },
  });

  if (resolved.length === 0) {
    // Entire notification event is disabled by policy or has no recipients enabled
    return;
  }

  const copy = DEFAULT_EVENT_COPY[params.event];
  const title = copy ? interpolate(copy.en.title, params.vars) : params.event;
  const body = copy ? interpolate(copy.en.body, params.vars) : '';

  const guardianTargets = resolved.filter((r) => r.recipientType === 'GUARDIAN');
  const studentTarget = resolved.find((r) => r.recipientType === 'STUDENT');

  // 1. Process Guardian notifications if enabled in policy
  for (const target of guardianTargets) {
    const hasExternal = target.channels.some((c) => c === 'SMS' || c === 'WHATSAPP' || c === 'EMAIL');
    if (hasExternal) {
      await dispatchToGuardian({
        coachingCenterId: params.coachingCenterId,
        branchId: params.branchId,
        guardianId: target.recipientId,
        studentId: params.studentId,
        event: params.event,
        vars: params.vars,
        triggeredById: params.triggeredById,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        allowedChannels: target.channels,
      });
    }

    if (target.channels.includes('IN_APP')) {
      await notifyPortalAccountsForEvent({
        coachingCenterId: params.coachingCenterId,
        guardianId: target.recipientId,
        studentId: params.studentId,
        type: params.event,
        title,
        body,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      });
    }
  }

  // 2. Process Student in-app portal notification if enabled in policy
  if (studentTarget && studentTarget.channels.includes('IN_APP')) {
    await notifyPortalAccountsForEvent({
      coachingCenterId: params.coachingCenterId,
      studentId: params.studentId,
      type: params.event,
      title,
      body,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });
  }
}
