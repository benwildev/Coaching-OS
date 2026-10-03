import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
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
    await requirePermission('exams.reopen');
    const { examId } = await params;

    let reason = 'Reopened by Administrator';
    try {
      const body = await request.json();
      if (body?.reason) reason = body.reason;
    } catch {
      // Default reason
    }

    const exam = await transitionExamStatus(
      coachingCenterId,
      examId,
      EXAM_STATUS.ONGOING,
      user.userId,
      user,
      reason
    );

    return NextResponse.json({ success: true, exam, status: exam.status });
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/[examId]/reopen POST');
  }
}
