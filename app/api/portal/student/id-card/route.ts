import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getIdCardData } from '@/lib/services/id-card.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const data = await getIdCardData(session.coachingCenterId, session.studentId!);
    if (!data) return NextResponse.json({ success: false, error: 'STUDENT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/id-card GET');
  }
}
