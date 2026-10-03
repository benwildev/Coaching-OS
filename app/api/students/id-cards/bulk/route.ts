import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getIdCardDataBulk } from '@/lib/services/id-card.service';
import { idCardsBulkSchema } from '@/lib/validations/bulk-student';
import { recordAuditLog } from '@/lib/services/audit.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.id_card');
    // Parity: students.id_card is held by TEACHER by default (single-card route),
    // but the bulk print route has always been OWNER/ADMIN/STAFF only.
    if (user.role === 'TEACHER') throw new Error('FORBIDDEN_TEACHER_SCOPE');
    const body = await request.json().catch(() => null);
    const parsed = idCardsBulkSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    // A branch-locked caller's selection is silently narrowed to their own
    // branch's students — never a full-tenant bypass via a mixed selection.
    const branchId = resolveEffectiveBranchId(user, undefined);
    const data = await getIdCardDataBulk(coachingCenterId, parsed.data.studentIds, branchId);

    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'ID_CARD_BULK_GENERATED',
      entity: 'Student',
      entityId: null,
      details: { studentIds: data.students.map((s) => s.id), count: data.students.length },
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/id-cards/bulk POST');
  }
}
