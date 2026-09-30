import { NextResponse } from 'next/server';
import { getPlatformSession } from '@/lib/auth/platform-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ authenticated: false, admin: null });
  return NextResponse.json({ authenticated: true, admin: { name: session.name, email: session.email } });
}
