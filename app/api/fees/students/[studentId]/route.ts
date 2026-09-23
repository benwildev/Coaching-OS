import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getStudentFeeProfile } from '@/lib/services/fee.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { studentId } = await props.params;
    const profile = await getStudentFeeProfile(coachingCenterId, studentId);
    if (!profile) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    assertBranchAccess(user, profile.student.branch?.id);
    return NextResponse.json({ success: true, ...profile });
  } catch (error: any) {
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}
