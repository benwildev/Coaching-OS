import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { assignStudentToBatch, getBatchById } from '@/lib/services/batch.service';
import { studentBatchAssignSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { batchId } = await props.params;

    // Phase 10.5: previously no branch check — a branch-locked STAFF could
    // assign any student to any batch cross-branch.
    const batch = await getBatchById(coachingCenterId, batchId);
    if (!batch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, batch.branchId);

    const body = await request.json();
    const validated = studentBatchAssignSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await assignStudentToBatch(coachingCenterId, batchId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/batches/[batchId]/students POST] Error:', error);
    const raw = String(error.message || '');
    const message = raw.startsWith('BATCH_FULL') ? 'This batch is full. Enable override to exceed capacity.' : raw;
    const status = raw.startsWith('SCHEDULE_CONFLICT') ? 409 : 400;
    return NextResponse.json(
      { success: false, error: message || 'Failed to assign student', conflicts: error.conflicts || undefined },
      { status }
    );
  }
}
