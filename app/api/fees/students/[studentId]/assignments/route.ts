import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { assignFeeToStudent, getStudentBranchId } from '@/lib/services/fee.service';
import { studentFeeAssignSchema } from '@/lib/validations/fee';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.structures.update');

    const { studentId } = await props.params;
    const body = await request.json();
    const validated = studentFeeAssignSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const branchId = await getStudentBranchId(coachingCenterId, studentId);
    if (branchId === undefined) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    assertBranchAccess(user, branchId);

    const assignment = await assignFeeToStudent(coachingCenterId, studentId, validated.data, user.userId);
    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/students/[studentId]/assignments POST');
  }
}
