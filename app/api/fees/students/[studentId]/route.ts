import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentFeeProfile } from '@/lib/services/fee.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ studentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.read');
    const { studentId } = await props.params;
    const profile = await getStudentFeeProfile(coachingCenterId, studentId);
    if (!profile) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    assertBranchAccess(user, profile.student.branch?.id);
    return NextResponse.json({ success: true, ...profile });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/students/[studentId] GET');
  }
}
