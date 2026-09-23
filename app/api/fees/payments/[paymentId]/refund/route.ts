import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getPaymentById, refundPayment } from '@/lib/services/payment.service';
import { paymentRefundSchema } from '@/lib/validations/payment';

export const dynamic = 'force-dynamic';

// Refunds are OWNER/ADMIN only (AGENTS.md Phase 5 §16/§23/§24).
export async function POST(request: Request, props: { params: Promise<{ paymentId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { paymentId } = await props.params;
    const body = await request.json();
    const validated = paymentRefundSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await getPaymentById(coachingCenterId, paymentId);
    if (!existing) return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const refund = await refundPayment(coachingCenterId, paymentId, validated.data, user.userId);
    return NextResponse.json({ success: true, refund }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/fees/payments/[paymentId]/refund POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to process refund' }, { status });
  }
}
