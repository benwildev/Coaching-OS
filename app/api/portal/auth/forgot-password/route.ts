import { NextResponse } from 'next/server';
import { forgotPasswordSchema } from '@/lib/validations/portal-auth';
import { requestPasswordReset } from '@/lib/services/portal-auth.service';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Always returns the same generic success response regardless of whether an
// account exists — requestPasswordReset() itself never reveals that, and no
// SMS/email provider is configured to deliver the token anyway (Phase 8
// provider architecture). The supported reset path in this deployment is
// staff-initiated (see /api/portal-accounts/[id]/reset-link).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    await requestPasswordReset(parsed.data.identifier);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/forgot-password POST');
  }
}
