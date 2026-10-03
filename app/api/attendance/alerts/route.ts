import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getLowAttendanceStudents } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedBatchIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.alerts.read');
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);
    const thresholdParam = searchParams.get('threshold');
    const threshold = thresholdParam ? Number(thresholdParam) : undefined;

    let batchIds: string[] | undefined;
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      batchIds = own ? await getTeacherAuthorizedBatchIds(coachingCenterId, own.id) : [];
    }

    const students = await getLowAttendanceStudents(coachingCenterId, { branchId, threshold, batchIds });
    return NextResponse.json({ success: true, students });
  } catch (error) {
    console.error('[API /api/attendance/alerts GET] Error:', error);
    // Phase 14.2: requirePermission throws FORBIDDEN -> 403 (previously every error was 401).
    if (error instanceof Error && error.message === 'FORBIDDEN') return apiErrorResponse(error, '/api/attendance/alerts GET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
