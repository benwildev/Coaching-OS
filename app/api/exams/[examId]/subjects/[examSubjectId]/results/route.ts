import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import {
  getExamSubjectResults,
  bulkSaveSubjectResults,
} from '@/lib/services/exam-result.service';
import { bulkResultsSaveSchema } from '@/lib/validations/result';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string; examSubjectId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { examId, examSubjectId } = await params;

    const data = await getExamSubjectResults(
      coachingCenterId,
      examId,
      examSubjectId,
      user
    );

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error('[API /api/exams/.../results GET] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to load marks roster' }, { status });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string; examSubjectId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { examId, examSubjectId } = await params;

    const body = await request.json();
    const validated = bulkResultsSaveSchema.safeParse(body);
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

    const result = await bulkSaveSubjectResults(
      coachingCenterId,
      examId,
      examSubjectId,
      validated.data.results,
      user
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API /api/exams/.../results PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to save marks' }, { status });
  }
}
