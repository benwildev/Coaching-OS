import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getSchedulesList, createClassSchedule } from '@/lib/services/schedule.service';
import { classScheduleSchema } from '@/lib/validations/schedule';
import type { DayOfWeek } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const schedules = await getSchedulesList(coachingCenterId, {
      branchId: searchParams.get('branch') || undefined,
      batchId: searchParams.get('batch') || undefined,
      teacherId: searchParams.get('teacher') || undefined,
      roomId: searchParams.get('room') || undefined,
      dayOfWeek: (searchParams.get('day') as DayOfWeek) || undefined,
      status: searchParams.get('status') || undefined,
    });

    return NextResponse.json({ success: true, schedules });
  } catch (error) {
    console.error('[API /api/schedules GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const body = await request.json();
    const validated = classScheduleSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    assertBranchAccess(user, validated.data.branchId);

    const schedule = await createClassSchedule(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, schedule }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/schedules POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : error.conflicts ? 409 : 400;
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create schedule', conflicts: error.conflicts || undefined },
      { status }
    );
  }
}
