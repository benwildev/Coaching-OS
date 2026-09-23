import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getBatchById, updateBatch } from '@/lib/services/batch.service';
import { batchUpdateSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { batchId } = await props.params;
    const batch = await getBatchById(coachingCenterId, batchId);
    if (!batch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    return NextResponse.json({ success: true, batch });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { batchId } = await props.params;
    const body = await request.json();
    const validated = batchUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const batch = await updateBatch(coachingCenterId, batchId, validated.data, user.userId);
    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    console.error('[API /api/batches/[batchId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to update batch' }, { status });
  }
}
