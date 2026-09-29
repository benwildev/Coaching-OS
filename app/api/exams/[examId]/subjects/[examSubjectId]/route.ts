import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { updateExamSubject, deleteExamSubject } from '@/lib/services/exam.service';
import { updateExamSubjectSchema } from '@/lib/validations/exam';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string; examSubjectId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId, examSubjectId } = await params;

    const body = await request.json();
    const validated = updateExamSubjectSchema.safeParse(body);
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

    const updated = await updateExamSubject(
      coachingCenterId,
      user,
      examId,
      examSubjectId,
      validated.data,
      user.userId
    );

    return NextResponse.json({ success: true, examSubject: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/.../subjects/[examSubjectId] PUT');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ examId: string; examSubjectId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId, examSubjectId } = await params;

    await deleteExamSubject(coachingCenterId, user, examId, examSubjectId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/.../subjects/[examSubjectId] DELETE');
  }
}
