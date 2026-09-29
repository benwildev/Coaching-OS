import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { updateBatchTeacherAssignment } from '@/lib/services/batch.service';
import { batchTeacherUpdateSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  props: { params: Promise<{ batchId: string; assignmentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { assignmentId } = await props.params;
    const body = await request.json();
    const validated = batchTeacherUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await updateBatchTeacherAssignment(coachingCenterId, assignmentId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    return apiErrorResponse(error, '/api/batches/[batchId]/teachers/[assignmentId] PUT');
  }
}
