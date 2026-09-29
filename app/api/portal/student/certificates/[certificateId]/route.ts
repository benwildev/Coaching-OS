import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getCertificateForRender } from '@/lib/services/certificate.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ certificateId: string }> }) {
  try {
    const session = await requireStudentPortal();
    const { certificateId } = await params;
    const data = await getCertificateForRender(session.coachingCenterId, session.studentId!, certificateId);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/certificates/[certificateId] GET');
  }
}
