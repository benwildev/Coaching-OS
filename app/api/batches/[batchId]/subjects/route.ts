import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { replaceBatchSubjects } from '@/lib/services/batch.service';
import { batchSubjectsUpdateSchema } from '@/lib/validations/batch';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { batchId } = await props.params;
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
  } catch (error: any) {
    console.error('[API /api/batches/[batchId]/subjects PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update batch subjects' },
      { status: 400 }
    );
  }
}
