import { NextResponse } from 'next/server';
import { requirePermission, requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { listHomeworkSubmissions, resolveHomeworkScope } from '@/lib/services/homework.service';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ homeworkId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('homework.read');
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const result = await listHomeworkSubmissions(scope, homeworkId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId]/submissions GET');
  }
}
