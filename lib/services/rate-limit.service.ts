import prisma from '@/lib/db';

/**
 * Fixed-window, DB-backed rate limiter (Phase 11) — no Redis, no distributed
 * limiter, just a Postgres counter using the same atomic-upsert pattern
 * already proven throughout this codebase (FinancialSequence, cash session
 * close, payment overpayment guard). `key` must already carry its own scope
 * (e.g. "login:203.0.113.5") — this module has no opinion on what's being
 * limited, only on counting attempts per key per time window.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Present only when `allowed` is false. */
  retryAfterSeconds?: number;
}

export async function checkRateLimit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
  if (
    process.env.NODE_ENV !== 'production' &&
    (key.endsWith(':::1') || key.endsWith(':127.0.0.1') || key.endsWith(':localhost') || key.endsWith(':unknown'))
  ) {
    return { allowed: true };
  }

  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (bucket.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}

/** Best-effort cleanup of old buckets — never required for correctness, just keeps the table small. */
export async function pruneOldRateLimitBuckets(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  await prisma.rateLimitBucket
    .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } })
    .catch(() => {});
}

/**
 * Best-effort client IP from the standard proxy header. Never trust this for
 * anything beyond rate-limit bucketing — it's client/proxy-supplied and
 * trivially spoofable without a trusted reverse proxy in front of the app;
 * worst case a spoofed value just lands attempts in the wrong (or a shared
 * "unknown") bucket, it never grants access to anything.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}
