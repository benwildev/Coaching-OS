import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getPortalFeeSummary } from '@/lib/services/portal-fee.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const profile = await getPortalFeeSummary(session.coachingCenterId, session.studentId!);
    return NextResponse.json({ success: true, student: profile.student, summary: profile.summary, invoices: profile.invoices });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/fees GET');
  }
}
