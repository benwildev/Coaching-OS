import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getEligibleStudents } from '@/lib/services/exam.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { searchParams } = new URL(request.url);
    const academicSessionId = searchParams.get('session');
    const academicProgramId = searchParams.get('program');
    const academicClassId = searchParams.get('class');
    const academicGroupId = searchParams.get('group') || undefined;
    const batchId = searchParams.get('batch') || undefined;
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    if (!academicSessionId || !academicProgramId || !academicClassId) {
      return NextResponse.json(
        { success: false, error: 'Session, program, and class parameters are required.' },
        { status: 400 }
      );
    }

    const students = await getEligibleStudents(coachingCenterId, {
      academicSessionId,
      academicProgramId,
      academicClassId,
      academicGroupId,
      batchId,
      branchId,
    });

    return NextResponse.json({ success: true, students, count: students.length });
  } catch (error: any) {
    console.error('[API /api/exams/eligible-students GET] Error:', error);
    if (error.message === 'UNAUTHORIZED' || error.message === 'TENANT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
