import { NextResponse } from 'next/server';
import { requireTenant, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getAttendanceHistory } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);

    let teacherId = searchParams.get('teacher') || undefined;
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      teacherId = own?.id || '__none__';
    }

    const result = await getAttendanceHistory(coachingCenterId, {
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      branchId: resolveEffectiveBranchId(user, searchParams.get('branch') || undefined),
      academicSessionId: searchParams.get('session') || undefined,
      programId: searchParams.get('program') || undefined,
      classId: searchParams.get('class') || undefined,
      groupId: searchParams.get('group') || undefined,
      batchId: searchParams.get('batch') || undefined,
      subjectId: searchParams.get('subject') || undefined,
      teacherId,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/attendance/history GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
