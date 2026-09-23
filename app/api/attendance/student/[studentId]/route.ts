import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { getStudentAttendanceSummary } from '@/lib/services/attendance.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { studentId } = await props.params;
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch') || undefined;

    const summary = await getStudentAttendanceSummary(coachingCenterId, studentId, batchId);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[API /api/attendance/student/[studentId] GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
