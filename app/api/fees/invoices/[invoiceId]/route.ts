import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getInvoiceById, updateInvoice } from '@/lib/services/invoice.service';
import { invoiceUpdateSchema } from '@/lib/validations/invoice';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { invoiceId } = await props.params;
    const invoice = await getInvoiceById(coachingCenterId, invoiceId);
    if (!invoice) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    assertBranchAccess(user, invoice.branchId);
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/invoices/[invoiceId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { invoiceId } = await props.params;
    const body = await request.json();
    const validated = invoiceUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await getInvoiceById(coachingCenterId, invoiceId);
    if (!existing) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const invoice = await updateInvoice(coachingCenterId, invoiceId, validated.data, user.userId);
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/invoices/[invoiceId] PUT');
  }
}
