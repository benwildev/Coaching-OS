import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { cancelExpense } from '@/lib/services/expense.service';
import { cancelExpenseSchema } from '@/lib/validations/expense';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  props: { params: Promise<{ expenseId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.cancel');
    const { expenseId } = await props.params;

    const body = await request.json().catch(() => null);
    const parsed = cancelExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors);
    }

    await cancelExpense(coachingCenterId, user, expenseId, parsed.data);
    return NextResponse.json({ success: true, message: 'Expense cancelled successfully' });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/[expenseId]/cancel POST');
  }
}
