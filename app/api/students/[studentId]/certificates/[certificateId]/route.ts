import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getCertificateForRender } from '@/lib/services/certificate.service';
import { assertTeacherCanAccessStudent } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ studentId: string; certificateId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.certificates');
    const { studentId, certificateId } = await params;

    const data = await getCertificateForRender(coachingCenterId, studentId, certificateId);
    assertBranchAccess(user, data.certificate.student.branchId);
    await assertTeacherCanAccessStudent(user, studentId);

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/[studentId]/certificates/[certificateId] GET');
  }
}
