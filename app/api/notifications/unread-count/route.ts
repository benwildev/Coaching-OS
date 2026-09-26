import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getUnreadCount, resolveNotificationScope } from '@/lib/services/notification.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const scope = resolveNotificationScope(coachingCenterId, user);
    const count = await getUnreadCount(scope);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    return apiErrorResponse(error, '/api/notifications/unread-count GET');
  }
}
