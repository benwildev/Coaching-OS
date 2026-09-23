import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getFeeStructureById, updateFeeStructure } from '@/lib/services/fee.service';
import { feeStructureUpdateSchema } from '@/lib/validations/fee';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ feeStructureId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { feeStructureId } = await props.params;
    const structure = await getFeeStructureById(coachingCenterId, feeStructureId);
    if (!structure) return NextResponse.json({ success: false, error: 'Fee structure not found' }, { status: 404 });
    assertBranchAccess(user, structure.branchId);
    return NextResponse.json({ success: true, structure });
  } catch (error: any) {
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ feeStructureId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { feeStructureId } = await props.params;
    const body = await request.json();
    const validated = feeStructureUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await getFeeStructureById(coachingCenterId, feeStructureId);
    if (!existing) return NextResponse.json({ success: false, error: 'Fee structure not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);
    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const structure = await updateFeeStructure(coachingCenterId, feeStructureId, validated.data, user.userId);
    return NextResponse.json({ success: true, structure });
  } catch (error: any) {
    console.error('[API /api/fees/structures/[feeStructureId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to update fee structure' }, { status });
  }
}
