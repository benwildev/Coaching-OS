import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  deleteQuestion,
  getQuestionById,
  resolveQuestionScope,
  updateQuestion,
} from '@/lib/services/question.service';
import { updateQuestionSchema } from '@/lib/validations/question';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ questionId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { questionId } = await params;
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const question = await getQuestionById(scope, questionId);
    return NextResponse.json({ success: true, question });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions/[questionId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { questionId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateQuestionSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const scope = await resolveQuestionScope(coachingCenterId, user);
    const question = await updateQuestion(scope, questionId, parsed.data);
    return NextResponse.json({ success: true, question });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions/[questionId] PUT');
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { questionId } = await params;
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const result = await deleteQuestion(scope, questionId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions/[questionId] DELETE');
  }
}
