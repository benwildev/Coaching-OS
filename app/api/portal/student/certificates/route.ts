import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { listCertificatesForStudent } from '@/lib/services/certificate.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const certificates = await listCertificatesForStudent(session.coachingCenterId, session.studentId!);
    return NextResponse.json({ success: true, certificates });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/certificates GET');
  }
}
