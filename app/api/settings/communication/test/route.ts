import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { testCommunicationProvider } from '@/lib/services/communication-settings.service';
import { COMMUNICATION_CHANNELS } from '@/lib/validations/communication-template';
import { checkRateLimit } from '@/lib/services/rate-limit.service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const testSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  // Optional — only when explicitly supplied does this send one real test
  // message; otherwise it's a connection-only check (Phase 10.8 §15).
  testRecipient: z.string().trim().min(3).max(320).optional(),
});

// Authenticated OWNER/ADMIN only, but a real test send costs real SMS/
// WhatsApp/Email provider money — bound per-tenant so a compromised or
// careless admin account can't run up an unbounded provider bill.
const TEST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const TEST_RATE_LIMIT_MAX = 20;

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.communication.update');
    const rateLimit = await checkRateLimit(`comm-test:${coachingCenterId}`, TEST_RATE_LIMIT_WINDOW_MS, TEST_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', message: 'Too many test sends this hour. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }
    const body = await request.json().catch(() => null);
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const result = await testCommunicationProvider(coachingCenterId, user, parsed.data.channel, parsed.data.testRecipient);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication/test POST');
  }
}
