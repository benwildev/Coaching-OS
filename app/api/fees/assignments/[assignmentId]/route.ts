import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { updateStudentFeeAssignment, getFeeAssignmentBranchId } from '@/lib/services/fee.service';
import { studentFeeAssignmentUpdateSchema } from '@/lib/validations/fee';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ assignmentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { assignmentId } = await props.params;
    const body = await request.json();
    const validated = studentFeeAssignmentUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const branchId = await getFeeAssignmentBranchId(coachingCenterId, assignmentId);
    if (branchId === undefined) return NextResponse.json({ success: false, error: 'Fee assignment not found' }, { status: 404 });
    assertBranchAccess(user, branchId);

    const assignment = await updateStudentFeeAssignment(coachingCenterId, assignmentId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment });
  } catch (error: any) {
    console.error('[API /api/fees/assignments/[assignmentId] PUT] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to update fee assignment' }, { status });
  }
}
