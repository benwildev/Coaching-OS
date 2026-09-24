import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { getBatchPerformanceStats } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { batchId } = await params;

    const stats = await getBatchPerformanceStats(coachingCenterId, batchId);
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    console.error('[API /api/results/batch/[batchId] GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to load batch performance' }, { status: 400 });
  }
}
