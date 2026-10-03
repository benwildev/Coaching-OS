import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { getStudentAttendanceSummary } from '@/lib/services/attendance.service';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

// Phase 10.5: this route previously had no role check and no branch check
// at all — any authenticated tenant user, including a branch-locked
// TEACHER/STAFF, could pull any student's attendance summary tenant-wide.
export async function GET(request: Request, props: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.read');
    const { studentId } = await props.params;

    const student = await prisma.student.findFirst({
      where: { id: studentId, coachingCenterId },
      select: { branchId: true },
    });
    if (!student) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }
    assertBranchAccess(user, student.branchId);

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch') || undefined;

    const summary = await getStudentAttendanceSummary(coachingCenterId, studentId, batchId);
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error('[API /api/attendance/student/[studentId] GET] Error:', error);
    const status = error?.message === 'FORBIDDEN_BRANCH' || error?.message === 'FORBIDDEN' ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}
