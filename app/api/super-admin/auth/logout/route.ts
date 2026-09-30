import { NextResponse } from 'next/server';
import { clearPlatformSessionCookie, getPlatformSession } from '@/lib/auth/platform-session';
import { revokePlatformSessions } from '@/lib/services/platform-auth.service';
import { recordPlatformAudit } from '@/lib/services/platform-audit.service';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getPlatformSession();
  if (session) {
    await revokePlatformSessions(session.adminId);
    await recordPlatformAudit({ adminId: session.adminId, action: 'PLATFORM_LOGOUT', entity: 'PlatformAdmin', entityId: session.adminId });
  }
  await clearPlatformSessionCookie();
  return NextResponse.json({ success: true });
}
