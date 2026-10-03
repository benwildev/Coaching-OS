import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { endCompensation, updateCompensation } from '@/lib/services/compensation.service';
import { compensationEndSchema, compensationUpdateSchema } from '@/lib/validations/salary';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teacherId: string; compensationId: string }> };

export async function PUT(request: Request, props: Params) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('compensation.manage');
    const { teacherId, compensationId } = await props.params;
    const body = await request.json().catch(() => null);
    const parsed = compensationUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const compensation = await updateCompensation(coachingCenterId, user, teacherId, compensationId, parsed.data);
    return NextResponse.json({ success: true, compensation });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/compensation/[compensationId] PUT');
  }
}

// DELETE = "End Compensation": ends the rule (or withdraws it if it never started and was never used).
export async function DELETE(request: Request, props: Params) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('compensation.manage');
    const { teacherId, compensationId } = await props.params;
    const body = await request.json().catch(() => ({}));
    const parsed = compensationEndSchema.safeParse(body ?? {});
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const result = await endCompensation(coachingCenterId, user, teacherId, compensationId, parsed.data.effectiveTo);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/compensation/[compensationId] DELETE');
  }
}
