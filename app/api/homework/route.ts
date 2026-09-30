import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { createHomework, getHomeworkStats, listHomeworks, resolveHomeworkScope } from '@/lib/services/homework.service';
import { createHomeworkSchema } from '@/lib/validations/homework';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const sp = new URL(request.url).searchParams;
    const [result, stats] = await Promise.all([
      listHomeworks(scope, {
        page: Number(sp.get('page')) || 1,
        pageSize: Number(sp.get('pageSize')) || 20,
        search: sp.get('search') || undefined,
        status: sp.get('status') || undefined,
        batchId: sp.get('batch') || undefined,
        subjectId: sp.get('subject') || undefined,
      }),
      sp.get('stats') === '1' ? getHomeworkStats(scope) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const body = await request.json().catch(() => null);
    const parsed = createHomeworkSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const homework = await createHomework(scope, parsed.data);
    return NextResponse.json({ success: true, homework }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework POST');
  }
}
