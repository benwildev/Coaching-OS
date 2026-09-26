import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getNoticeById, resolveNoticeScope, updateNotice } from '@/lib/services/notice.service';
import { updateNoticeSchema } from '@/lib/validations/notice';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ noticeId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { noticeId } = await params;
    const scope = resolveNoticeScope(coachingCenterId, user);
    const notice = await getNoticeById(scope, noticeId);
    return NextResponse.json({ success: true, notice });
  } catch (error) {
    return apiErrorResponse(error, '/api/notices/[noticeId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { noticeId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateNoticeSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = resolveNoticeScope(coachingCenterId, user);
    const notice = await updateNotice(scope, noticeId, parsed.data);
    return NextResponse.json({ success: true, notice });
  } catch (error) {
    return apiErrorResponse(error, '/api/notices/[noticeId] PUT');
  }
}
