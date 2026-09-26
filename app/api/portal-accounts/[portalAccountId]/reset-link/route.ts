import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { staffIssueResetLink } from '@/lib/services/portal-auth.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ portalAccountId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { portalAccountId } = await params;

    const result = await staffIssueResetLink(coachingCenterId, user.userId, portalAccountId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal-accounts/[portalAccountId]/reset-link POST');
  }
}
