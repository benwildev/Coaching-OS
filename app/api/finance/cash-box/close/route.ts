import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { closeCashSession } from '@/lib/services/cash-session.service';
import { cashSessionCloseSchema } from '@/lib/validations/cash-session';
import prisma from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const closeRequestSchema = cashSessionCloseSchema.extend({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.cash_session.manage');

    const body = await request.json().catch(() => null);
    const parsed = closeRequestSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const { sessionId, countedCash, note } = parsed.data;

    const existing = await prisma.cashSession.findFirst({
      where: { id: sessionId, coachingCenterId },
      select: { branchId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'CASH_SESSION_NOT_FOUND', message: 'Cash session not found' }, { status: 404 });
    }
    assertBranchAccess(user, existing.branchId);

    const session = await closeCashSession(coachingCenterId, user, sessionId, {
      countedCash,
      note: note || undefined,
    });

    return NextResponse.json({ success: true, session });
  } catch (error) {
    return apiErrorResponse(error, '/api/finance/cash-box/close POST');
  }
}
