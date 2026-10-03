import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getFeeStructuresList, createFeeStructure } from '@/lib/services/fee.service';
import { feeStructureSchema } from '@/lib/validations/fee';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.structures.read');
    const { searchParams } = new URL(request.url);

    // Phase 10.5: previously trusted ?branch= verbatim.
    const result = await getFeeStructuresList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId: resolveEffectiveBranchId(user, searchParams.get('branch') || undefined),
      academicSessionId: searchParams.get('session') || undefined,
      feeType: searchParams.get('feeType') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/structures GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.structures.create');

    const body = await request.json();
    const validated = feeStructureSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const structure = await createFeeStructure(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, structure }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/structures POST');
  }
}
