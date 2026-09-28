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

    // Phase 10.5: a real "next due" figure (was previously a hardcoded
    // "Paid through September / Next due 10 Oct" on the client) — the
    // unpaid invoice with the earliest due date, or null if there isn't one.
    const nextDue = fees
      ? fees.invoices
          .filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT' && Number(i.dueAmount) > 0)
          .sort((a, b) => {
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return ad - bd;
          })[0] ?? null
      : null;

    return NextResponse.json({
      success: true,
      student,
      attendance: {
        percentage: attendance.percentage,
        present: attendance.present,
        late: attendance.late,
        absent: attendance.absent,
        excused: attendance.excused,
        total: attendance.total,
        recent: attendance.recent.slice(0, 8),
      },
      fees: fees ? fees.summary : null,
      nextDue: nextDue ? { dueDate: nextDue.dueDate, dueAmount: nextDue.dueAmount, invoiceNumber: nextDue.invoiceNumber } : null,
      upcomingExams,
      recentResults,
      notices: notices.notices,
      unreadNotificationCount: unreadCount,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/dashboard GET');
  }
}
