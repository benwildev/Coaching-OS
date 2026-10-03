import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { listExpenses, createExpense } from '@/lib/services/expense.service';
import { createExpenseSchema } from '@/lib/validations/expense';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.read');

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const paymentMethod = searchParams.get('paymentMethod') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;

    const result = await listExpenses(coachingCenterId, user, {
      dateFrom,
      dateTo,
      branchId,
      categoryId,
      paymentMethod,
      status,
      search,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.create');

    const body = await request.json().catch(() => null);
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors);
    }

    const result = await createExpense(coachingCenterId, user, parsed.data);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses POST');
  }
}
