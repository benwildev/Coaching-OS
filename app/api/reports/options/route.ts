import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getReportOptions } from '@/lib/reports/options';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireTenant();
    await requireFeature(user.coachingCenterId, 'ADVANCED_REPORTS');
    const options = await getReportOptions(user);
    return NextResponse.json({ success: true, options }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/reports/options');
  }
}
