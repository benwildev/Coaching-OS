import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getBatchesList, createBatch } from '@/lib/services/batch.service';
import { batchSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const result = await getBatchesList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId: searchParams.get('branch') || undefined,
      sessionId: searchParams.get('session') || undefined,
      programId: searchParams.get('program') || undefined,
      classId: searchParams.get('class') || undefined,
      groupId: searchParams.get('group') || undefined,
      courseId: searchParams.get('course') || undefined,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/batches GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

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
  } catch (error: any) {
    console.error('[API /api/batches POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create batch' }, { status });
  }
}
