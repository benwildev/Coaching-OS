import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight liveness/readiness probe for uptime monitors and load
 * balancers. Confirms the app can reach its database but never reveals
 * connection details, credentials, or any other internal state — a failure
 * here is reported as a generic 503, never the underlying error message.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
