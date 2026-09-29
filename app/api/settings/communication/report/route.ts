import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getSmsDeliveryReport, getRecentSmsLogs } from '@/lib/services/communication-settings.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId')?.trim();

    if (requestId) {
      const report = await getSmsDeliveryReport(coachingCenterId, user, requestId);
      return NextResponse.json({ success: true, report });
    }

    const recentLogs = await getRecentSmsLogs(coachingCenterId, 15);
    return NextResponse.json({ success: true, recentLogs });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication/report GET');
  }
}
