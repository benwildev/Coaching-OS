import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { markPortalNotificationRead } from '@/lib/services/portal-notification.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  try {
    const session = await requirePortalAuth();
    const { notificationId } = await params;
    const notification = await markPortalNotificationRead(session, notificationId);
    return NextResponse.json({ success: true, notification });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/notifications/[notificationId]/read POST');
  }
}
