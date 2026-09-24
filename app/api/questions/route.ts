import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  createQuestion,
  getQuestionStats,
  listQuestions,
  resolveQuestionScope,
} from '@/lib/services/question.service';
import { createQuestionSchema } from '@/lib/validations/question';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const sp = new URL(request.url).searchParams;

    const [result, stats] = await Promise.all([
      listQuestions(scope, {
        page: Number(sp.get('page')) || 1,
        pageSize: Number(sp.get('pageSize')) || 20,
        search: sp.get('search') || undefined,
        type: sp.get('type') || undefined,
        difficulty: sp.get('difficulty') || undefined,
        status: sp.get('status') || undefined,
        subjectId: sp.get('subject') || undefined,
        subjectPaperId: sp.get('subjectPaper') || undefined,
        academicClassId: sp.get('class') || undefined,
        academicGroupId: sp.get('group') || undefined,
        chapter: sp.get('chapter') || undefined,
        createdById: sp.get('createdBy') || undefined,
        excludeIds: sp.get('exclude')?.split(',').filter(Boolean).slice(0, 200),
      }),
      sp.get('stats') === '1' ? getQuestionStats(scope) : Promise.resolve(undefined),
    ]);

    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const scope = await resolveQuestionScope(coachingCenterId, user);
    const question = await createQuestion(scope, parsed.data);
    return NextResponse.json({ success: true, question }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions POST');
  }
}
