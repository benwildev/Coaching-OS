import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentResultHistory, getTeacherResultAccessWhere } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

/**
 * Staff view of one student's result history (student profile page).
 * The student must belong to the caller's tenant (and branch, when
 * branch-scoped); a TEACHER only receives results inside their assignment
 * scope. Student/guardian portals use /api/portal/* instead.
 */
export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);

    const student = await prisma.student.findFirst({
      where: { id: studentId, coachingCenterId },
      select: { id: true, branchId: true },
    });
    if (!student) throw new Error('STUDENT_NOT_FOUND');
    assertBranchAccess(user, student.branchId);

    const isStudentPortal = searchParams.get('portal') === 'true';
    const accessWhere = await getTeacherResultAccessWhere(coachingCenterId, user);
    const history = await getStudentResultHistory(coachingCenterId, student.id, isStudentPortal, accessWhere);

    return NextResponse.json({ success: true, history });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/results/student/[studentId]');
  }
}
