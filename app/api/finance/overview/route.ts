import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getFinanceOverview, resolveFinanceScope } from '@/lib/services/finance-overview.service';
import { defaultMonthRange, isIsoDate } from '@/lib/reports/dates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=…&comparison=true
 * Permission: finance.dashboard.read. Branch scope is resolved server-side
 * (a branch-locked caller is always pinned to their own branch).
 */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('finance.dashboard.read');
    const sp = new URL(request.url).searchParams;
    const dflt = defaultMonthRange();
    const from = sp.get('from') || dflt.from;
    const to = sp.get('to') || dflt.to;
    if (!isIsoDate(from) || !isIsoDate(to)) {
      return NextResponse.json({ success: false, error: 'INVALID_DATE_RANGE', message: 'Dates must be valid YYYY-MM-DD' }, { status: 400 });
    }
    const scope = await resolveFinanceScope(coachingCenterId, user, sp.get('branchId'));
    const data = await getFinanceOverview(scope, { from, to, comparison: sp.get('comparison') === 'true' });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/finance/overview GET');
  }
}
