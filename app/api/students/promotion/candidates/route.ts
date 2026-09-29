import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getPromotionCandidates } from '@/lib/services/promotion.service';
import { promotionCandidatesQuerySchema } from '@/lib/validations/bulk-student';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const sp = new URL(request.url).searchParams;
    const parsed = promotionCandidatesQuerySchema.safeParse({
      sourceSessionId: sp.get('sourceSessionId') || undefined,
      sourceClassId: sp.get('sourceClassId') || undefined,
      sourceGroupId: sp.get('sourceGroupId') || undefined,
      sourceBatchId: sp.get('sourceBatchId') || undefined,
    });
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const branchId = resolveEffectiveBranchId(user, sp.get('branch') || undefined);
    const students = await getPromotionCandidates(coachingCenterId, { ...parsed.data, branchId });
    return NextResponse.json({ success: true, students });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/promotion/candidates GET');
  }
}
