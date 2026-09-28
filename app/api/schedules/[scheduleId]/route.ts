import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { updateClassSchedule, deleteClassSchedule } from '@/lib/services/schedule.service';
import { classScheduleUpdateSchema } from '@/lib/validations/schedule';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ scheduleId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { scheduleId } = await props.params;

    // Phase 10.5: check the EXISTING schedule's branch, not just the
    // submitted one — previously a branch-locked STAFF at branch B1 could
    // PUT any scheduleId belonging to branch B2 and submit branchId: B1,
    // which passed the old check and reassigned the schedule to B1.
    const existing = await prisma.classSchedule.findFirst({ where: { id: scheduleId, coachingCenterId }, select: { branchId: true } });
    if (!existing) return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

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

    // Phase 10.5: previously no branch check at all.
    const existing = await prisma.classSchedule.findFirst({ where: { id: scheduleId, coachingCenterId }, select: { branchId: true } });
    if (!existing) return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    await deleteClassSchedule(coachingCenterId, scheduleId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/schedules/[scheduleId] DELETE] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete schedule' }, { status });
  }
}
