import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenant, requirePermission, isBranchScoped } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getCurrentDhakaDateString } from '@/lib/schedule';
import { PAYMENT_METHODS } from '@/lib/services/finance-overview.service';
import { listExpenseCategories } from '@/lib/services/expense.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('expenses.read');

    const branchLocked = isBranchScoped(user);

    const [categoryList, branches] = await Promise.all([
      listExpenseCategories(coachingCenterId, user),
      prisma.branch.findMany({
        where: {
          coachingCenterId,
          ...(branchLocked && user.branchId ? { id: user.branchId } : {}),
        },
        select: { id: true, name: true, banglaName: true, isMain: true },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      }),
    ]);

    // Manual creation can only select non-protected categories
    const manualCategories = categoryList
      .filter((c) => !c.isProtected)
      .map((c) => ({
        id: c.id,
        name: c.name,
        banglaName: c.banglaName,
      }));

    return NextResponse.json({
      success: true,
      categories: manualCategories,
      allActiveCategories: categoryList.filter((c) => c.isActive),
      branches,
      paymentMethods: PAYMENT_METHODS,
      today: getCurrentDhakaDateString(),
      branchLocked,
      effectiveBranchId: branchLocked ? user.branchId : null,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/expenses/options GET');
  }
}
