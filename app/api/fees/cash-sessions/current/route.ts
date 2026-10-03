import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTodaySession } from '@/lib/services/cash-session.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.cash_session.manage');
    const sp = new URL(request.url).searchParams;
    const branchId = resolveEffectiveBranchId(user, sp.get('branch') || undefined);
    if (!branchId) {
      return NextResponse.json({ success: false, error: 'BRANCH_REQUIRED', message: 'Select a branch to view its cash session' }, { status: 400 });
    }

    const session = await getTodaySession(coachingCenterId, branchId);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/cash-sessions/current GET');
  }
}
