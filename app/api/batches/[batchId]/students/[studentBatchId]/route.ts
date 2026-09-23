import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { updateStudentBatchAssignment } from '@/lib/services/batch.service';
import { studentBatchUpdateSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  props: { params: Promise<{ batchId: string; studentBatchId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { studentBatchId } = await props.params;
    const body = await request.json();
    const validated = studentBatchUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await updateStudentBatchAssignment(coachingCenterId, studentBatchId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment });
  } catch (error: any) {
    console.error('[API /api/batches/[batchId]/students/[studentBatchId] PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update assignment' },
      { status: 400 }
    );
  }
}
