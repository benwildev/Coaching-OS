import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Distinct staff who have actually collected a payment — the real option set for a "Collector" filter dropdown. */
export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.read');
    const sp = new URL(request.url).searchParams;
    const branchId = resolveEffectiveBranchId(user, sp.get('branch') || undefined);

    const rows = await prisma.payment.findMany({
      where: { coachingCenterId, ...(branchId ? { branchId } : {}), collectedById: { not: null } },
      distinct: ['collectedById'],
      select: { collectedBy: { select: { id: true, name: true } } },
    });

    const collectors = rows
      .map((r) => r.collectedBy)
      .filter((c): c is { id: string; name: string } => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, collectors });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/collectors GET');
  }
}
