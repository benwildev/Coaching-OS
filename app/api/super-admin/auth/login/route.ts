import { NextResponse } from 'next/server';
import { platformLoginSchema } from '@/lib/validations/platform';
import { authenticatePlatformAdmin, PLATFORM_LOCKOUT_MINUTES, PLATFORM_MAX_FAILED_ATTEMPTS } from '@/lib/services/platform-auth.service';
import { createPlatformSessionToken, setPlatformSessionCookie } from '@/lib/auth/platform-session';
import { checkRateLimit, getClientIp } from '@/lib/services/rate-limit.service';

export const dynamic = 'force-dynamic';

// Stricter than tenant sign-in: there are only a handful of platform admins.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const INVALID = {
  success: false,
  error: `Invalid email or password. After ${PLATFORM_MAX_FAILED_ATTEMPTS} failed attempts, sign-in is paused for ${PLATFORM_LOCKOUT_MINUTES} minutes.`,
} as const;

/** The ONLY way to obtain a platform session. Tenant credentials never work here and vice versa. */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limit = await checkRateLimit(`platform-login:${ip}`, WINDOW_MS, MAX_PER_WINDOW);
    if (!limit.allowed) {
      return NextResponse.json(INVALID, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }
    const parsed = platformLoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });

    const outcome = await authenticatePlatformAdmin(parsed.data.email, parsed.data.password, ip);
    if (!outcome.ok) return NextResponse.json(INVALID, { status: 401 });

    await setPlatformSessionCookie(await createPlatformSessionToken(outcome.admin));
    return NextResponse.json({ success: true, redirectTo: '/super-admin/dashboard' });
  } catch (error) {
    console.error('[PlatformLogin] Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
