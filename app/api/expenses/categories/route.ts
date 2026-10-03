import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  listExpenseCategories,
  createExpenseCategory,
} from '@/lib/services/expense.service';
import { createExpenseCategorySchema } from '@/lib/validations/expense';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.read');

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const categories = await listExpenseCategories(coachingCenterId, user, {
      includeInactive,
    });
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/categories GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.categories.manage');

    const body = await request.json().catch(() => null);
    const parsed = createExpenseCategorySchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten().fieldErrors);
    }

    const category = await createExpenseCategory(coachingCenterId, user, parsed.data);
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/categories POST');
  }
}
