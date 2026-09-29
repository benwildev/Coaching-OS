import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { saveProviderCredentials } from '@/lib/services/communication-settings.service';
import { communicationCredentialsUpdateSchema } from '@/lib/validations/communication-provider-config';

export const dynamic = 'force-dynamic';

// OWNER/ADMIN only — never returns a saved value back, only the resulting
// configured/enabled/field-set status (see getCommunicationProviderStatus).
export async function PUT(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const body = await request.json().catch(() => null);
    const parsed = communicationCredentialsUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const channels = await saveProviderCredentials(coachingCenterId, user, parsed.data.channel, parsed.data.credentials);
    return NextResponse.json({ success: true, channels });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/communication/credentials PUT');
  }
}
