import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getIdCardData } from '@/lib/services/id-card.service';
import { recordAuditLog } from '@/lib/services/audit.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ studentId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { studentId } = await params;

    const data = await getIdCardData(coachingCenterId, studentId);
    if (!data) return NextResponse.json({ success: false, error: 'STUDENT_NOT_FOUND' }, { status: 404 });
    assertBranchAccess(user, data.student.branchId);

    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'ID_CARD_GENERATED',
      entity: 'Student',
      entityId: studentId,
      details: { branchId: data.student.branchId },
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/[studentId]/id-card GET');
  }
}
