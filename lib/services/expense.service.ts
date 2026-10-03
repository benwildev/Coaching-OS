import prisma from '@/lib/db';
import { Prisma, PaymentMethod } from '@prisma/client';
import { can } from '@/lib/auth/permissions';
import {
  type SessionUser,
  assertBranchAccess,
  isBranchScoped,
  resolveEffectiveBranchId,
} from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { getCurrentDhakaDateString, toDateOnly } from '@/lib/schedule';
import { TEACHER_SALARY_CATEGORY_CODE } from '@/lib/services/salary.service';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  CancelExpenseInput,
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
} from '@/lib/validations/expense';

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function assertTenantAccess(user: SessionUser, coachingCenterId: string, notFound = false): void {
  if (user.coachingCenterId && user.coachingCenterId !== coachingCenterId) {
    if (notFound) {
      throw new Error('EXPENSE_NOT_FOUND: Expense not found');
    }
    throw new Error('EXPENSE_ACCESS_DENIED: Access denied');
  }
}

function assertCategoryTenantAccess(user: SessionUser, coachingCenterId: string): void {
  if (user.coachingCenterId && user.coachingCenterId !== coachingCenterId) {
    throw new Error('CATEGORY_NOT_FOUND: Expense category not found');
  }
}

export interface ExpenseListParams {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  categoryId?: string;
  paymentMethod?: string;
  status?: string; // 'ACTIVE' | 'CANCELLED' | 'ALL'
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ExpenseSummary {
  totalExpenses: number;
  cashExpenses: number;
  nonCashExpenses: number;
  activeCount: number;
}

/**
 * List expenses with branch scoping, server-side filtering, and pagination.
 * Also returns operational headline totals (Total, Cash, Non-Cash) for ACTIVE records.
 */
export async function listExpenses(
  coachingCenterId: string,
  user: SessionUser,
  params: ExpenseListParams = {}
) {
  assertTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.read')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to view expenses');
  }

  const effectiveBranchId = resolveEffectiveBranchId(user, params.branchId);
  if (isBranchScoped(user) && user.branchId) {
    assertBranchAccess(user, effectiveBranchId);
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  // Build filter where
  const where: Prisma.ExpenseWhereInput = {
    coachingCenterId,
    ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
  };

  // Date filtering
  if (params.dateFrom && params.dateTo) {
    where.date = {
      gte: toDateOnly(params.dateFrom),
      lte: toDateOnly(params.dateTo),
    };
  } else if (params.dateFrom) {
    where.date = { gte: toDateOnly(params.dateFrom) };
  } else if (params.dateTo) {
    where.date = { lte: toDateOnly(params.dateTo) };
  }

  // Category filtering
  if (params.categoryId && params.categoryId !== 'all') {
    where.categoryId = params.categoryId;
  }

  // Payment method filtering
  if (params.paymentMethod && params.paymentMethod !== 'all') {
    where.paymentMethod = params.paymentMethod as PaymentMethod;
  }

  // Status filtering (default: ALL if specified, otherwise ALL or ACTIVE based on filter)
  if (params.status === 'ACTIVE') {
    where.status = 'ACTIVE';
  } else if (params.status === 'CANCELLED') {
    where.status = 'CANCELLED';
  }

  // Search filtering
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { paidTo: { contains: q, mode: 'insensitive' } },
      { invoiceNo: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Parallel execution: filtered items, total count, and operational summary (ACTIVE only)
  const summaryWhere: Prisma.ExpenseWhereInput = {
    coachingCenterId,
    status: 'ACTIVE',
    ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
    ...(params.dateFrom && params.dateTo
      ? { date: { gte: toDateOnly(params.dateFrom), lte: toDateOnly(params.dateTo) } }
      : params.dateFrom
      ? { date: { gte: toDateOnly(params.dateFrom) } }
      : params.dateTo
      ? { date: { lte: toDateOnly(params.dateTo) } }
      : {}),
    ...(params.categoryId && params.categoryId !== 'all' ? { categoryId: params.categoryId } : {}),
  };

  const [items, totalCount, activeAgg, cashAgg] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, banglaName: true, code: true, isActive: true },
        },
        branch: {
          select: { id: true, name: true, banglaName: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        salaryPayment: {
          select: { id: true },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where: summaryWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { ...summaryWhere, paymentMethod: 'CASH' },
      _sum: { amount: true },
    }),
  ]);

  const totalActiveAmount = n(activeAgg._sum.amount);
  const cashActiveAmount = n(cashAgg._sum.amount);
  const nonCashActiveAmount = Math.max(0, Math.round((totalActiveAmount - cashActiveAmount) * 100) / 100);

  const summary: ExpenseSummary = {
    totalExpenses: totalActiveAmount,
    cashExpenses: cashActiveAmount,
    nonCashExpenses: nonCashActiveAmount,
    activeCount: activeAgg._count,
  };

  const formattedItems = items.map((item) => ({
    id: item.id,
    amount: n(item.amount),
    paymentMethod: item.paymentMethod,
    paidTo: item.paidTo,
    invoiceNo: item.invoiceNo,
    date: item.date.toISOString().slice(0, 10),
    notes: item.notes,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    cancelledAt: item.cancelledAt?.toISOString() ?? null,
    cancelledById: item.cancelledById,
    cancelReason: item.cancelReason,
    isSalary: Boolean(item.salaryPayment),
    branch: item.branch,
    category: item.category,
    createdBy: item.createdBy,
  }));

  return {
    items: formattedItems,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
    summary,
  };
}

/**
 * Get detailed information about a single expense.
 */
export async function getExpenseDetail(
  coachingCenterId: string,
  user: SessionUser,
  expenseId: string
) {
  assertTenantAccess(user, coachingCenterId, true);
  if (!can(user, 'expenses.read')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to view expenses');
  }

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, coachingCenterId },
    include: {
      category: {
        select: { id: true, name: true, banglaName: true, code: true, isActive: true },
      },
      branch: {
        select: { id: true, name: true, banglaName: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      salaryPayment: {
        select: {
          id: true,
          teacher: { select: { id: true, name: true } },
          salaryPayable: {
            select: {
              salaryPeriod: { select: { year: true, month: true } },
            },
          },
        },
      },
    },
  });

  if (!expense) {
    throw new Error('EXPENSE_NOT_FOUND: Expense not found');
  }

  assertBranchAccess(user, expense.branchId);

  let cancelledByUser = null;
  if (expense.cancelledById) {
    cancelledByUser = await prisma.user.findUnique({
      where: { id: expense.cancelledById },
      select: { id: true, name: true },
    });
  }

  return {
    id: expense.id,
    amount: n(expense.amount),
    paymentMethod: expense.paymentMethod,
    paidTo: expense.paidTo,
    invoiceNo: expense.invoiceNo,
    date: expense.date.toISOString().slice(0, 10),
    notes: expense.notes,
    status: expense.status,
    createdAt: expense.createdAt.toISOString(),
    cancelledAt: expense.cancelledAt?.toISOString() ?? null,
    cancelReason: expense.cancelReason,
    cancelledBy: cancelledByUser,
    isSalary: Boolean(expense.salaryPayment),
    salaryDetails: expense.salaryPayment
      ? {
          teacherName: expense.salaryPayment.teacher.name,
          period: `${expense.salaryPayment.salaryPayable.salaryPeriod.year}-${String(
            expense.salaryPayment.salaryPayable.salaryPeriod.month
          ).padStart(2, '0')}`,
        }
      : null,
    branch: expense.branch,
    category: expense.category,
    createdBy: expense.createdBy,
  };
}

/**
 * Record a manual expense with server-side validations, branch scoping,
 * idempotency protection, and atomic audit logging.
 */
export async function createExpense(
  coachingCenterId: string,
  user: SessionUser,
  input: CreateExpenseInput
) {
  assertTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.create')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to record expenses');
  }

  // Resolve and validate branch
  if (input.branchId) {
    assertBranchAccess(user, input.branchId);
  }
  const effectiveBranchId = isBranchScoped(user) && user.branchId ? user.branchId : input.branchId;
  assertBranchAccess(user, effectiveBranchId);

  const branch = await prisma.branch.findFirst({
    where: { id: effectiveBranchId, coachingCenterId },
  });
  if (!branch) {
    throw new Error('BRANCH_NOT_FOUND: Selected branch does not exist');
  }

  // Validate date (cannot be in the future in Asia/Dhaka)
  const today = getCurrentDhakaDateString();
  if (input.date > today) {
    throw new Error('INVALID_EXPENSE_DATE: Expense date cannot be in the future');
  }

  // Validate amount
  if (!(input.amount > 0)) {
    throw new Error('INVALID_AMOUNT: Expense amount must be greater than 0');
  }

  // Validate category
  const category = await prisma.expenseCategory.findFirst({
    where: { id: input.categoryId, coachingCenterId },
  });
  if (!category) {
    throw new Error('CATEGORY_NOT_FOUND: Expense category not found');
  }
  if (!category.isActive) {
    throw new Error('CATEGORY_INACTIVE: This expense category is inactive');
  }
  if (category.code === TEACHER_SALARY_CATEGORY_CODE) {
    throw new Error('SYSTEM_CATEGORY_PROTECTED: Salary expenses must be recorded through the Salary module');
  }

  // Validate cash session if CASH payment
  if (input.paymentMethod === 'CASH') {
    const closedSession = await prisma.cashSession.findUnique({
      where: {
        coachingCenterId_branchId_businessDate: {
          coachingCenterId,
          branchId: effectiveBranchId,
          businessDate: toDateOnly(input.date),
        },
      },
      select: { status: true },
    });
    if (closedSession?.status === 'CLOSED') {
      throw new Error('CASH_SESSION_CLOSED: The cash session for this date is already closed');
    }
  }

  // Check idempotency replay before write
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.expense.findFirst({
      where: { coachingCenterId, idempotencyKey },
      include: {
        category: { select: { id: true, name: true, banglaName: true, code: true } },
        branch: { select: { id: true, name: true, banglaName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      return {
        expense: {
          id: existing.id,
          amount: n(existing.amount),
          paymentMethod: existing.paymentMethod,
          paidTo: existing.paidTo,
          invoiceNo: existing.invoiceNo,
          date: existing.date.toISOString().slice(0, 10),
          notes: existing.notes,
          status: existing.status,
          branch: existing.branch,
          category: existing.category,
        },
        idempotentReplay: true,
      };
    }
  }

  // Atomic creation + audit log
  try {
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          coachingCenterId,
          branchId: effectiveBranchId,
          categoryId: input.categoryId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paidTo: input.paidTo?.trim() || null,
          invoiceNo: input.invoiceNo?.trim() || null,
          date: toDateOnly(input.date),
          notes: input.notes?.trim() || null,
          createdById: user.userId,
          status: 'ACTIVE',
          idempotencyKey,
        },
        include: {
          category: { select: { id: true, name: true, banglaName: true, code: true } },
          branch: { select: { id: true, name: true, banglaName: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog(
        {
          coachingCenterId,
          userId: user.userId,
          action: 'EXPENSE_CREATED',
          entity: 'Expense',
          entityId: created.id,
          details: {
            branchId: effectiveBranchId,
            categoryId: input.categoryId,
            categoryName: category.name,
            amount: input.amount,
            paymentMethod: input.paymentMethod,
            date: input.date,
            paidTo: created.paidTo,
            invoiceNo: created.invoiceNo,
          },
        },
        tx
      );

      return created;
    }, { timeout: 20000, maxWait: 10000 });

    return {
      expense: {
        id: expense.id,
        amount: n(expense.amount),
        paymentMethod: expense.paymentMethod,
        paidTo: expense.paidTo,
        invoiceNo: expense.invoiceNo,
        date: expense.date.toISOString().slice(0, 10),
        notes: expense.notes,
        status: expense.status,
        branch: expense.branch,
        category: expense.category,
      },
      idempotentReplay: false,
    };
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.expense.findFirst({
        where: { coachingCenterId, idempotencyKey },
        include: {
          category: { select: { id: true, name: true, banglaName: true, code: true } },
          branch: { select: { id: true, name: true, banglaName: true } },
        },
      });
      if (winner) {
        return {
          expense: {
            id: winner.id,
            amount: n(winner.amount),
            paymentMethod: winner.paymentMethod,
            paidTo: winner.paidTo,
            invoiceNo: winner.invoiceNo,
            date: winner.date.toISOString().slice(0, 10),
            notes: winner.notes,
            status: winner.status,
            branch: winner.branch,
            category: winner.category,
          },
          idempotentReplay: true,
        };
      }
    }
    throw error;
  }
}

/**
 * Edit an active manual expense.
 * Salary-linked and cancelled expenses cannot be edited.
 */
export async function updateExpense(
  coachingCenterId: string,
  user: SessionUser,
  expenseId: string,
  input: UpdateExpenseInput
) {
  assertTenantAccess(user, coachingCenterId, true);
  if (!can(user, 'expenses.update')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to edit expenses');
  }

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, coachingCenterId },
    include: {
      salaryPayment: { select: { id: true } },
      category: { select: { id: true, name: true, code: true } },
    },
  });

  if (!existing) {
    throw new Error('EXPENSE_NOT_FOUND: Expense not found');
  }

  assertBranchAccess(user, existing.branchId);

  if (existing.status === 'CANCELLED') {
    throw new Error('EXPENSE_CANCELLED: Cancelled expenses cannot be edited');
  }

  if (existing.salaryPayment !== null) {
    throw new Error('SALARY_LINKED_IMMUTABLE: This expense is linked to a salary payment and cannot be edited manually');
  }

  const today = getCurrentDhakaDateString();
  const nextDate = input.date ?? existing.date.toISOString().slice(0, 10);
  if (nextDate > today) {
    throw new Error('INVALID_EXPENSE_DATE: Expense date cannot be in the future');
  }

  if (input.amount !== undefined && !(input.amount > 0)) {
    throw new Error('INVALID_AMOUNT: Expense amount must be greater than 0');
  }

  let nextCategoryId = existing.categoryId;
  let nextCategoryName = existing.category.name;
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, coachingCenterId },
    });
    if (!category) {
      throw new Error('CATEGORY_NOT_FOUND: Expense category not found');
    }
    if (!category.isActive) {
      throw new Error('CATEGORY_INACTIVE: This expense category is inactive');
    }
    if (category.code === TEACHER_SALARY_CATEGORY_CODE) {
      throw new Error('SYSTEM_CATEGORY_PROTECTED: Salary expenses must be recorded through the Salary module');
    }
    nextCategoryId = category.id;
    nextCategoryName = category.name;
  }

  const nextPaymentMethod = input.paymentMethod ?? existing.paymentMethod;

  // Cash session check if CASH is involved in old or new record
  if (existing.paymentMethod === 'CASH' || nextPaymentMethod === 'CASH') {
    const oldBusinessDate = existing.date;
    const newBusinessDate = toDateOnly(nextDate);

    // Check old date session
    if (existing.paymentMethod === 'CASH') {
      const oldSession = await prisma.cashSession.findUnique({
        where: {
          coachingCenterId_branchId_businessDate: {
            coachingCenterId,
            branchId: existing.branchId,
            businessDate: oldBusinessDate,
          },
        },
        select: { status: true },
      });
      if (oldSession?.status === 'CLOSED') {
        throw new Error('CASH_SESSION_CLOSED: The cash session for the original date is already closed');
      }
    }

    // Check new date session if changed
    if (nextPaymentMethod === 'CASH' && oldBusinessDate.getTime() !== newBusinessDate.getTime()) {
      const newSession = await prisma.cashSession.findUnique({
        where: {
          coachingCenterId_branchId_businessDate: {
            coachingCenterId,
            branchId: existing.branchId,
            businessDate: newBusinessDate,
          },
        },
        select: { status: true },
      });
      if (newSession?.status === 'CLOSED') {
        throw new Error('CASH_SESSION_CLOSED: The cash session for the new date is already closed');
      }
    }
  }

  // Atomic update + audit log
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expense.update({
      where: { id: expenseId },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.date ? { date: toDateOnly(input.date) } : {}),
        ...(input.categoryId ? { categoryId: nextCategoryId } : {}),
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        ...(input.paidTo !== undefined ? { paidTo: input.paidTo?.trim() || null } : {}),
        ...(input.invoiceNo !== undefined ? { invoiceNo: input.invoiceNo?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
      include: {
        category: { select: { id: true, name: true, banglaName: true, code: true } },
        branch: { select: { id: true, name: true, banglaName: true } },
      },
    });

    await recordAuditLog(
      {
        coachingCenterId,
        userId: user.userId,
        action: 'EXPENSE_UPDATED',
        entity: 'Expense',
        entityId: expenseId,
        details: {
          previous: {
            amount: n(existing.amount),
            categoryId: existing.categoryId,
            paymentMethod: existing.paymentMethod,
            date: existing.date.toISOString().slice(0, 10),
            paidTo: existing.paidTo,
            invoiceNo: existing.invoiceNo,
          },
          updated: {
            amount: n(result.amount),
            categoryId: nextCategoryId,
            categoryName: nextCategoryName,
            paymentMethod: result.paymentMethod,
            date: result.date.toISOString().slice(0, 10),
            paidTo: result.paidTo,
            invoiceNo: result.invoiceNo,
          },
        },
      },
      tx
    );

    return result;
  }, { timeout: 20000, maxWait: 10000 });

  return {
    id: updated.id,
    amount: n(updated.amount),
    paymentMethod: updated.paymentMethod,
    paidTo: updated.paidTo,
    invoiceNo: updated.invoiceNo,
    date: updated.date.toISOString().slice(0, 10),
    notes: updated.notes,
    status: updated.status,
    branch: updated.branch,
    category: updated.category,
  };
}

/**
 * Cancel an active manual expense with mandatory reason.
 * Salary-linked expenses cannot be cancelled here (managed through Salary).
 */
export async function cancelExpense(
  coachingCenterId: string,
  user: SessionUser,
  expenseId: string,
  input: CancelExpenseInput
) {
  assertTenantAccess(user, coachingCenterId, true);
  if (!can(user, 'expenses.cancel')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to cancel expenses');
  }

  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new Error('INVALID_CANCEL_REASON: Cancellation reason must be at least 3 characters');
  }

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, coachingCenterId },
    include: {
      salaryPayment: { select: { id: true } },
      category: { select: { id: true, name: true } },
    },
  });

  if (!existing) {
    throw new Error('EXPENSE_NOT_FOUND: Expense not found');
  }

  assertBranchAccess(user, existing.branchId);

  if (existing.status === 'CANCELLED') {
    throw new Error('EXPENSE_ALREADY_CANCELLED: This expense is already cancelled');
  }

  if (existing.salaryPayment !== null) {
    throw new Error('SALARY_LINKED_IMMUTABLE: This expense is linked to a salary payment. Manage it from Salary.');
  }

  // Cash session check if expense was paid with CASH
  if (existing.paymentMethod === 'CASH') {
    const session = await prisma.cashSession.findUnique({
      where: {
        coachingCenterId_branchId_businessDate: {
          coachingCenterId,
          branchId: existing.branchId,
          businessDate: existing.date,
        },
      },
      select: { status: true },
    });
    if (session?.status === 'CLOSED') {
      throw new Error('CASH_SESSION_CLOSED: Cannot cancel a cash expense for a closed cash session date');
    }
  }

  const now = new Date();

  // Atomic cancellation + audit log
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledById: user.userId,
        cancelReason: reason,
      },
    });

    await recordAuditLog(
      {
        coachingCenterId,
        userId: user.userId,
        action: 'EXPENSE_CANCELLED',
        entity: 'Expense',
        entityId: expenseId,
        details: {
          amount: n(existing.amount),
          paymentMethod: existing.paymentMethod,
          date: existing.date.toISOString().slice(0, 10),
          categoryId: existing.categoryId,
          categoryName: existing.category.name,
          paidTo: existing.paidTo,
          cancelReason: reason,
        },
      },
      tx
    );
  }, { timeout: 20000, maxWait: 10000 });

  return { success: true };
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Office Rent', banglaName: 'অফিস ভাড়া' },
  { name: 'Electricity', banglaName: 'বিদ্যুৎ বিল' },
  { name: 'Internet', banglaName: 'ইন্টারনেট বিল' },
  { name: 'Staff Salary', banglaName: 'স্টাফ বেতন' },
  { name: 'Stationery', banglaName: 'স্টেশনারি ও খাতা-কলম' },
  { name: 'Marketing', banglaName: 'প্রচার ও মার্কেটিং' },
  { name: 'Transport', banglaName: 'যাতায়াত ও পরিবহন' },
  { name: 'Cleaning', banglaName: 'পরিচ্ছন্নতা' },
  { name: 'Maintenance', banglaName: 'মেরামত ও রক্ষণাবেক্ষণ' },
  { name: 'Equipment', banglaName: 'সরঞ্জাম ও আসবাবপত্র' },
  { name: 'Other', banglaName: 'অন্যান্য খরচ' },
];

/**
 * List expense categories for a coaching center with expense usage count.
 */
export async function listExpenseCategories(
  coachingCenterId: string,
  user: SessionUser,
  options: { includeInactive?: boolean } = {}
) {
  assertCategoryTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.read') && !can(user, 'expenses.categories.manage')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to view expense categories');
  }

  const count = await prisma.expenseCategory.count({
    where: { coachingCenterId, code: { not: TEACHER_SALARY_CATEGORY_CODE } },
  });
  if (count === 0) {
    await prisma.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        coachingCenterId,
        name: c.name,
        banglaName: c.banglaName,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  const categories = await prisma.expenseCategory.findMany({
    where: {
      coachingCenterId,
      ...(options.includeInactive ? {} : { isActive: true }),
    },
    include: {
      _count: {
        select: {
          expenses: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  });

  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    banglaName: cat.banglaName,
    code: cat.code,
    isActive: cat.isActive,
    isProtected: cat.code === TEACHER_SALARY_CATEGORY_CODE,
    expenseCount: cat._count.expenses,
  }));
}

/**
 * Create a new expense category.
 */
export async function createExpenseCategory(
  coachingCenterId: string,
  user: SessionUser,
  input: CreateExpenseCategoryInput
) {
  assertCategoryTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.categories.manage')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to manage expense categories');
  }

  const name = input.name.trim();
  const existing = await prisma.expenseCategory.findFirst({
    where: { coachingCenterId, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) {
    throw new Error('CATEGORY_ALREADY_EXISTS: A category with this name already exists');
  }

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.expenseCategory.create({
      data: {
        coachingCenterId,
        name,
        banglaName: input.banglaName?.trim() || null,
        isActive: true,
      },
    });

    await recordAuditLog(
      {
        coachingCenterId,
        userId: user.userId,
        action: 'EXPENSE_CATEGORY_CREATED',
        entity: 'ExpenseCategory',
        entityId: created.id,
        details: { name: created.name, banglaName: created.banglaName },
      },
      tx
    );

    return created;
  });

  return {
    id: category.id,
    name: category.name,
    banglaName: category.banglaName,
    code: category.code,
    isActive: category.isActive,
    isProtected: false,
    expenseCount: 0,
  };
}

/**
 * Update an existing expense category (name, banglaName, or active/inactive toggle).
 * System protected categories cannot be deactivated.
 */
export async function updateExpenseCategory(
  coachingCenterId: string,
  user: SessionUser,
  categoryId: string,
  input: UpdateExpenseCategoryInput
) {
  assertCategoryTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.categories.manage')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to manage expense categories');
  }

  const existing = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, coachingCenterId },
  });
  if (!existing) {
    throw new Error('CATEGORY_NOT_FOUND: Expense category not found');
  }

  const isProtected = existing.code === TEACHER_SALARY_CATEGORY_CODE;

  if (isProtected && input.isActive === false) {
    throw new Error('SYSTEM_CATEGORY_PROTECTED: The system salary category cannot be deactivated');
  }

  if (input.name?.trim()) {
    const name = input.name.trim();
    const duplicate = await prisma.expenseCategory.findFirst({
      where: {
        coachingCenterId,
        id: { not: categoryId },
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw new Error('CATEGORY_ALREADY_EXISTS: A category with this name already exists');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.banglaName !== undefined ? { banglaName: input.banglaName?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    const isDeactivation = input.isActive === false && existing.isActive === true;
    await recordAuditLog(
      {
        coachingCenterId,
        userId: user.userId,
        action: isDeactivation ? 'EXPENSE_CATEGORY_DEACTIVATED' : 'EXPENSE_CATEGORY_UPDATED',
        entity: 'ExpenseCategory',
        entityId: categoryId,
        details: {
          previous: { name: existing.name, banglaName: existing.banglaName, isActive: existing.isActive },
          updated: { name: result.name, banglaName: result.banglaName, isActive: result.isActive },
        },
      },
      tx
    );

    return result;
  });

  return {
    id: updated.id,
    name: updated.name,
    banglaName: updated.banglaName,
    code: updated.code,
    isActive: updated.isActive,
    isProtected,
  };
}

/**
 * Delete a category ONLY if it has zero expenses.
 * Categories with existing financial expenses cannot be deleted (must be deactivated instead).
 */
export async function deleteExpenseCategory(
  coachingCenterId: string,
  user: SessionUser,
  categoryId: string
) {
  assertCategoryTenantAccess(user, coachingCenterId);
  if (!can(user, 'expenses.categories.manage')) {
    throw new Error('EXPENSE_ACCESS_DENIED: You do not have permission to manage expense categories');
  }

  const existing = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, coachingCenterId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!existing) {
    throw new Error('CATEGORY_NOT_FOUND: Expense category not found');
  }

  if (existing.code === TEACHER_SALARY_CATEGORY_CODE) {
    throw new Error('SYSTEM_CATEGORY_PROTECTED: The system salary category cannot be deleted');
  }

  if (existing._count.expenses > 0) {
    throw new Error('CATEGORY_IN_USE: Cannot delete a category that has recorded expenses. Deactivate it instead.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.expenseCategory.delete({ where: { id: categoryId } });
    await recordAuditLog(
      {
        coachingCenterId,
        userId: user.userId,
        action: 'EXPENSE_CATEGORY_DELETED',
        entity: 'ExpenseCategory',
        entityId: categoryId,
        details: { name: existing.name },
      },
      tx
    );
  });

  return { success: true };
}
