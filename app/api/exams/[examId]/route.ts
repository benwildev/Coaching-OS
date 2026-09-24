import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getExamById, updateExam } from '@/lib/services/exam.service';
import { updateExamSchema } from '@/lib/validations/exam';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { examId } = await params;
    const branchId = resolveEffectiveBranchId(user);

    const exam = await getExamById(coachingCenterId, examId, branchId);
    return NextResponse.json({ success: true, exam });
  } catch (error: any) {
    console.error('[API /api/exams/[examId] GET] Error:', error);
    if (error.message === 'EXAM_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Exam not found' }, { status: 404 });
    }
    if (error.message === 'UNAUTHORIZED' || error.message === 'TENANT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    const body = await request.json();
    const validated = updateExamSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const branchId = resolveEffectiveBranchId(user);
    const updated = await updateExam(
      coachingCenterId,
      examId,
      validated.data,
      user.userId,
      branchId
    );

    return NextResponse.json({ success: true, exam: updated });
  } catch (error: any) {
    console.error('[API /api/exams/[examId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to update exam' }, { status });
  }
}
