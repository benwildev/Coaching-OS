import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getFeeDashboard } from '@/lib/services/financial-report.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const dashboard = await getFeeDashboard(coachingCenterId, { branchId });
    return NextResponse.json({ success: true, dashboard });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/dashboard GET');
  }
}
