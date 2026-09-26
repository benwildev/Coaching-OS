import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { createNotice, listNotices, resolveNoticeScope } from '@/lib/services/notice.service';
import { createNoticeSchema } from '@/lib/validations/notice';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const sp = new URL(request.url).searchParams;
    const scope = resolveNoticeScope(coachingCenterId, user);
    const result = await listNotices(scope, {
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 20,
      search: sp.get('search') || undefined,
      status: sp.get('status') || undefined,
      targetAudience: sp.get('targetAudience') || undefined,
      branchId: sp.get('branchId') || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/notices GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = createNoticeSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = resolveNoticeScope(coachingCenterId, user);
    const notice = await createNotice(scope, parsed.data);
    return NextResponse.json({ success: true, notice }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/notices POST');
  }
}
