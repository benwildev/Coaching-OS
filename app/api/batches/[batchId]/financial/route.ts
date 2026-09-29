import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getBatchFinancialSummary } from '@/lib/services/financial-report.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { batchId } = await props.params;
    const summary = await getBatchFinancialSummary(coachingCenterId, batchId);
    if (!summary) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, summary.batch.branchId);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId]/financial GET');
  }
}
