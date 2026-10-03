import { NextResponse } from 'next/server';
import { requirePermission, requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { deleteHomework, getHomeworkById, resolveHomeworkScope, updateHomework } from '@/lib/services/homework.service';
import { updateHomeworkSchema } from '@/lib/validations/homework';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ homeworkId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('homework.read');
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const homework = await getHomeworkById(scope, homeworkId);
    return NextResponse.json({ success: true, homework });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('homework.update');
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateHomeworkSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const homework = await updateHomework(scope, homeworkId, parsed.data);
    return NextResponse.json({ success: true, homework });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId] PUT');
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('homework.delete');
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const result = await deleteHomework(scope, homeworkId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId] DELETE');
  }
}
