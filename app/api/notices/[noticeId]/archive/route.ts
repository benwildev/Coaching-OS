import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resolveNoticeScope, transitionNoticeStatus } from '@/lib/services/notice.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ noticeId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { noticeId } = await params;
    const scope = resolveNoticeScope(coachingCenterId, user);
    const notice = await transitionNoticeStatus(scope, noticeId, 'ARCHIVED');
    return NextResponse.json({ success: true, notice });
  } catch (error) {
    return apiErrorResponse(error, '/api/notices/[noticeId]/archive POST');
  }
}
