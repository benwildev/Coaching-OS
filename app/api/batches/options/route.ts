import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { getBatchFormOptions } from '@/lib/services/batch.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    const options = await getBatchFormOptions(coachingCenterId);
    return NextResponse.json({ success: true, ...options });
  } catch (error) {
    console.error('[API /api/batches/options GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
