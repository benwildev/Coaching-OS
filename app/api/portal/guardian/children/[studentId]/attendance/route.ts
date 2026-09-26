import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getStudentAttendanceSummary, getStudentAttendanceRecords } from '@/lib/services/attendance.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const sp = new URL(request.url).searchParams;
    const [summary, history] = await Promise.all([
      getStudentAttendanceSummary(session.coachingCenterId, studentId),
      getStudentAttendanceRecords(session.coachingCenterId, studentId, {
        subjectId: sp.get('subject') || undefined,
        dateFrom: sp.get('dateFrom') || undefined,
        dateTo: sp.get('dateTo') || undefined,
        page: Number(sp.get('page')) || 1,
      }),
    ]);

    return NextResponse.json({ success: true, summary, ...history });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/attendance GET');
  }
}
