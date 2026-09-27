import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getReportOptions } from '@/lib/reports/options';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireTenant();
    const options = await getReportOptions(user);
    return NextResponse.json({ success: true, options }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/reports/options');
  }
}
