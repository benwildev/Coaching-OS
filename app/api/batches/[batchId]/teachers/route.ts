import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { assignTeacherToBatch } from '@/lib/services/batch.service';
import { batchTeacherAssignSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { batchId } = await props.params;
    const body = await request.json();
    const validated = batchTeacherAssignSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await assignTeacherToBatch(coachingCenterId, batchId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/batches/[batchId]/teachers POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to assign teacher' }, { status: 400 });
  }
}
