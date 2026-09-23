import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getInvoiceById, cancelInvoice } from '@/lib/services/invoice.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { invoiceId } = await props.params;
    const existing = await getInvoiceById(coachingCenterId, invoiceId);
    if (!existing) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const invoice = await cancelInvoice(coachingCenterId, invoiceId, user.userId);
    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[API /api/fees/invoices/[invoiceId]/cancel POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to cancel invoice' }, { status });
  }
}
