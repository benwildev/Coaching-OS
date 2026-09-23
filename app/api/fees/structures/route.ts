import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getFeeStructuresList, createFeeStructure } from '@/lib/services/fee.service';
import { feeStructureSchema } from '@/lib/validations/fee';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { searchParams } = new URL(request.url);

    const result = await getFeeStructuresList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId: searchParams.get('branch') || undefined,
      academicSessionId: searchParams.get('session') || undefined,
      feeType: searchParams.get('feeType') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API /api/fees/structures GET] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

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
  } catch (error: any) {
    console.error('[API /api/fees/structures POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create fee structure' }, { status });
  }
}
