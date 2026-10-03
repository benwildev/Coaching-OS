import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTeacherAssignmentOptions } from '@/lib/services/teacher.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('batches.update');

    const result = await getTeacherAssignmentOptions(coachingCenterId, user);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/assignment-options GET');
  }
}
