import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getPaymentById } from '@/lib/services/payment.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ paymentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { paymentId } = await props.params;
    const payment = await getPaymentById(coachingCenterId, paymentId);
    if (!payment) return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
    assertBranchAccess(user, payment.branchId);
    return NextResponse.json({ success: true, payment });
  } catch (error: any) {
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}
