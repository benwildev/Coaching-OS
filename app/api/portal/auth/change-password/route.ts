import { NextResponse } from 'next/server';
import { changePasswordSchema } from '@/lib/validations/portal-auth';
import { changePassword } from '@/lib/services/portal-auth.service';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await requirePortalAuth();
    const body = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    await changePassword(session, parsed.data.currentPassword, parsed.data.newPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/change-password POST');
  }
}
