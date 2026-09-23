import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getTeachersList, createTeacher } from '@/lib/services/teacher.service';
import { teacherSchema } from '@/lib/validations/teacher';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const result = await getTeachersList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId: resolveEffectiveBranchId(user, searchParams.get('branch') || undefined),
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '50', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/teachers GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await request.json();
    const validated = teacherSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const teacher = await createTeacher(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, teacher }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/teachers POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create teacher' }, { status });
  }
}
