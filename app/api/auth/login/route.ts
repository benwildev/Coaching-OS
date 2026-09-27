import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { authenticateUser, type StaffIdentity } from '@/lib/services/user.service';
import { verifyStaffLoginOtp } from '@/lib/services/staff-otp.service';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/services/audit.service';

export const dynamic = 'force-dynamic';

/**
 * STAFF sign-in only (OWNER / ADMIN / STAFF / TEACHER → coaching_os_session).
 * Student/guardian identities are never authenticated here — they use
 * /api/portal/auth/login (coaching_os_portal_session).
 *
 * Every credential failure returns the same generic 401 so the response
 * never reveals whether an email/phone exists. There is no fallback
 * account and no fixed OTP.
 */
const INVALID = { success: false, error: 'Invalid email/phone or password' } as const;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { identifier, password, otp, mode } = parsed.data;

    let user: StaffIdentity | null = null;
    if (mode === 'otp') {
      user = await verifyStaffLoginOtp(identifier, otp ?? '');
      if (!user) {
        return NextResponse.json({ success: false, error: 'Invalid or expired code. Request a new code and try again.' }, { status: 401 });
      }
    } else {
      user = await authenticateUser(identifier, password ?? '');
      if (!user) return NextResponse.json(INVALID, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      name: user.name,
      banglaName: user.banglaName,
      role: user.role,
      coachingCenterId: user.coachingCenterId,
      branchId: user.branchId,
    });
    await setSessionCookie(token);

    await recordAuditLog({
      coachingCenterId: user.coachingCenterId,
      userId: user.userId,
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: user.userId,
      details: { method: mode },
    });

    return NextResponse.json({
      success: true,
      user: { id: user.userId, email: user.email, name: user.name, banglaName: user.banglaName, role: user.role },
    });
  } catch (error) {
    // Only reached after the password was verified (see authenticateUser).
    if (error instanceof Error && error.message === 'ACCOUNT_INACTIVE') {
      return NextResponse.json(
        { success: false, error: 'This account is currently inactive. Contact your center administrator.' },
        { status: 403 }
      );
    }
    console.error('[LoginRoute] Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
