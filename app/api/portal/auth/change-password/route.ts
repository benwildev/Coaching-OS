import { NextResponse } from 'next/server';
import { changePasswordSchema } from '@/lib/validations/portal-auth';
import { changePassword } from '@/lib/services/portal-auth.service';
import { requirePortalAuth, createPortalSessionToken, setPortalSessionCookie } from '@/lib/auth/portal-session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await requirePortalAuth();
    const body = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const { sessionVersion } = await changePassword(session, parsed.data.currentPassword, parsed.data.newPassword);
    // Phase 10.4: changing the password revokes every session for this
    // account, including this one's cookie — reissue it with the new
    // sessionVersion so the caller isn't logged out of their own device.
    // The token is also returned for the mobile app, which uses Bearer auth.
    const token = await createPortalSessionToken({ portalAccountId: session.portalAccountId, sessionVersion });
    await setPortalSessionCookie(token);
    return NextResponse.json({ success: true, token });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/change-password POST');
  }
}
