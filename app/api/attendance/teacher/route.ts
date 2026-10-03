import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTeachersDailyAttendance, recordTeacherBulkAttendance } from '@/lib/services/attendance.service';
import { teacherBulkAttendanceSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teacher_attendance.read');

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    const requestedBranchId = searchParams.get('branch') || searchParams.get('branchId') || undefined;
    const effectiveBranchId = resolveEffectiveBranchId(user, requestedBranchId);

    const data = await getTeachersDailyAttendance(
      coachingCenterId,
      { date, branchId: effectiveBranchId },
      user
    );

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/teacher GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teacher_attendance.create');

    if (user.role === 'TEACHER') {
      throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }

    const body = await request.json();
    const validated = teacherBulkAttendanceSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const result = await recordTeacherBulkAttendance(
      coachingCenterId,
      validated.data,
      user.userId,
      user
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/teacher POST');
  }
}
