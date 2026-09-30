import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resolveHomeworkScope, transitionHomeworkStatus } from '@/lib/services/homework.service';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ homeworkId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const homework = await transitionHomeworkStatus(scope, homeworkId, 'PUBLISHED');
    return NextResponse.json({ success: true, homework });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId]/publish POST');
  }
}
