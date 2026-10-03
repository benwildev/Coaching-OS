import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getBatchesList, createBatch } from '@/lib/services/batch.service';
import { batchSchema } from '@/lib/validations/batch';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedBatchIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.read');
    const { searchParams } = new URL(request.url);

    let batchIds: string[] | undefined;
    if (user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
      batchIds = teacher ? await getTeacherAuthorizedBatchIds(coachingCenterId, teacher.id) : [];
    }

    const result = await getBatchesList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId: resolveEffectiveBranchId(user, searchParams.get('branch') || undefined),
      sessionId: searchParams.get('session') || undefined,
      programId: searchParams.get('program') || undefined,
      classId: searchParams.get('class') || undefined,
      groupId: searchParams.get('group') || undefined,
      courseId: searchParams.get('course') || undefined,
      status: searchParams.get('status') || undefined,
      batchIds,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.create');

    const body = await request.json();
    const validated = batchSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    assertBranchAccess(user, validated.data.branchId);

    const batch = await createBatch(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, batch }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches POST');
  }
}
