import { NextResponse } from 'next/server';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { requestPasswordReset } from '@/lib/services/portal-auth.service';

export const dynamic = 'force-dynamic';

/**
 * Password recovery entry for every account type (linked from /login).
 * The response is identical whether the email belongs to a staff user, a
 * portal account, several accounts, or nobody.
 *
 * Portal accounts get a single-use RESET token (existing mechanism). Staff
 * passwords are reset by the centre owner/admin — there is no staff
 * self-service reset, and no OTP/SMS shortcut.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }
    await requestPasswordReset(parsed.data.email);
    return NextResponse.json({
      success: true,
      message: 'If an account exists, password reset instructions will be provided.',
    });
  } catch (error) {
    console.error('[ForgotPasswordRoute] Error:', error);
    return NextResponse.json({ success: false, error: 'Request failed' }, { status: 500 });
  }
}
