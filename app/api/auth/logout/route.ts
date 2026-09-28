import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth/session';
import { bumpUserSessionVersion } from '@/lib/services/user.service';
import { recordAuditLog } from '@/lib/services/audit.service';

/**
 * Phase 10.4: logout revokes the session server-side (bumps sessionVersion),
 * not just the browser cookie — a copied/stolen token stops working
 * immediately instead of remaining valid for up to 7 days.
 */
async function revokeAndClear() {
  const session = await getSession();
  if (session) {
    await bumpUserSessionVersion(session.userId);
    await recordAuditLog({
      coachingCenterId: session.coachingCenterId,
      userId: session.userId,
      action: 'USER_LOGOUT',
      entity: 'User',
      entityId: session.userId,
      details: null,
    });
  }
  await clearSessionCookie();
}

// POST-only: logout now mutates state (revokes the account's sessions), so
// it must not be triggerable by a plain cross-site GET/navigation (CSRF).
// Nothing in this app links to logout via GET — both TopBar and PortalShell
// already call it with fetch(..., { method: 'POST' }).
export async function POST() {
  await revokeAndClear();
  return NextResponse.json({ success: true });
}
