import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { verifyAndPublishExam } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('exams.publish');
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
    if (error?.message?.startsWith('INCOMPLETE_RESULTS')) {
      return NextResponse.json(
        { success: false, error: error.message, isIncomplete: true },
        { status: 400 }
      );
    }
    return apiErrorResponse(error, '/api/exams/[examId]/publish POST');
  }
}
