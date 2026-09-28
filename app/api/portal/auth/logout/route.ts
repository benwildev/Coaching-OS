import { NextResponse } from 'next/server';
import { clearPortalSessionCookie, getPortalSession } from '@/lib/auth/portal-session';
import { bumpPortalAccountSessionVersion } from '@/lib/services/portal-auth.service';
import { recordAuditLog } from '@/lib/services/audit.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Phase 10.4: logout revokes the session server-side (bumps sessionVersion),
 * not just the browser cookie — a copied/stolen portal token stops working
 * immediately instead of remaining valid for up to 7 days.
 */
export async function POST() {
  try {
    const session = await getPortalSession();

    if (session) {
      await bumpPortalAccountSessionVersion(session.portalAccountId);
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

    await clearPortalSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/logout POST');
  }
}
