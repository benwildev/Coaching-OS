import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getInvoicesList, createInvoice } from '@/lib/services/invoice.service';
import { invoiceCreateSchema } from '@/lib/validations/invoice';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const result = await getInvoicesList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      branchId,
      studentId: searchParams.get('student') || undefined,
      batchId: searchParams.get('batch') || undefined,
      status: searchParams.get('status') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 401;
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const body = await request.json();
    const validated = invoiceCreateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const invoice = await createInvoice(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/fees/invoices POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create invoice' }, { status });
  }
}
