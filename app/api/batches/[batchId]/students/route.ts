import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { assignStudentToBatch } from '@/lib/services/batch.service';
import { studentBatchAssignSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { batchId } = await props.params;
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
    const message =
      error.message === 'BATCH_FULL' ? 'This batch is full. Enable override to exceed capacity.' : error.message;
    return NextResponse.json({ success: false, error: message || 'Failed to assign student' }, { status: 400 });
  }
}
