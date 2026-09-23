import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getRecentAuditLogs } from '@/lib/services/audit.service';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const logs = await getRecentAuditLogs(coachingCenterId, 30);
    return NextResponse.json({ success: true, logs });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
