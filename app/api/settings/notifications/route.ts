import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getNotificationPreferences, updateNotificationPreferences } from '@/lib/services/notification-preference.service';
import { notificationPreferencesUpdateSchema } from '@/lib/validations/notification';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const preferences = await getNotificationPreferences(coachingCenterId, user);
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/notifications GET');
  }
}

export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = notificationPreferencesUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const preferences = await updateNotificationPreferences(coachingCenterId, user, parsed.data.preferences);
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/notifications PUT');
  }
}
