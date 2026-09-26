import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentAttendanceSummary, getStudentAttendanceRecords } from '@/lib/services/attendance.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireStudentPortal();
    const sp = new URL(request.url).searchParams;

    const [summary, history] = await Promise.all([
      getStudentAttendanceSummary(session.coachingCenterId, session.studentId!),
      getStudentAttendanceRecords(session.coachingCenterId, session.studentId!, {
        subjectId: sp.get('subject') || undefined,
        dateFrom: sp.get('dateFrom') || undefined,
        dateTo: sp.get('dateTo') || undefined,
        page: Number(sp.get('page')) || 1,
      }),
    ]);

    return NextResponse.json({ success: true, summary, ...history });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/attendance GET');
  }
}
