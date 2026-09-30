import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentPortalHomeworkDetail } from '@/lib/services/homework.service';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ homeworkId: string }> }) {
  try {
    const session = await requireStudentPortal();
    await requireFeature(session.coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const homework = await getStudentPortalHomeworkDetail(session.coachingCenterId, session.studentId!, homeworkId);
    return NextResponse.json({ success: true, homework });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/homework/[homeworkId] GET');
  }
}
