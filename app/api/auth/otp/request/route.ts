import { NextResponse } from 'next/server';
import { otpRequestSchema } from '@/lib/validations/auth';
import { isDevOtpEchoEnabled, isOtpLoginAvailable, issueStaffLoginOtp, OTP_TTL_MINUTES } from '@/lib/services/staff-otp.service';

export const dynamic = 'force-dynamic';

/**
 * Requests a staff sign-in code. When SMS delivery is not configured (this
 * deployment) nothing is issued and the response says so honestly — the
 * UI must fall back to password sign-in. The response is identical whether
 * or not the phone belongs to an account.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    if (!isOtpLoginAvailable()) {
      return NextResponse.json(
        { success: false, error: 'OTP_UNAVAILABLE', message: 'SMS sign-in codes are not available (no SMS provider configured). Please sign in with email and password.' },
        { status: 503 }
      );
    }

    // Unknown phone, ambiguous phone and rate-limited phone all get the same
    // response (a 429 would only ever appear for real accounts); no code is issued.
    const outcome = await issueStaffLoginOtp(parsed.data.phone);

    return NextResponse.json({
      success: true,
      message: `If this number belongs to a staff account, a code valid for ${OTP_TTL_MINUTES} minutes has been issued.`,
      // Development only (never in production): return the random code instead of sending it.
      ...(isDevOtpEchoEnabled() && outcome.issued ? { devCode: outcome.code } : {}),
    });
  } catch (error) {
    console.error('[OtpRequestRoute] Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
