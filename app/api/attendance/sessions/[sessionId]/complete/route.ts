import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertTeacherSelfAccess, assertBranchAccess } from '@/lib/auth/session';
import { completeAttendanceSession, getAttendanceSessionDetail } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { completeSessionSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const { sessionId } = await props.params;
    const existing = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!existing) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    assertBranchAccess(user, existing.session.branchId);
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      assertTeacherSelfAccess(user, existing.session.teacherId, own?.id || null);
    }

    const body = await request.json().catch(() => ({}));
    const validated = completeSessionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const session = await completeAttendanceSession(coachingCenterId, sessionId, validated.data.allowIncomplete, user.userId);
    return NextResponse.json({ success: true, session });
  } catch (error: any) {
    console.error('[API /api/attendance/sessions/[sessionId]/complete POST] Error:', error);
    if (error.message === 'UNMARKED_STUDENTS') {
      return NextResponse.json(
        {
          success: false,
          error: 'Some students are still unmarked. Confirm to complete with unmarked students.',
          code: 'UNMARKED_STUDENTS',
          unmarkedCount: error.unmarkedCount,
        },
        { status: 409 }
      );
    }
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to complete attendance' }, { status });
  }
}
