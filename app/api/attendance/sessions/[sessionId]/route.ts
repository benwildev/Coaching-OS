import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertTeacherSelfAccess, assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getAttendanceSessionDetail, bulkMarkAttendance } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { bulkMarkSchema } from '@/lib/validations/attendance';

import { assertTeacherCanAccessAttendanceSession } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

async function assertSessionAccess(
  user: SessionUser,
  session: { teacherId: string | null; branchId: string; batchId: string; subjectId?: string | null; date?: Date }
) {
  assertBranchAccess(user, session.branchId);
  if (user.role === 'TEACHER') {
    await assertTeacherCanAccessAttendanceSession(user, session);
  }
}

export async function GET(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.read');
    const { sessionId } = await props.params;

    const detail = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!detail) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    await assertSessionAccess(user, detail.session);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/sessions/[sessionId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.update');

    const { sessionId } = await props.params;
    const existing = await getAttendanceSessionDetail(coachingCenterId, sessionId);
    if (!existing) return NextResponse.json({ success: false, error: 'Attendance session not found' }, { status: 404 });

    await assertSessionAccess(user, existing.session);

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
