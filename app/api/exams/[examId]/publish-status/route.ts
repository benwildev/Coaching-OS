import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getExamPublishStatus } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    const status = await getExamPublishStatus(coachingCenterId, examId);
    return NextResponse.json({ success: true, ...status });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/publish-status GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to check publish status' }, { status: 400 });
  }
}
