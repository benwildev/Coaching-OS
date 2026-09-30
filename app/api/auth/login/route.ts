import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { authenticateByEmail, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, redirectPathFor } from '@/lib/services/unified-auth.service';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { clearPortalSessionCookie, createPortalSessionToken, setPortalSessionCookie } from '@/lib/auth/portal-session';
import { clearPlatformSessionCookie, createPlatformSessionToken, setPlatformSessionCookie } from '@/lib/auth/platform-session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { checkRateLimit, getClientIp } from '@/lib/services/rate-limit.service';

// Per-account lockout (unified-auth.service.ts) already stops brute-forcing
// ONE account. This IP-scoped limit is the missing defense against the
// other shape of attack — a script trying many different accounts, few
// attempts each, from one source — which a per-account counter can't see.
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 30;

export const dynamic = 'force-dynamic';

/**
 * The single sign-in endpoint (used by /login) for ALL users:
 * - Platform Super Admin (→ coaching_os_platform_session → /super-admin/dashboard)
 * - Coaching Center Staff: Owner, Admin, Staff, Teacher (→ coaching_os_session → /dashboard)
 * - Student & Guardian Portal (→ coaching_os_portal_session → /portal/student or /portal/guardian)
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
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(INVALID, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
    }

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const outcome = await authenticateByEmail(parsed.data.email, parsed.data.password, ip);
    if (!outcome.ok) {
      if (outcome.reason === 'TENANT_SUSPENDED') {
        return NextResponse.json(
          { success: false, error: 'TENANT_SUSPENDED', message: 'Account suspended. Please contact support.' },
          { status: 403 }
        );
      }
      if (outcome.reason === 'ACCOUNT_INACTIVE') {
        return NextResponse.json(
          { success: false, error: 'This account is currently inactive. Contact your center administrator.' },
          { status: 403 }
        );
      }
      return NextResponse.json(INVALID, { status: 401 });
    }

    const redirectTo = redirectPathFor(outcome);

    if (outcome.kind === 'PLATFORM_ADMIN') {
      const admin = outcome.admin;
      await setPlatformSessionCookie(await createPlatformSessionToken(admin));
      await clearSessionCookie();
      await clearPortalSessionCookie();
      return NextResponse.json({ success: true, accountType: 'SUPER_ADMIN', redirectTo });
    }

    if (outcome.kind === 'STAFF') {
      const user = outcome.staff;
      await setSessionCookie(await createSessionToken(user));
      // One identity per browser: drop any portal or platform session left behind.
      await clearPortalSessionCookie();
      await clearPlatformSessionCookie();
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
    await clearPlatformSessionCookie();
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
