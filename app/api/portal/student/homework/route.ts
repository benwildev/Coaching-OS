import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentPortalHomeworks } from '@/lib/services/homework.service';

export const dynamic = 'force-dynamic';

/**
 * Published homework relevant to the authenticated student only. studentId
 * comes from the portal session — never from the client (AGENTS.md §9/§27).
 */
export async function GET(request: Request) {
  try {
    const session = await requireStudentPortal();
    const sp = new URL(request.url).searchParams;
    const result = await getStudentPortalHomeworks(session.coachingCenterId, session.studentId!, {
      status: sp.get('status') || undefined,
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/homework GET');
  }
}
