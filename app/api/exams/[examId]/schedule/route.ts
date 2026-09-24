import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { transitionExamStatus } from '@/lib/services/exam.service';
import { EXAM_STATUS } from '@/lib/validations/exam';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    const exam = await transitionExamStatus(
      coachingCenterId,
      examId,
      EXAM_STATUS.SCHEDULED,
      user.userId,
      user.role
    );

    return NextResponse.json({ success: true, exam, status: exam.status });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/schedule POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to schedule exam' }, { status: 400 });
  }
}
