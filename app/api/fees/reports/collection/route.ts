import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getCollectionReport } from '@/lib/services/financial-report.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const report = await getCollectionReport(coachingCenterId, {
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      branchId,
      paymentMethod: searchParams.get('method') || undefined,
      batchId: searchParams.get('batch') || undefined,
      collectedById: searchParams.get('collector') || undefined,
    });

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}
