import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { replaceBatchSubjects, getBatchById } from '@/lib/services/batch.service';
import { batchSubjectsUpdateSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.update');

    const { batchId } = await props.params;

    // Phase 10.5: previously no branch check.
    const existingBatch = await getBatchById(coachingCenterId, batchId);
    if (!existingBatch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, existingBatch.branchId);

    const body = await request.json();
    const validated = batchSubjectsUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const batch = await replaceBatchSubjects(coachingCenterId, batchId, validated.data.subjectIds, user.userId);
    return NextResponse.json({ success: true, batch });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId]/subjects PUT');
  }
}
