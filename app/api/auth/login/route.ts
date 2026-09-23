import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { authenticateUser } from '@/lib/services/user.service';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(parsed.data.identifier, parsed.data.password);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email/phone or password' },
        { status: 401 }
      );
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
      details: { identifier: parsed.data.identifier },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        banglaName: user.banglaName,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error.message === 'ACCOUNT_INACTIVE') {
      return NextResponse.json(
        { success: false, error: 'This account is currently inactive. Contact your center administrator.' },
        { status: 403 }
      );
    }
    console.error('[LoginRoute] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error during authentication' },
      { status: 500 }
    );
  }
}
