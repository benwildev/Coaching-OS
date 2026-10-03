import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getNotificationPolicies, updateNotificationPolicies } from '@/lib/services/notification-policy.service';
import { z } from 'zod';
import { notificationPolicyUpdateItemSchema } from '@/lib/validations/notification';

export const dynamic = 'force-dynamic';

const updatePoliciesBodySchema = z.object({
  policies: z.array(notificationPolicyUpdateItemSchema),
});

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.notification_policy.update');
    const policies = await getNotificationPolicies(coachingCenterId);
    return NextResponse.json({ success: true, policies });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/notifications/policies GET');
  }
}

export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.notification_policy.update');
    const body = await request.json().catch(() => null);
    const parsed = updatePoliciesBodySchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const policies = await updateNotificationPolicies(coachingCenterId, user, parsed.data.policies);
    return NextResponse.json({ success: true, policies });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VALIDATION_ERROR:')) {
      return NextResponse.json({
        success: false,
        message: error.message.replace('VALIDATION_ERROR: ', ''),
      }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith('NOTIFICATION_POLICY_ACCESS_DENIED:')) {
      return NextResponse.json({
        success: false,
        message: error.message,
      }, { status: 403 });
    }
    return apiErrorResponse(error, '/api/settings/notifications/policies PUT');
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
