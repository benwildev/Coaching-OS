import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getStudentPortalHomeworks } from '@/lib/services/homework.service';
import { apiErrorResponse } from '@/lib/api-error';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    await requireFeature(session.coachingCenterId, 'HOMEWORK');
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const sp = new URL(request.url).searchParams;
    const result = await getStudentPortalHomeworks(session.coachingCenterId, studentId, {
      status: sp.get('status') || undefined,
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/homework GET');
  }
}
