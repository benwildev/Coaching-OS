import { NextResponse } from 'next/server';
import { requireTenant, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getResultsList } from '@/lib/services/exam-result.service';
import { resultFilterSchema } from '@/lib/validations/result';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const queryObj: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      if (val) queryObj[key] = val;
    });

    const parsed = resultFilterSchema.safeParse(queryObj);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid filter parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const branchId = resolveEffectiveBranchId(user, parsed.data.branchId);

    const result = await getResultsList(coachingCenterId, {
      ...parsed.data,
      branchId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API /api/results GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unauthorized' }, { status: 401 });
  }
}
