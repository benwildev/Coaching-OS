import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getAttendanceThreshold, setAttendanceThreshold } from '@/lib/services/attendance.service';
import { thresholdSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    const threshold = await getAttendanceThreshold(coachingCenterId);
    return NextResponse.json({ success: true, threshold });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

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
  } catch (error: any) {
    console.error('[API /api/attendance/threshold PUT] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update threshold' }, { status: 400 });
  }
}
