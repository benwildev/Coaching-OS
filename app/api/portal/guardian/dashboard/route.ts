import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { getGuardianChildren } from '@/lib/services/portal-profile.service';
import { getStudentAttendanceSummary } from '@/lib/services/attendance.service';
import { getPortalFeeSummary } from '@/lib/services/portal-fee.service';
import { getStudentExams } from '@/lib/services/exam.service';
import { getStudentResultHistory } from '@/lib/services/exam-result.service';
import { listNoticesForGuardian } from '@/lib/services/notice-recipients.service';
import { getPortalUnreadCount } from '@/lib/services/portal-notification.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * `?child=` only ever picks which of THIS guardian's own children to
 * summarize by default — it is validated against the server-computed
 * children list below before use, never trusted as authorization by itself
 * (AGENTS.md §5/§16).
 */
export async function GET(request: Request) {
  try {
    const session = await requireGuardianPortal();
    const children = await getGuardianChildren(session);

    if (children.length === 0) {
      return NextResponse.json({ success: true, children: [], selectedChild: null, summary: null, notices: [], unreadNotificationCount: 0 });
    }

    const requestedId = new URL(request.url).searchParams.get('child');
    const allowedIds = new Set(children.map((c) => c.student.id));
    const selected = (requestedId && allowedIds.has(requestedId))
      ? children.find((c) => c.student.id === requestedId)!
      : children.find((c) => c.isPrimary) || children[0];

    const studentId = selected.student.id;
    const [attendance, fees, exams, results, notices, unreadCount] = await Promise.all([
      getStudentAttendanceSummary(session.coachingCenterId, studentId),
      getPortalFeeSummary(session.coachingCenterId, studentId).catch(() => null),
      getStudentExams(session.coachingCenterId, studentId, true),
      getStudentResultHistory(session.coachingCenterId, studentId, true),
      listNoticesForGuardian(session.coachingCenterId, session.guardianId!, { pageSize: 5 }),
      getPortalUnreadCount(session),
    ]);

    const today = new Date();
    const upcomingExams = exams.filter((e) => e.status === 'SCHEDULED' && e.startDate && new Date(e.startDate) >= today).slice(0, 5);
    const recentResults = results.slice(0, 5);

    return NextResponse.json({
      success: true,
      children: children.map((c) => ({ student: c.student, isPrimary: c.isPrimary })),
      selectedChild: selected.student,
      attendance: { percentage: attendance.percentage, present: attendance.present, late: attendance.late, absent: attendance.absent, excused: attendance.excused, total: attendance.total },
      fees: fees ? fees.summary : null,
      upcomingExams,
      recentResults,
      notices: notices.notices,
      unreadNotificationCount: unreadCount,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/dashboard GET');
  }
}
