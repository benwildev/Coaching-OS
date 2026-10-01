import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
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
    return apiErrorResponse(error, '/api/teachers GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await request.json();
    const validated = teacherSchema.safeParse(body);
    if (!validated.success) {
      const fieldErrors = validated.error.flatten().fieldErrors;
      const firstMsg = Object.values(fieldErrors).flat()[0] || 'Validation failed';
      return NextResponse.json(
        { success: false, error: firstMsg, details: fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const teacher = await createTeacher(coachingCenterId, validated.data, user.userId, user);
    return NextResponse.json({
      success: true,
      message: 'Teacher created successfully',
      teacher,
      userAccount: (teacher as any).userAccount ?? { created: false },
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers POST');
  }
}
