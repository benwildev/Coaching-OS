import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getDueReport } from '@/lib/services/financial-report.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.reports.read');
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const report = await getDueReport(coachingCenterId, {
      branchId,
      batchId: searchParams.get('batch') || undefined,
      overdueOnly: searchParams.get('overdueOnly') === 'true',
      search: searchParams.get('search') || undefined,
      sortBy: (searchParams.get('sortBy') as 'dueDate' | 'amount' | 'name') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '30', 10),
    });

    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/reports/due GET');
  }
}
