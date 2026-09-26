import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { listNoticesForGuardian } from '@/lib/services/notice-recipients.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireGuardianPortal();
    const sp = new URL(request.url).searchParams;
    const result = await listNoticesForGuardian(session.coachingCenterId, session.guardianId!, {
      page: Number(sp.get('page')) || 1,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/notices GET');
  }
}
