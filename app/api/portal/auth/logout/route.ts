import { NextResponse } from 'next/server';
import { clearPortalSessionCookie, getPortalSession } from '@/lib/auth/portal-session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getPortalSession();
    await clearPortalSessionCookie();

    if (session) {
      await recordAuditLog({
        coachingCenterId: session.coachingCenterId,
        studentId: session.studentId,
        guardianId: session.guardianId,
        action: 'PORTAL_LOGOUT',
        entity: 'PortalAccount',
        entityId: session.portalAccountId,
        details: null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/logout POST');
  }
}
