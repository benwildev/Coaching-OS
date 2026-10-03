import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  updateExpenseCategory,
  deleteExpenseCategory,
} from '@/lib/services/expense.service';
import { updateExpenseCategorySchema } from '@/lib/validations/expense';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.categories.manage');
    const { categoryId } = await props.params;

    const body = await request.json().catch(() => null);
    const parsed = updateExpenseCategorySchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors);
    }

    const category = await updateExpenseCategory(coachingCenterId, user, categoryId, parsed.data);
    return NextResponse.json({ success: true, category });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/categories/[categoryId] PATCH');
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.categories.manage');
    const { categoryId } = await props.params;

    await deleteExpenseCategory(coachingCenterId, user, categoryId);
    return NextResponse.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/categories/[categoryId] DELETE');
  }
}
