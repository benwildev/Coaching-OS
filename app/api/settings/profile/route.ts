import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { centerProfileSchema } from '@/lib/validations/settings';
import { updateCoachingCenter, getCoachingCenter } from '@/lib/services/tenant.service';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    const center = await getCoachingCenter(coachingCenterId);
    return NextResponse.json({ success: true, center });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await req.json();
    const parsed = centerProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid data' },
        { status: 400 }
      );
    }

    const updated = await updateCoachingCenter(
      coachingCenterId,
      {
        name: parsed.data.name,
        banglaName: parsed.data.banglaName,
        phone: parsed.data.phone,
        email: parsed.data.email,
        website: parsed.data.website,
        address: parsed.data.address,
        city: parsed.data.city,
        district: parsed.data.district,
        logo: parsed.data.logo,
      },
      user.userId
    );

    return NextResponse.json({ success: true, center: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update center profile' },
      { status: 500 }
    );
  }
}
