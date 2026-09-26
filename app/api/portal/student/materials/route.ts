import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentPortalMaterials } from '@/lib/services/study-material.service';

export const dynamic = 'force-dynamic';

/**
 * Published, student-relevant materials only. studentId comes from the
 * authenticated portal session — never from the client (AGENTS.md §5/§27;
 * this route previously trusted a `?studentId=` query param under staff
 * auth, which meant a real logged-in student could never use it).
 */
export async function GET(request: Request) {
  try {
    const session = await requireStudentPortal();
    const sp = new URL(request.url).searchParams;
    const result = await getStudentPortalMaterials(session.coachingCenterId, null, session.studentId!, {
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
