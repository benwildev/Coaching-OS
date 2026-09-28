import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { listHomeworkSubmissions, resolveHomeworkScope } from '@/lib/services/homework.service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ homeworkId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { homeworkId } = await params;
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const result = await listHomeworkSubmissions(scope, homeworkId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId]/submissions GET');
  }
}
