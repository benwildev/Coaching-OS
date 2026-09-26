import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { getChildProfileForGuardian } from '@/lib/services/portal-profile.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    const student = await getChildProfileForGuardian(session, studentId);
    return NextResponse.json({ success: true, student });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId] GET');
  }
}
