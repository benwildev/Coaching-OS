import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getNotifications, resolveNotificationScope } from '@/lib/services/notification.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const sp = new URL(request.url).searchParams;
    const scope = resolveNotificationScope(coachingCenterId, user);
    const result = await getNotifications(scope, {
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 20,
      unreadOnly: sp.get('unreadOnly') === '1',
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/notifications GET');
  }
}
