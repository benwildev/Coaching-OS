import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getStudentPortalMaterials } from '@/lib/services/study-material.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireGuardianPortal();
    const { studentId } = await params;
    await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);

    const sp = new URL(request.url).searchParams;
    const result = await getStudentPortalMaterials(session.coachingCenterId, null, studentId, {
      search: sp.get('search') || undefined,
      subjectId: sp.get('subject') || undefined,
      type: sp.get('type') || undefined,
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children/[studentId]/materials GET');
  }
}
