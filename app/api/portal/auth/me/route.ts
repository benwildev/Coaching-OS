import { NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/auth/portal-session';
import { getCoachingCenter } from '@/lib/services/tenant.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ success: false, user: null, center: null });

  const center = await getCoachingCenter(session.coachingCenterId);

  return NextResponse.json({
    success: true,
    user: {
      portalType: session.portalType,
      name: session.name,
      studentId: session.studentId,
      guardianId: session.guardianId,
    },
    center: center
      ? {
          name: center.name,
          banglaName: center.banglaName,
          branding: center.brandingSetting,
        }
      : null,
  });
}
