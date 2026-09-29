import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { processDueRetries } from '@/lib/services/communication-retry.service';

export const dynamic = 'force-dynamic';

// Invoked by an external scheduler (Vercel Cron / any cron hitting this URL
// every 5-10 min), not a logged-in user — there's no in-app queue to drive
// this from, per the "no Redis/BullMQ" constraint (Phase 10.8 §6). Auth is a
// shared secret header instead of a session, compared in constant time.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never allow an unconfigured sweep to run unauthenticated
  const provided = request.headers.get('x-cron-secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const result = await processDueRetries();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/communication/retry/process-due] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
