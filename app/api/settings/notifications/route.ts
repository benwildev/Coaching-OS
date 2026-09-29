import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getNotificationPreferences, updateNotificationPreferences } from '@/lib/services/notification-preference.service';
import { getNotificationPolicies, updateNotificationPolicies } from '@/lib/services/notification-policy.service';
import { notificationPoliciesUpdateSchema } from '@/lib/validations/notification';
import { getCommunicationChannelConfiguredStatus } from '@/lib/services/communication-settings.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    // Personal notification preferences are every authenticated user's own
    // to view/edit; the tenant-wide policy configuration and channel-setup
    // status are admin-only settings — a TEACHER has no legitimate reason
    // to read them and previously could, since this route had no role gate.
    const isAdmin = user.role === 'OWNER' || user.role === 'ADMIN';
    const [policies, preferences, channelsConfigured] = await Promise.all([
      isAdmin ? getNotificationPolicies(coachingCenterId) : Promise.resolve(undefined),
      getNotificationPreferences(coachingCenterId, user),
      isAdmin ? getCommunicationChannelConfiguredStatus(coachingCenterId) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({
      success: true,
      policies,
      preferences,
      channelsConfigured,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/notifications GET');
  }
}

export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = notificationPoliciesUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    let updatedPolicies = undefined;
    let updatedPreferences = undefined;

    if (parsed.data.policies && parsed.data.policies.length > 0) {
      updatedPolicies = await updateNotificationPolicies(coachingCenterId, user, parsed.data.policies);
    }

    if (parsed.data.preferences && parsed.data.preferences.length > 0) {
      updatedPreferences = await updateNotificationPreferences(coachingCenterId, user, parsed.data.preferences);
    }

    return NextResponse.json({
      success: true,
      policies: updatedPolicies,
      preferences: updatedPreferences,
    });
  } catch (error) {
    // If it's a validation error regarding mandatory notifications, return clear 400
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
    return apiErrorResponse(error, '/api/settings/notifications PUT');
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
