import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getCoachingCenter } from '@/lib/services/tenant.service';
import { getTenantSubscription } from '@/lib/services/subscription.service';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null, center: null });
  }

  const [center, sub] = await Promise.all([getCoachingCenter(session.coachingCenterId), getTenantSubscription(session.coachingCenterId)]);

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
          // Presentation hints only (menus, banners). Every feature is enforced again server-side.
          features: sub.features,
          subscriptionStatus: sub.status,
        }
      : null,
  });
}
