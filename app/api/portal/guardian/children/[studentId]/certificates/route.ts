import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { listCertificatesForStudent } from '@/lib/services/certificate.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const certificates = await listCertificatesForStudent(session.coachingCenterId, studentId);
    return NextResponse.json({ success: true, certificates });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/certificates GET');
  }
}
