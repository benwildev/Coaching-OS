import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { reopenAttendanceSession } from '@/lib/services/attendance.service';
import { reopenSessionSchema } from '@/lib/validations/attendance';

export const dynamic = 'force-dynamic';

// Reopening a completed session is deliberately restricted to OWNER/ADMIN —
// "Completed attendance should not be casually editable."
export async function POST(request: Request, props: { params: Promise<{ sessionId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { sessionId } = await props.params;
    const body = await request.json();
    const validated = reopenSessionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const session = await reopenAttendanceSession(coachingCenterId, sessionId, validated.data.reason, user.userId);
    return NextResponse.json({ success: true, session });
  } catch (error: any) {
    console.error('[API /api/attendance/sessions/[sessionId]/reopen POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to reopen attendance' }, { status: 400 });
  }
}
