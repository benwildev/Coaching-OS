import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { transitionExamStatus } from '@/lib/services/exam.service';
import { EXAM_STATUS } from '@/lib/validations/exam';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { examId } = await params;

    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body?.reason;
    } catch {
      // Reason is optional
    }

    const exam = await transitionExamStatus(
      coachingCenterId,
      examId,
      EXAM_STATUS.CANCELLED,
      user.userId,
      user.role,
      reason
    );

    return NextResponse.json({ success: true, exam, status: exam.status });
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/[examId]/cancel POST');
  }
}
