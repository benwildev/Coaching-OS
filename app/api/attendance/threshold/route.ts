import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getAttendanceThreshold, setAttendanceThreshold } from '@/lib/services/attendance.service';
import { thresholdSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('attendance.read');
    const threshold = await getAttendanceThreshold(coachingCenterId);
    return NextResponse.json({ success: true, threshold });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return apiErrorResponse(error, '/api/attendance/threshold GET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.threshold.update');

    const body = await request.json();
    const validated = thresholdSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    await setAttendanceThreshold(coachingCenterId, validated.data.threshold, user.userId);
    return NextResponse.json({ success: true, threshold: validated.data.threshold });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/threshold PUT');
  }
}
