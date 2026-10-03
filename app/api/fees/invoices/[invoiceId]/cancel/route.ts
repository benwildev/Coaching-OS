import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getInvoiceById, cancelInvoice } from '@/lib/services/invoice.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.invoices.create');

    const { invoiceId } = await props.params;
    const existing = await getInvoiceById(coachingCenterId, invoiceId);
    if (!existing) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const invoice = await cancelInvoice(coachingCenterId, invoiceId, user.userId);
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/invoices/[invoiceId]/cancel POST');
  }
}
