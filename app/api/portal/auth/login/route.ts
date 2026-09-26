import { NextResponse } from 'next/server';
import { portalLoginSchema } from '@/lib/validations/portal-auth';
import { authenticatePortalAccount } from '@/lib/services/portal-auth.service';
import { createPortalSessionToken, setPortalSessionCookie } from '@/lib/auth/portal-session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = portalLoginSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const result = await authenticatePortalAccount(parsed.data.identifier, parsed.data.password);
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'PORTAL_INVALID_CREDENTIALS', message: 'Invalid identifier or password' },
        { status: 401 }
      );
    }
    if (result.session.portalType !== parsed.data.portalType) {
      // Same generic message as a wrong password — never reveal which
      // portal type an identifier actually belongs to.
      return NextResponse.json(
        { success: false, error: 'PORTAL_INVALID_CREDENTIALS', message: 'Invalid identifier or password' },
        { status: 401 }
      );
    }

    const token = await createPortalSessionToken(result.session);
    await setPortalSessionCookie(token);

    await recordAuditLog({
      coachingCenterId: result.session.coachingCenterId,
      studentId: result.session.studentId,
      guardianId: result.session.guardianId,
      action: 'PORTAL_LOGIN',
      entity: 'PortalAccount',
      entityId: result.accountId,
      details: null,
    });

    return NextResponse.json({ success: true, user: result.session });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/login POST');
  }
}
