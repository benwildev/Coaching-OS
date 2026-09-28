import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { getInvoicesList, createInvoice } from '@/lib/services/invoice.service';
import { invoiceCreateSchema } from '@/lib/validations/invoice';
import prisma from '@/lib/db';

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

    // Phase 10.5: when branchId is omitted, createInvoice derives it from
    // the student's own record server-side — but the old code never
    // re-checked THAT derived value, so a branch-locked STAFF could invoice
    // a student in a different branch simply by leaving branchId out of
    // the request. Derive-and-check it here first either way.
    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    } else {
      const student = await prisma.student.findFirst({
        where: { id: validated.data.studentId, coachingCenterId },
        select: { branchId: true },
      });
      if (!student) {
        return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
      }
      assertBranchAccess(user, student.branchId);
    }

    const invoice = await createInvoice(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/fees/invoices POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create invoice' }, { status });
  }
}
