import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { updateExamSubject, deleteExamSubject } from '@/lib/services/exam.service';
import { updateExamSubjectSchema } from '@/lib/validations/exam';

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
      examId,
      examSubjectId,
      validated.data,
      user.userId
    );

    return NextResponse.json({ success: true, examSubject: updated });
  } catch (error: any) {
    console.error('[API /api/exams/.../subjects/[examSubjectId] PUT] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update subject' }, { status: 400 });
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

    await deleteExamSubject(coachingCenterId, examId, examSubjectId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/exams/.../subjects/[examSubjectId] DELETE] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete subject' }, { status: 400 });
  }
}
