import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentExams } from '@/lib/services/exam.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const exams = await getStudentExams(session.coachingCenterId, session.studentId!, true);
    return NextResponse.json({ success: true, exams });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/exams GET');
  }
}
