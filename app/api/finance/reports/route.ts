import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resolveFinanceScope } from '@/lib/services/finance-overview.service';
import { getFinanceReports } from '@/lib/services/finance-reports.service';
import { defaultMonthRange, isIsoDate } from '@/lib/reports/dates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=...&categoryId=...&paymentMethod=...&comparison=true
 * Permissions: reports.finance.read or finance.dashboard.read.
 * Branch scope is resolved server-side (branch-locked callers are pinned to their branch).
 */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    
    // Gated by reports.finance.read or finance.dashboard.read
    try {
      await requirePermission('reports.finance.read');
    } catch {
      await requirePermission('finance.dashboard.read');
    }

    const sp = new URL(request.url).searchParams;
    const dflt = defaultMonthRange();
    const from = sp.get('from') || dflt.from;
    const to = sp.get('to') || dflt.to;

    if (!isIsoDate(from) || !isIsoDate(to)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_DATE_RANGE', message: 'Dates must be valid YYYY-MM-DD' },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { success: false, error: 'INVALID_DATE_RANGE', message: 'Start date cannot be after end date' },
        { status: 400 }
      );
    }

    const scope = await resolveFinanceScope(coachingCenterId, user, sp.get('branchId'));
    const data = await getFinanceReports(scope, {
      from,
      to,
      branchId: scope.branchId,
      categoryId: sp.get('categoryId') || undefined,
      paymentMethod: sp.get('paymentMethod') || undefined,
      comparison: sp.get('comparison') === 'true',
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/finance/reports GET');
  }
}
