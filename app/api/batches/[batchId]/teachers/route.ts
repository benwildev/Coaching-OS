import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { assignTeacherToBatch, getBatchById } from '@/lib/services/batch.service';
import { batchTeacherAssignSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.assign_teacher');

    const { batchId } = await props.params;

    const batch = await getBatchById(coachingCenterId, batchId);
    if (!batch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, batch.branchId);

    const body = await request.json();
    const validated = batchTeacherAssignSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await assignTeacherToBatch(coachingCenterId, batchId, validated.data, user.userId, user);
    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId]/teachers POST');
  }
}
