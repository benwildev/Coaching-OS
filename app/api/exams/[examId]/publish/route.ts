import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { verifyAndPublishExam } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { examId } = await params;

    let allowIncomplete = false;
    try {
      const body = await request.json();
      allowIncomplete = Boolean(body?.allowIncomplete);
    } catch {
      // Empty body or no JSON is fine, defaults to false
    }

    const exam = await verifyAndPublishExam(
      coachingCenterId,
      examId,
      user.userId,
      allowIncomplete
    );

    return NextResponse.json({ success: true, exam, status: exam.status });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/publish POST] Error:', error);
    const isIncomplete = error.message?.startsWith('INCOMPLETE_RESULTS');
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to publish exam results',
        isIncomplete,
      },
      { status: 400 }
    );
  }
}
