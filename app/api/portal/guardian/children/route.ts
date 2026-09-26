import { NextResponse } from 'next/server';
import { requireGuardianPortal } from '@/lib/auth/portal-session';
import { getGuardianChildren } from '@/lib/services/portal-profile.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** The sole source of truth for "which children can this guardian see" — never a client-supplied list. */
export async function GET() {
  try {
    const session = await requireGuardianPortal();
    const children = await getGuardianChildren(session);
    return NextResponse.json({ success: true, children });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/guardian/children GET');
  }
}
