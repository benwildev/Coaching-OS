import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getDailyCollectionSummary } from '@/lib/services/financial-report.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.collect');
    const sp = new URL(request.url).searchParams;
    const branchId = resolveEffectiveBranchId(user, sp.get('branch') || undefined);

    const summary = await getDailyCollectionSummary(coachingCenterId, {
      date: sp.get('date') || undefined,
      branchId,
    });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/collection GET');
  }
}
