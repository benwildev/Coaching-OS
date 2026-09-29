import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getCertificateForRender } from '@/lib/services/certificate.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string; certificateId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId, certificateId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const data = await getCertificateForRender(session.coachingCenterId, studentId, certificateId);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/certificates/[certificateId] GET');
  }
}
