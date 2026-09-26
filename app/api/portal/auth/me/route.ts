import { NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth/portal-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ success: false, user: null });
  return NextResponse.json({
    success: true,
    user: {
      portalType: session.portalType,
      name: session.name,
      studentId: session.studentId,
      guardianId: session.guardianId,
    },
  });
}
