import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getBatchById, updateBatch } from '@/lib/services/batch.service';
import { batchUpdateSchema } from '@/lib/validations/batch';
import { assertTeacherCanAccessBatch } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.read');
    const { batchId } = await props.params;
    const batch = await getBatchById(coachingCenterId, batchId);
    if (!batch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    // Phase 10.5 / 14.3: branch check + teacher academic assignment scope
    assertBranchAccess(user, batch.branchId);
    await assertTeacherCanAccessBatch(user, batchId);
    return NextResponse.json({ success: true, batch });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.update');

    const { batchId } = await props.params;
    const body = await request.json();
    const validated = batchUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Phase 10.5: check the EXISTING record's branch before mutating — the
    // old code only checked a submitted new branchId (and skipped the
    // check entirely when branchId was omitted from the body), so a
    // branch-locked STAFF could edit any branch's batch just by not
    // including branchId in the request.
    const existing = await getBatchById(coachingCenterId, batchId);
    if (!existing) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);
    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const batch = await updateBatch(coachingCenterId, batchId, validated.data, user.userId);
    return NextResponse.json({ success: true, batch });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId] PUT');
  }
}
