import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentProfile } from '@/lib/services/portal-profile.service';
import { getStudentAttendanceSummary } from '@/lib/services/attendance.service';
import { getPortalFeeSummary } from '@/lib/services/portal-fee.service';
import { getStudentExams } from '@/lib/services/exam.service';
import { getStudentResultHistory } from '@/lib/services/exam-result.service';
import { listNoticesForStudent } from '@/lib/services/notice-recipients.service';
import { getPortalUnreadCount } from '@/lib/services/portal-notification.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const studentId = session.studentId!;

    const [student, attendance, fees, exams, results, notices, unreadCount] = await Promise.all([
      getStudentProfile(session),
      getStudentAttendanceSummary(session.coachingCenterId, studentId),
      getPortalFeeSummary(session.coachingCenterId, studentId).catch(() => null),
      getStudentExams(session.coachingCenterId, studentId, true),
      getStudentResultHistory(session.coachingCenterId, studentId, true),
      listNoticesForStudent(session.coachingCenterId, studentId, { pageSize: 5 }),
      getPortalUnreadCount(session),
    ]);

    const today = new Date();
    const upcomingExams = exams
      .filter((e) => e.status === 'SCHEDULED' && e.startDate && new Date(e.startDate) >= today)
      .slice(0, 5);

    const recentResults = results.slice(0, 5);

    return NextResponse.json({
      success: true,
      student,
      attendance: { percentage: attendance.percentage, present: attendance.present, late: attendance.late, absent: attendance.absent, excused: attendance.excused, total: attendance.total },
      fees: fees ? fees.summary : null,
      upcomingExams,
      recentResults,
      notices: notices.notices,
      unreadNotificationCount: unreadCount,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/dashboard GET');
  }
}
