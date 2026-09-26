import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentResultHistory } from '@/lib/services/exam-result.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** Published-only, session-derived studentId — no client-supplied identity (AGENTS.md §5/§27). */
export async function GET() {
  try {
    const session = await requireStudentPortal();
    const history = await getStudentResultHistory(session.coachingCenterId, session.studentId!, true);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/results GET');
  }
}
