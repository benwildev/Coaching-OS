import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertTeacherSelfAccess, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { markStudentAttendance, getAttendanceSessionDetail } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { markStudentSchema } from '@/lib/validations/attendance';

import { assertTeacherCanAccessAttendanceSession, assertTeacherCanAccessStudent } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  props: { params: Promise<{ sessionId: string; studentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.update');

    const { sessionId, studentId } = await props.params;
    const existing = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!existing) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    assertBranchAccess(user, existing.session.branchId);
    if (user.role === 'TEACHER') {
      await assertTeacherCanAccessAttendanceSession(user, existing.session);
      await assertTeacherCanAccessStudent(user, studentId);
    }

    const body = await request.json();
    const validated = markStudentSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const mark = await markStudentAttendance(coachingCenterId, sessionId, studentId, validated.data, user.userId);
    return NextResponse.json({ success: true, mark });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/sessions/[sessionId]/students/[studentId] PUT');
  }
}
