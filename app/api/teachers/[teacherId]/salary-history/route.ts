import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { listTeacherSalaryHistory } from '@/lib/services/salary.service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;
    const history = await listTeacherSalaryHistory(coachingCenterId, user, teacherId);
    return NextResponse.json({ success: true, history });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/salary-history GET');
  }
}
