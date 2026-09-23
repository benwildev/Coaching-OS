import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertTeacherSelfAccess, assertBranchAccess } from '@/lib/auth/session';
import { getOrCreateAttendanceSession, getAttendanceSessionDetail } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getOrCreateSessionSchema } from '@/lib/validations/attendance';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const body = await request.json();
    const validated = getOrCreateSessionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const schedule = await prisma.classSchedule.findFirst({
      where: { id: validated.data.classScheduleId, coachingCenterId },
      select: { teacherId: true, branchId: true },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Class schedule not found' }, { status: 404 });
    }
    assertBranchAccess(user, schedule.branchId);
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      assertTeacherSelfAccess(user, schedule.teacherId, own?.id || null);
    }

    const session = await getOrCreateAttendanceSession(
      coachingCenterId,
      validated.data.classScheduleId,
      validated.data.date,
      user.userId
    );
    const detail = await getAttendanceSessionDetail(coachingCenterId, session.id);

    return NextResponse.json({ success: true, ...detail }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/attendance/sessions POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to open attendance session' }, { status });
  }
}
