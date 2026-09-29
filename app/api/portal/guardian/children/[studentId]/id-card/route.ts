import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getIdCardData } from '@/lib/services/id-card.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const data = await getIdCardData(session.coachingCenterId, studentId);
    if (!data) return NextResponse.json({ success: false, error: 'STUDENT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/id-card GET');
  }
}
