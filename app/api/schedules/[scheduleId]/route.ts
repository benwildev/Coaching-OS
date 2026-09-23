import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { updateClassSchedule, deleteClassSchedule } from '@/lib/services/schedule.service';
import { classScheduleUpdateSchema } from '@/lib/validations/schedule';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ scheduleId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { scheduleId } = await props.params;
    const body = await request.json();
    const validated = classScheduleUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    assertBranchAccess(user, validated.data.branchId);

    const schedule = await updateClassSchedule(coachingCenterId, scheduleId, validated.data, user.userId);
    return NextResponse.json({ success: true, schedule });
  } catch (error: any) {
    console.error('[API /api/schedules/[scheduleId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : error.conflicts ? 409 : 400;
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update schedule', conflicts: error.conflicts || undefined },
      { status }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ scheduleId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { scheduleId } = await props.params;
    await deleteClassSchedule(coachingCenterId, scheduleId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/schedules/[scheduleId] DELETE] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete schedule' }, { status: 400 });
  }
}
