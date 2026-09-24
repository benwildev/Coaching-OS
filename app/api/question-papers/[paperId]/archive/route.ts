import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resolveQuestionScope } from '@/lib/services/question.service';
import { archiveQuestionPaper } from '@/lib/services/question-paper.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { paperId } = await params;
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const paper = await archiveQuestionPaper(scope, paperId);
    return NextResponse.json({ success: true, paper });
  } catch (error) {
    return apiErrorResponse(error, '/api/question-papers/[paperId]/archive POST');
  }
}
