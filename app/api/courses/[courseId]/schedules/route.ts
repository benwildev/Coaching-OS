import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ courseId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const { courseId } = await props.params;
    const course = await prisma.course.findFirst({
      where: { id: courseId, coachingCenterId },
      select: { id: true, name: true, code: true },
    });
    if (!course) {
      return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const where: Prisma.ClassScheduleWhereInput = {
      coachingCenterId,
      batch: {
        courseId,
      },
      ...(branchId ? { branchId } : {}),
      ...(user.role === 'TEACHER' ? { teacher: { userId: user.userId } } : {}),
    };

    const schedules = await prisma.classSchedule.findMany({
      where,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            banglaName: true,
            code: true,
            branch: { select: { id: true, name: true } },
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            banglaName: true,
            code: true,
          },
        },
        teacher: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        },
        room: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    const items = schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      batchName: s.batch.name,
      batchCode: s.batch.code,
      subjectName: s.subject.name,
      subjectBanglaName: s.subject.banglaName,
      subjectCode: s.subject.code,
      teacherName: s.teacher?.user?.name || 'Unassigned',
      roomName: s.room?.name || s.room?.code || '—',
      branchName: s.batch.branch?.name || '—',
    }));

    return NextResponse.json({
      success: true,
      course: { id: course.id, name: course.name, code: course.code },
      count: items.length,
      schedules: items,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId]/schedules GET');
  }
}
