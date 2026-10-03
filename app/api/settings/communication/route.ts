import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getCommunicationProviderStatus, setCommunicationChannelEnabled } from '@/lib/services/communication-settings.service';
import { COMMUNICATION_CHANNELS } from '@/lib/validations/communication-template';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Whole endpoint is OWNER/ADMIN only — STAFF/TEACHER must never reach
// provider configuration status, not just be prevented from seeing secret
// values (Phase 10.8 §14/§29). No secret is ever included in the response;
// only booleans.
const patchSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.communication.update');
    const channels = await getCommunicationProviderStatus(coachingCenterId);
    return NextResponse.json({ success: true, channels });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication GET');
  }
}

export async function PATCH(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.communication.update');
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const channels = await setCommunicationChannelEnabled(coachingCenterId, user, parsed.data.channel, parsed.data.enabled);
    return NextResponse.json({ success: true, channels });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication PATCH');
  }
}
