import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { closeCashSession } from '@/lib/services/cash-session.service';
import { cashSessionCloseSchema } from '@/lib/validations/cash-session';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { id } = await params;

    const existing = await prisma.cashSession.findFirst({ where: { id, coachingCenterId }, select: { branchId: true } });
    if (!existing) return NextResponse.json({ success: false, error: 'CASH_SESSION_NOT_FOUND' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const body = await request.json().catch(() => null);
    const parsed = cashSessionCloseSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const session = await closeCashSession(coachingCenterId, user, id, {
      countedCash: parsed.data.countedCash,
      note: parsed.data.note || undefined,
    });
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/cash-sessions/[id]/close POST');
  }
}
