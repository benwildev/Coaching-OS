import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, assertTeacherSelfAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTeacherAttendanceHistory, recordTeacherAttendance } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { teacherAttendanceSchema } from '@/lib/validations/attendance';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { teacherId } = await props.params;

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, coachingCenterId },
      select: { branchId: true },
    });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      assertTeacherSelfAccess(user, teacherId, own?.id || null);
    } else {
      // Phase 10.5: STAFF previously had no branch check here at all —
      // a branch-locked STAFF could view any teacher's attendance history
      // tenant-wide.
      assertBranchAccess(user, teacher.branchId);
    }

    const history = await getTeacherAttendanceHistory(coachingCenterId, teacherId);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/teacher/[teacherId] GET');
  }
}

// Marking a teacher's own daily check-in/out is an administrative HR action
// (front desk / admin records it), not teacher self-service.
export async function POST(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { teacherId } = await props.params;

    // Phase 10.5: previously no branch check at all — a branch-locked
    // STAFF could record attendance for any teacher in any branch.
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, coachingCenterId },
      select: { branchId: true },
    });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }
    assertBranchAccess(user, teacher.branchId);

    const body = await request.json();
    const validated = teacherAttendanceSchema.safeParse({ ...body, teacherId });
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const record = await recordTeacherAttendance(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, record });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/teacher/[teacherId] POST');
  }
}
