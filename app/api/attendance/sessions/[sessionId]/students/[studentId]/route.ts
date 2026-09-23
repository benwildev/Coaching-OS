import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertTeacherSelfAccess, assertBranchAccess } from '@/lib/auth/session';
import { markStudentAttendance, getAttendanceSessionDetail } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { markStudentSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  props: { params: Promise<{ sessionId: string; studentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const { sessionId, studentId } = await props.params;
    const existing = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!existing) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    assertBranchAccess(user, existing.session.branchId);
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      assertTeacherSelfAccess(user, existing.session.teacherId, own?.id || null);
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
  } catch (error: any) {
    console.error('[API /api/attendance/sessions/[sessionId]/students/[studentId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to mark attendance' }, { status });
  }
}
