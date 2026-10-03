import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getCashBoxDashboard, openCashSession } from '@/lib/services/cash-session.service';
import { cashSessionOpenSchema } from '@/lib/validations/cash-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/cash-box?branchId=...&date=YYYY-MM-DD
 * Accessible to callers with fees.cash_session.manage or finance.dashboard.read.
 */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    
    try {
      await requirePermission('fees.cash_session.manage');
    } catch {
      await requirePermission('finance.dashboard.read');
    }

    const sp = new URL(request.url).searchParams;
    const branchId = sp.get('branchId') || undefined;
    const date = sp.get('date') || undefined;

    const data = await getCashBoxDashboard(coachingCenterId, user, branchId, date);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/finance/cash-box GET');
  }
}

/**
 * POST /api/finance/cash-box
 * Open a cash session for today.
 * Permission: fees.cash_session.manage.
 */
export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.cash_session.manage');

    const body = await request.json().catch(() => null);
    const parsed = cashSessionOpenSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const branchId = resolveEffectiveBranchId(user, parsed.data.branchId) as string;
    const session = await openCashSession(coachingCenterId, user, branchId, parsed.data.openingCash);

    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/finance/cash-box POST');
  }
}
