import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertTeacherSelfAccess } from '@/lib/auth/session';
import { getTeacherAttendanceHistory, recordTeacherAttendance } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { teacherAttendanceSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;

    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      assertTeacherSelfAccess(user, teacherId, own?.id || null);
    }

    const history = await getTeacherAttendanceHistory(coachingCenterId, teacherId);
    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error('[API /api/attendance/teacher/[teacherId] GET] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: error.message || 'Unauthorized' }, { status });
  }
}

// Marking a teacher's own daily check-in/out is an administrative HR action
// (front desk / admin records it), not teacher self-service.
export async function POST(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { teacherId } = await props.params;
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
  } catch (error: any) {
    console.error('[API /api/attendance/teacher/[teacherId] POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to record teacher attendance' }, { status: 400 });
  }
}
