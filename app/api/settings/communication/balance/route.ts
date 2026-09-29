import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getProviderBalance } from '@/lib/services/communication-settings.service';
import { COMMUNICATION_CHANNELS } from '@/lib/validations/communication-template';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const balanceSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
});

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const { searchParams } = new URL(request.url);
    const parsed = balanceSchema.safeParse({ channel: searchParams.get('channel') });
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const result = await getProviderBalance(coachingCenterId, user, parsed.data.channel);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication/balance GET');
  }
}
