import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { authenticateByEmail, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, redirectPathFor } from '@/lib/services/unified-auth.service';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { clearPortalSessionCookie, createPortalSessionToken, setPortalSessionCookie } from '@/lib/auth/portal-session';
import { recordAuditLog } from '@/lib/services/audit.service';

export const dynamic = 'force-dynamic';

/**
 * The only sign-in endpoint (used by /login). Email + password; the server
 * determines whether the credentials belong to a staff user (→
 * coaching_os_session) or a student/guardian portal account (→
 * coaching_os_portal_session) and returns where to go next.
 *
 * Every credential failure — unknown email, wrong password, locked account,
 * ambiguous identity — returns the same generic 401, so the response never
 * reveals whether or what kind of account exists.
 */
const INVALID = {
  success: false,
  error: `Invalid email or password. After ${MAX_FAILED_ATTEMPTS} failed attempts, sign-in is paused for ${LOCKOUT_MINUTES} minutes.`,
} as const;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const outcome = await authenticateByEmail(parsed.data.email, parsed.data.password);
    if (!outcome.ok) {
      if (outcome.reason === 'ACCOUNT_INACTIVE') {
        return NextResponse.json(
          { success: false, error: 'This account is currently inactive. Contact your center administrator.' },
          { status: 403 }
        );
      }
      return NextResponse.json(INVALID, { status: 401 });
    }

    const redirectTo = redirectPathFor(outcome);

    if (outcome.kind === 'STAFF') {
      const user = outcome.staff;
      await setSessionCookie(await createSessionToken(user));
      // One identity per browser: drop any portal session left behind.
      await clearPortalSessionCookie();
      await recordAuditLog({
        coachingCenterId: user.coachingCenterId,
        userId: user.userId,
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.userId,
        details: { method: 'password' },
      });
      return NextResponse.json({ success: true, accountType: user.role, redirectTo });
    }

    const portal = outcome.portal;
    await setPortalSessionCookie(await createPortalSessionToken(portal));
    await clearSessionCookie();
    await recordAuditLog({
      coachingCenterId: portal.coachingCenterId,
      studentId: portal.studentId,
      guardianId: portal.guardianId,
      action: 'PORTAL_LOGIN',
      entity: 'PortalAccount',
      entityId: outcome.portalAccountId,
      details: null,
    });
    return NextResponse.json({ success: true, accountType: portal.portalType, redirectTo });
  } catch (error) {
    console.error('[LoginRoute] Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
