import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getInvoiceById } from '@/lib/services/invoice.service';
import { createPayment } from '@/lib/services/payment.service';
import { paymentCreateSchema } from '@/lib/validations/payment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { invoiceId } = await props.params;
    const body = await request.json();
    const validated = paymentCreateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await getInvoiceById(coachingCenterId, invoiceId);
    if (!existing) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const result = await createPayment(coachingCenterId, invoiceId, validated.data, user.userId);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/fees/invoices/[invoiceId]/payments POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to record payment' }, { status });
  }
}
