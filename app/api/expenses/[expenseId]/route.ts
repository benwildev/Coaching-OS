import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getExpenseDetail, updateExpense } from '@/lib/services/expense.service';
import { updateExpenseSchema } from '@/lib/validations/expense';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ expenseId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.read');
    const { expenseId } = await props.params;

    const expense = await getExpenseDetail(coachingCenterId, user, expenseId);
    return NextResponse.json({ success: true, expense });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/[expenseId] GET');
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ expenseId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.update');
    const { expenseId } = await props.params;

    const body = await request.json().catch(() => null);
    const parsed = updateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors);
    }

    const updated = await updateExpense(coachingCenterId, user, expenseId, parsed.data);
    return NextResponse.json({ success: true, expense: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/[expenseId] PATCH');
  }
}
