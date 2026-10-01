import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getSalaryPayableDetail } from '@/lib/services/salary.service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ salaryPayableId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { salaryPayableId } = await props.params;
    const salary = await getSalaryPayableDetail(coachingCenterId, user, salaryPayableId);
    return NextResponse.json({ success: true, salary });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary/[salaryPayableId] GET');
  }
}
