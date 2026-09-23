import { NextResponse } from 'next/server';
import { requireTenant, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getLowAttendanceStudents } from '@/lib/services/attendance.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);
    const thresholdParam = searchParams.get('threshold');
    const threshold = thresholdParam ? Number(thresholdParam) : undefined;

    const students = await getLowAttendanceStudents(coachingCenterId, { branchId, threshold });
    return NextResponse.json({ success: true, students });
  } catch (error) {
    console.error('[API /api/attendance/alerts GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
