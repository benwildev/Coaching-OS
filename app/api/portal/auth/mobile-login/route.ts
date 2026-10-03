import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { authenticateByEmail, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from '@/lib/services/unified-auth.service';
import { createPortalSessionToken } from '@/lib/auth/portal-session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { checkRateLimit, getClientIp } from '@/lib/services/rate-limit.service';

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 30;

export const dynamic = 'force-dynamic';

/**
 * Sign-in for the native Student/Guardian app (mobile/). Same credential
 * checks, lockout and IP rate limit as /api/auth/login, but:
 * - only portal accounts may sign in here — staff and super-admin accounts
 *   get the same generic 401 as a wrong password, so nothing is revealed;
 * - the portal JWT is returned in the body (the app keeps it in secure
 *   storage and sends it as `Authorization: Bearer`) instead of a cookie.
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

    if (outcome.kind !== 'PORTAL') return NextResponse.json(INVALID, { status: 401 });

    const portal = outcome.portal;
    const token = await createPortalSessionToken(portal);
    await recordAuditLog({
      coachingCenterId: portal.coachingCenterId,
      studentId: portal.studentId,
      guardianId: portal.guardianId,
      action: 'PORTAL_LOGIN',
      entity: 'PortalAccount',
      entityId: outcome.portalAccountId,
      details: { method: 'mobile' },
    });
    return NextResponse.json({ success: true, token, accountType: portal.portalType });
  } catch (error) {
    console.error('[MobileLoginRoute] Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
