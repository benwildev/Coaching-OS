import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getStudentResultHistory } from '@/lib/services/exam-result.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const history = await getStudentResultHistory(session.coachingCenterId, studentId, true);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/results GET');
  }
}
