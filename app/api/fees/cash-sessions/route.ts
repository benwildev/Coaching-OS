import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { listCashSessions, openCashSession } from '@/lib/services/cash-session.service';
import { cashSessionOpenSchema } from '@/lib/validations/cash-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.cash_session.manage');
    const sp = new URL(request.url).searchParams;
    const branchId = resolveEffectiveBranchId(user, sp.get('branch') || undefined);

    const result = await listCashSessions(coachingCenterId, {
      branchId,
      dateFrom: sp.get('dateFrom') || undefined,
      dateTo: sp.get('dateTo') || undefined,
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 20,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/cash-sessions GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.cash_session.manage');
    const body = await request.json().catch(() => null);
    const parsed = cashSessionOpenSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    // A branch-locked user can only ever open a session for their own
    // branch, regardless of what branchId the client submits. branchId is
    // required by the schema, so this is always defined for OWNER/ADMIN too.
    const branchId = resolveEffectiveBranchId(user, parsed.data.branchId) as string;

    const session = await openCashSession(coachingCenterId, user, branchId, parsed.data.openingCash);
    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/cash-sessions POST');
  }
}
