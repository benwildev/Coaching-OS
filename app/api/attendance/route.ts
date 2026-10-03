import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getTodaysClasses, getAttendanceDashboard } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';

import { getTeacherAuthorizedBatchIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.read');
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);
    const date = searchParams.get('date') || undefined;

    let teacherId: string | undefined;
    let authorizedBatchIds: string[] | undefined;
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      teacherId = own?.id || '__none__'; // no profile => show nothing rather than everything
      authorizedBatchIds = own ? await getTeacherAuthorizedBatchIds(coachingCenterId, own.id) : [];
    }

    const [todaysClasses, kpis] = await Promise.all([
      getTodaysClasses(coachingCenterId, { branchId, teacherId, date }),
      getAttendanceDashboard(
        coachingCenterId,
        branchId,
        user.role === 'TEACHER' ? { teacherId, batchIds: authorizedBatchIds } : undefined
      ),
    ]);

    return NextResponse.json({ success: true, todaysClasses, kpis });
  } catch (error) {
    console.error('[API /api/attendance GET] Error:', error);
    // Phase 14.2: requirePermission throws FORBIDDEN -> 403 (previously every error was 401).
    if (error instanceof Error && error.message === 'FORBIDDEN') return apiErrorResponse(error, '/api/attendance GET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
