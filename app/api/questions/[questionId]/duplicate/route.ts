import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { duplicateQuestion, resolveQuestionScope } from '@/lib/services/question.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { questionId } = await params;
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const question = await duplicateQuestion(scope, questionId);
    return NextResponse.json({ success: true, question }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions/[questionId]/duplicate POST');
  }
}
