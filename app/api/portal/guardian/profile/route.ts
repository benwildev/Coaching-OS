import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { getGuardianProfile, updateGuardianProfile } from '@/lib/services/portal-profile.service';
import { guardianProfileUpdateSchema } from '@/lib/validations/portal-auth';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireGuardianPortal();
    const guardian = await getGuardianProfile(session);
    return NextResponse.json({ success: true, guardian });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/profile GET');
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireGuardianPortal();
    const body = await request.json().catch(() => null);
    const parsed = guardianProfileUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const guardian = await updateGuardianProfile(session, parsed.data);
    return NextResponse.json({ success: true, guardian });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/profile PATCH');
  }
}
