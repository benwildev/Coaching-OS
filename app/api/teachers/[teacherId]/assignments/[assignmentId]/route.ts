import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { endBatchTeacherAssignment } from '@/lib/services/teacher.service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ teacherId: string; assignmentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.assignments');

    const { teacherId, assignmentId } = await props.params;

    const assignment = await endBatchTeacherAssignment(
      coachingCenterId,
      teacherId,
      assignmentId,
      user.userId,
      user
    );

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/assignments/[assignmentId] DELETE');
  }
}
