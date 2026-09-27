import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getResultsList, getTeacherResultAccessWhere } from '@/lib/services/exam-result.service';
import { resultFilterSchema } from '@/lib/validations/result';

export const dynamic = 'force-dynamic';

/**
 * Staff results list (/results page). Portal users never reach this route —
 * they use /api/portal/* with session-derived identity.
 *   OWNER/ADMIN: whole tenant (optional branch filter)
 *   STAFF:       pinned to own branch when branch-scoped
 *   TEACHER:     own branch + only assigned (batch, subject) results — the
 *                same rule as marks entry (assertTeacherSubjectAccess)
 */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { searchParams } = new URL(request.url);

    const queryObj: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      if (val) queryObj[key] = val;
    });

    const parsed = resultFilterSchema.safeParse(queryObj);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const branchId = resolveEffectiveBranchId(user, parsed.data.branchId);
    const accessWhere = await getTeacherResultAccessWhere(coachingCenterId, user);

    const result = await getResultsList(coachingCenterId, { ...parsed.data, branchId }, accessWhere);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/results');
  }
}
