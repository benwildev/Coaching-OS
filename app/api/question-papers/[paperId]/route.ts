import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { resolveQuestionScope } from '@/lib/services/question.service';
import { getQuestionPaperById, updateQuestionPaper } from '@/lib/services/question-paper.service';
import { updateQuestionPaperSchema } from '@/lib/validations/question-paper';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ paperId: string }> };

/** print=1 returns the student-safe version (no answers, no correct flags). */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { paperId } = await params;
    const forPrint = new URL(request.url).searchParams.get('print') === '1';
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const paper = await getQuestionPaperById(scope, paperId, { forPrint });
    return NextResponse.json({ success: true, paper });
  } catch (error) {
    return apiErrorResponse(error, '/api/question-papers/[paperId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { paperId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateQuestionPaperSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const paper = await updateQuestionPaper(scope, paperId, parsed.data);
    return NextResponse.json({ success: true, paper });
  } catch (error) {
    return apiErrorResponse(error, '/api/question-papers/[paperId] PUT');
  }
}
