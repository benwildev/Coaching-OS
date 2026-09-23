import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { brandingSchema } from '@/lib/validations/settings';
import { getBrandingSettings, updateBrandingSettings } from '@/lib/services/settings.service';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    const branding = await getBrandingSettings(coachingCenterId);
    return NextResponse.json({ success: true, branding });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await req.json();
    const parsed = brandingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid branding data' },
        { status: 400 }
      );
    }

    const updated = await updateBrandingSettings(
      coachingCenterId,
      {
        primaryColor: parsed.data.primaryColor,
        secondaryColor: parsed.data.secondaryColor,
        accentColor: parsed.data.accentColor,
        logoUrl: parsed.data.logoUrl,
        faviconUrl: parsed.data.faviconUrl,
      },
      user.userId
    );

    return NextResponse.json({ success: true, branding: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update branding' },
      { status: 500 }
    );
  }
}
