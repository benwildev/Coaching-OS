import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentTimetable } from '@/lib/services/schedule.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Phase 10.5: real, database-driven timetable — studentId always comes
// from the authenticated portal session, never from the client.
export async function GET() {
  try {
    const session = await requireStudentPortal();
    const timetable = await getStudentTimetable(session.coachingCenterId, session.studentId!);
    return NextResponse.json({ success: true, timetable });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/timetable GET');
  }
}
