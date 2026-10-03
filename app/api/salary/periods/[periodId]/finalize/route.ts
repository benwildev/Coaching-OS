import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { finalizeSalaryPeriod } from '@/lib/services/salary.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ periodId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('salary.finalize');
    const { periodId } = await props.params;
    const period = await finalizeSalaryPeriod(coachingCenterId, user, periodId);
    return NextResponse.json({ success: true, period });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary/periods/[periodId]/finalize POST');
  }
}
