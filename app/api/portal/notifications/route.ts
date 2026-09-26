import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { getPortalNotifications } from '@/lib/services/portal-notification.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requirePortalAuth();
    const sp = new URL(request.url).searchParams;
    const result = await getPortalNotifications(session, {
      page: Number(sp.get('page')) || 1,
      unreadOnly: sp.get('unreadOnly') === 'true',
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/notifications GET');
  }
}
