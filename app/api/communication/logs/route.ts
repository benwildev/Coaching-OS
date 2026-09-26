import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { listCommunicationLogs, resolveCommunicationScope } from '@/lib/services/communication.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const sp = new URL(request.url).searchParams;
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const result = await listCommunicationLogs(scope, {
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 20,
      channel: sp.get('channel') || undefined,
      event: sp.get('event') || undefined,
      status: sp.get('status') || undefined,
      dateFrom: sp.get('dateFrom') || undefined,
      dateTo: sp.get('dateTo') || undefined,
      search: sp.get('search') || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/logs GET');
  }
}
