import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getHomeworkAuthoringOptions } from '@/lib/services/homework.service';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const result = await getHomeworkAuthoringOptions(coachingCenterId, user);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/options GET');
  }
}
