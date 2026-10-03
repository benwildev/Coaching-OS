import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { recordSalaryPayment } from '@/lib/services/salary.service';
import { salaryPaymentSchema } from '@/lib/validations/salary';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ salaryPayableId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('salary.pay');
    const { salaryPayableId } = await props.params;
    const body = await request.json().catch(() => null);
    const parsed = salaryPaymentSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const { payment, idempotentReplay } = await recordSalaryPayment(coachingCenterId, user, salaryPayableId, parsed.data);
    return NextResponse.json({ success: true, payment, idempotentReplay }, { status: idempotentReplay ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary/[salaryPayableId]/payment POST');
  }
}
