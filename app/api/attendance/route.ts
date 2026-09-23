import { NextResponse } from 'next/server';
import { requireTenant, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getTodaysClasses, getAttendanceDashboard } from '@/lib/services/attendance.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);
    const date = searchParams.get('date') || undefined;

    let teacherId: string | undefined;
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      teacherId = own?.id || '__none__'; // no profile => show nothing rather than everything
    }

    const [todaysClasses, kpis] = await Promise.all([
      getTodaysClasses(coachingCenterId, { branchId, teacherId, date }),
      getAttendanceDashboard(coachingCenterId, branchId),
    ]);

    return NextResponse.json({ success: true, todaysClasses, kpis });
  } catch (error) {
    console.error('[API /api/attendance GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
