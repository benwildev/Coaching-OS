import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentPortalMaterials } from '@/lib/services/study-material.service';

export const dynamic = 'force-dynamic';

/**
 * Published, student-relevant materials only. The tenant comes from the
 * session; the student must belong to it and to the branch of the caller.
 */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const sp = new URL(request.url).searchParams;
    const studentId = sp.get('studentId');
    if (!studentId) {
      return NextResponse.json({ success: false, error: 'STUDENT_REQUIRED', message: 'studentId is required' }, { status: 400 });
    }
    const result = await getStudentPortalMaterials(coachingCenterId, user, studentId, {
      search: sp.get('search') || undefined,
      subjectId: sp.get('subject') || undefined,
      type: sp.get('type') || undefined,
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/materials GET');
  }
}
