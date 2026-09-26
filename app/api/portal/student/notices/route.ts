import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { listNoticesForStudent } from '@/lib/services/notice-recipients.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireStudentPortal();
    const sp = new URL(request.url).searchParams;
    const result = await listNoticesForStudent(session.coachingCenterId, session.studentId!, {
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/notices GET');
  }
}
