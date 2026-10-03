import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { getRecentAuditLogs } from '@/lib/services/audit.service';
import { apiErrorResponse } from '@/lib/api-error';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.users.read');

    const logs = await getRecentAuditLogs(coachingCenterId, 30);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/audit GET');
  }
}
