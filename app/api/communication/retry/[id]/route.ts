import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { retryCommunication } from '@/lib/services/communication-retry.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Manual retry is OWNER/ADMIN only, matching the same authorization
// precedent as communication template management (assertTemplateManageable)
// — STAFF/TEACHER must never be able to trigger a provider send.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { id } = await params;
    const log = await retryCommunication(coachingCenterId, user, id);
    return NextResponse.json({ success: true, log });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/retry/[id] POST');
  }
}
