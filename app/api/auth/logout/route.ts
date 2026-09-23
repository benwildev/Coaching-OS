import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', req.url));
}
