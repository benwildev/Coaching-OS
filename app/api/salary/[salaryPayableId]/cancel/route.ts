import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { cancelSalaryPayable } from '@/lib/services/salary.service';
import { salaryCancelSchema } from '@/lib/validations/salary';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ salaryPayableId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { salaryPayableId } = await props.params;
    const body = await request.json().catch(() => null);
    const parsed = salaryCancelSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    await cancelSalaryPayable(coachingCenterId, user, salaryPayableId, parsed.data.reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary/[salaryPayableId]/cancel POST');
  }
}
