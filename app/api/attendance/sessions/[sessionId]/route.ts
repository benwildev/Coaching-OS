import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertTeacherSelfAccess, assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getAttendanceSessionDetail, bulkMarkAttendance } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { bulkMarkSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

async function assertSessionAccess(
  coachingCenterId: string,
  user: SessionUser,
  session: { teacherId: string | null; branchId: string }
) {
  assertBranchAccess(user, session.branchId);
  if (user.role === 'TEACHER') {
    const own = await getTeacherByUserId(coachingCenterId, user.userId);
    assertTeacherSelfAccess(user, session.teacherId, own?.id || null);
  }
}

export async function GET(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { sessionId } = await props.params;

    const detail = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!detail) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    await assertSessionAccess(coachingCenterId, user, detail.session);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/sessions/[sessionId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const { sessionId } = await props.params;
    const existing = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!existing) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    await assertSessionAccess(coachingCenterId, user, existing.session);

    const body = await request.json();
    const validated = bulkMarkSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    await bulkMarkAttendance(coachingCenterId, sessionId, validated.data, user.userId);
    const detail = await getAttendanceSessionDetail(coachingCenterId, sessionId);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/sessions/[sessionId] PUT');
  }
}
