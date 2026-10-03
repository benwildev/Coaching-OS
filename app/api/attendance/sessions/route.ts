import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertTeacherSelfAccess, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getOrCreateAttendanceSession, getAttendanceSessionDetail } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getOrCreateSessionSchema } from '@/lib/validations/attendance';
import prisma from '@/lib/db';

import { assertTeacherCanAccessSchedule } from '@/lib/auth/teacher-scope';
import { toDateOnly } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.create');

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
      select: { teacherId: true, branchId: true, batchId: true, subjectId: true },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Class schedule not found' }, { status: 404 });
    }
    assertBranchAccess(user, schedule.branchId);
    if (user.role === 'TEACHER') {
      await assertTeacherCanAccessSchedule(user, schedule, toDateOnly(validated.data.date));
    }

    const session = await getOrCreateAttendanceSession(
      coachingCenterId,
      validated.data.classScheduleId,
      validated.data.date,
      user.userId
    );
    const detail = await getAttendanceSessionDetail(coachingCenterId, session.id);

    return NextResponse.json({ success: true, ...detail }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/sessions POST');
  }
}
