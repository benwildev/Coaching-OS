import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getSalaryOverview } from '@/lib/services/salary.service';
import { getCurrentDhakaDateString } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('salary.read');
    const sp = new URL(request.url).searchParams;
    const today = getCurrentDhakaDateString();
    const year = Number(sp.get('year')) || Number(today.slice(0, 4));
    const month = Number(sp.get('month')) || Number(today.slice(5, 7));
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, error: 'INVALID_PERIOD', message: 'Invalid year or month' }, { status: 400 });
    }
    const overview = await getSalaryOverview(coachingCenterId, user, { year, month, branchId: sp.get('branch') || undefined });
    return NextResponse.json({ success: true, ...overview });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary GET');
  }
}
