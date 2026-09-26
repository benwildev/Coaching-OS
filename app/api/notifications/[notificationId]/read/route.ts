import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { markAsRead, resolveNotificationScope } from '@/lib/services/notification.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { notificationId } = await params;
    const scope = resolveNotificationScope(coachingCenterId, user);
    const notification = await markAsRead(scope, notificationId);
    return NextResponse.json({ success: true, notification });
  } catch (error) {
    return apiErrorResponse(error, '/api/notifications/[notificationId]/read POST');
  }
}
