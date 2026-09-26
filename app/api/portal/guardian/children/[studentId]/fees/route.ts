import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getPortalFeeSummary } from '@/lib/services/portal-fee.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const profile = await getPortalFeeSummary(session.coachingCenterId, studentId);
    return NextResponse.json({ success: true, student: profile.student, summary: profile.summary, invoices: profile.invoices, payments: profile.payments });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/fees GET');
  }
}
