import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { resolveQuestionScope } from '@/lib/services/question.service';
import {
  createQuestionPaper,
  getQuestionPaperStats,
  listQuestionPapers,
} from '@/lib/services/question-paper.service';
import { createQuestionPaperSchema } from '@/lib/validations/question-paper';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const sp = new URL(request.url).searchParams;
    const [result, stats] = await Promise.all([
      listQuestionPapers(scope, {
        page: Number(sp.get('page')) || 1,
        pageSize: Number(sp.get('pageSize')) || 15,
        search: sp.get('search') || undefined,
        status: sp.get('status') || undefined,
        subjectId: sp.get('subject') || undefined,
        academicClassId: sp.get('class') || undefined,
      }),
      sp.get('stats') === '1' ? getQuestionPaperStats(scope) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return apiErrorResponse(error, '/api/question-papers GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = createQuestionPaperSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const paper = await createQuestionPaper(scope, parsed.data);
    return NextResponse.json({ success: true, paper }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/question-papers POST');
  }
}
