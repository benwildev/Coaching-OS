import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getCoachingCenter } from '@/lib/services/tenant.service';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null, center: null });
  }

  const center = await getCoachingCenter(session.coachingCenterId);

  return NextResponse.json({
    authenticated: true,
    user: session,
    center: center
      ? {
          id: center.id,
          name: center.name,
          banglaName: center.banglaName,
          code: center.code,
          phone: center.phone,
          city: center.city,
          district: center.district,
          logo: center.logo,
          branches: center.branches,
          branding: center.brandingSetting,
        }
      : null,
  });
}
