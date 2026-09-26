import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { markAllPortalNotificationsRead } from '@/lib/services/portal-notification.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await requirePortalAuth();
    const count = await markAllPortalNotificationsRead(session);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/notifications/read-all POST');
  }
}
