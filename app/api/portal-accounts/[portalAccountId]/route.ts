import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { setPortalAccountStatus } from '@/lib/services/portal-auth.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ portalAccountId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { portalAccountId } = await params;
    const body = await request.json().catch(() => null);
    if (body?.status !== 'ACTIVE' && body?.status !== 'DISABLED') {
      return NextResponse.json({ success: false, error: 'INVALID_STATUS', message: 'status must be ACTIVE or DISABLED' }, { status: 400 });
    }

    await setPortalAccountStatus(coachingCenterId, user.userId, portalAccountId, body.status);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal-accounts/[portalAccountId] PATCH');
  }
}
