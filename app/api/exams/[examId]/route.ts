import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getExamById, updateExam } from '@/lib/services/exam.service';
import { updateExamSchema } from '@/lib/validations/exam';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { examId } = await params;
    const branchId = resolveEffectiveBranchId(user);

    const exam = await getExamById(coachingCenterId, examId, branchId, user);
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
    return apiErrorResponse(error, '/api/exams/[examId] GET');
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
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/[examId] PUT');
  }
}
