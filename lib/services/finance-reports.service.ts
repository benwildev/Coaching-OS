import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { type FinanceScope, PAYMENT_METHODS } from './finance-overview.service';
import { computeExpectedCash } from './cash-session.service';
import {
  MAX_DAILY_BUCKET_DAYS,
  bucketKey,
  buildDhakaRange,
  enumerateBuckets,
  previousRange,
  type Granularity,
} from '@/lib/reports/dates';
import { dhakaDateOf, sqlAnd } from '@/lib/reports/sql';

type Dec = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const sum = (xs: Dec[]): Dec => xs.reduce((a, b) => a.plus(b), ZERO);
const num = (d: Dec | number | null | undefined): number => {
  if (d == null) return 0;
  if (typeof d === 'number') return Math.round(d * 100) / 100;
  return d.toDecimalPlaces(2).toNumber();
};

export interface FinanceReportParams {
  from: string;
  to: string;
  branchId?: string;
  categoryId?: string;
  paymentMethod?: string;
  comparison?: boolean;
}

export interface IncomeBreakdownRow {
  date: string;
  gross: number;
  refunds: number;
  net: number;
}

export interface BranchIncomeRow {
  branchId: string;
  branchName: string;
  branchBanglaName: string | null;
  gross: number;
  refunds: number;
  net: number;
}

export interface MethodIncomeRow {
  method: string;
  gross: number;
  refunds: number;
  net: number;
}

export interface CategoryExpenseRow {
  categoryId: string;
  name: string;
  banglaName: string | null;
  code: string | null;
  amount: number;
  percentage: number | null;
}

export interface BranchExpenseRow {
  branchId: string;
  branchName: string;
  branchBanglaName: string | null;
  amount: number;
  cashAmount: number;
  nonCashAmount: number;
}

export interface MethodExpenseRow {
  method: string;
  amount: number;
  percentage: number | null;
}

export interface ProfitTrendRow {
  bucket: string;
  gross: number;
  refunds: number;
  netCollection: number;
  expenses: number;
  netProfit: number;
  margin: number | null;
}

export interface CashSessionRow {
  id: string;
  businessDate: string;
  branchId: string;
  branchName: string;
  branchBanglaName: string | null;
  status: 'OPEN' | 'CLOSED';
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  note: string | null;
  openedByName: string | null;
  closedByName: string | null;
  closedAt: string | null;
}

export interface FinanceReportData {
  period: { from: string; to: string; days: number; granularity: Granularity };
  branch: { id: string | null; locked: boolean; options: Array<{ id: string; name: string; banglaName: string | null }> };
  summary: {
    grossCollection: number;
    refunds: number;
    netCollection: number;
    totalExpenses: number;
    cashExpenses: number;
    nonCashExpenses: number;
    netProfit: number;
    netMargin: number | null;
    salaryExpenses: number;
    salaryExpensesCount: number;
  };
  income: {
    byDate: IncomeBreakdownRow[];
    byBranch: BranchIncomeRow[];
    byMethod: MethodIncomeRow[];
  };
  expenses: {
    byCategory: CategoryExpenseRow[];
    byBranch: BranchExpenseRow[];
    byMethod: MethodExpenseRow[];
  };
  profit: {
    trend: ProfitTrendRow[];
  };
  cash: {
    openingCashTotal: number;
    cashIn: number;
    cashOut: number;
    expectedCashTotal: number;
    countedCashTotal: number;
    differenceTotal: number;
    sessions: CashSessionRow[];
  };
  comparison: null | {
    period: { from: string; to: string };
    hasPrevious: boolean;
    netCollection: { current: number; previous: number; changePct: number | null };
    expenses: { current: number; previous: number; changePct: number | null };
    netProfit: { current: number; previous: number; changePct: number | null };
  };
}

export async function getFinanceReports(
  scope: FinanceScope,
  params: FinanceReportParams
): Promise<FinanceReportData> {
  const cc = scope.coachingCenterId;
  const range = buildDhakaRange(params.from, params.to);

  // SQL WHERE filters for payments & refunds
  const payBranchSql = scope.branchId ? [Prisma.sql`p."branchId" = ${scope.branchId}`] : [];
  const payMethodSql = params.paymentMethod && params.paymentMethod !== 'all' ? [Prisma.sql`p."paymentMethod"::text = ${params.paymentMethod}`] : [];
  
  // SQL WHERE filters for expenses
  const expBranchSql = scope.branchId ? [Prisma.sql`e."branchId" = ${scope.branchId}`] : [];
  const expCategorySql = params.categoryId && params.categoryId !== 'all' ? [Prisma.sql`e."categoryId" = ${params.categoryId}`] : [];
  const expMethodSql = params.paymentMethod && params.paymentMethod !== 'all' ? [Prisma.sql`e."paymentMethod"::text = ${params.paymentMethod}`] : [];

  // Aggregated queries for payments, refunds, and expenses
  const [paymentsRaw, refundsRaw, expensesRaw] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; branchId: string; method: string; amount: Dec; count: number }>>`
      SELECT 
        ${dhakaDateOf(Prisma.sql`p."paymentDate"`)} AS day,
        COALESCE(p."branchId", '') AS "branchId",
        p."paymentMethod"::text AS method,
        SUM(p."amount") AS amount,
        COUNT(p."id")::int AS count
      FROM "payments" p
      WHERE ${sqlAnd([
        Prisma.sql`p."coachingCenterId" = ${cc}`,
        Prisma.sql`p."status"::text <> 'VOIDED'`,
        Prisma.sql`p."paymentDate" >= ${range.start}`,
        Prisma.sql`p."paymentDate" < ${range.endExclusive}`,
        ...payBranchSql,
        ...payMethodSql,
      ])}
      GROUP BY 1, 2, 3`,

    prisma.$queryRaw<Array<{ day: string; branchId: string; method: string; amount: Dec; count: number }>>`
      SELECT 
        ${dhakaDateOf(Prisma.sql`r."refundDate"`)} AS day,
        COALESCE(p."branchId", '') AS "branchId",
        p."paymentMethod"::text AS method,
        SUM(r."amount") AS amount,
        COUNT(r."id")::int AS count
      FROM "payment_refunds" r
      JOIN "payments" p ON p."id" = r."paymentId"
      WHERE ${sqlAnd([
        Prisma.sql`r."coachingCenterId" = ${cc}`,
        Prisma.sql`p."status"::text <> 'VOIDED'`,
        Prisma.sql`r."refundDate" >= ${range.start}`,
        Prisma.sql`r."refundDate" < ${range.endExclusive}`,
        ...payBranchSql,
        ...payMethodSql,
      ])}
      GROUP BY 1, 2, 3`,

    prisma.$queryRaw<Array<{ day: string; branchId: string; categoryId: string; method: string; amount: Dec; count: number; isSalary: boolean }>>`
      SELECT 
        to_char(e."date", 'YYYY-MM-DD') AS day,
        e."branchId" AS "branchId",
        e."categoryId" AS "categoryId",
        e."paymentMethod"::text AS method,
        SUM(e."amount") AS amount,
        COUNT(e."id")::int AS count,
        (e."id" IN (SELECT sp."expenseId" FROM "salary_payments" sp WHERE sp."expenseId" IS NOT NULL)) AS "isSalary"
      FROM "expenses" e
      WHERE ${sqlAnd([
        Prisma.sql`e."coachingCenterId" = ${cc}`,
        Prisma.sql`e."status" = 'ACTIVE'`,
        Prisma.sql`e."date" >= ${range.dateFrom}`,
        Prisma.sql`e."date" <= ${range.dateTo}`,
        ...expBranchSql,
        ...expCategorySql,
        ...expMethodSql,
      ])}
      GROUP BY 1, 2, 3, 4, 7`,
  ]);

  // Overall totals
  const totalGross = sum(paymentsRaw.map((p) => p.amount));
  const totalRefunds = sum(refundsRaw.map((r) => r.amount));
  const totalNetCollection = totalGross.minus(totalRefunds);
  const totalExpenses = sum(expensesRaw.map((e) => e.amount));
  const cashExpenses = sum(expensesRaw.filter((e) => e.method === 'CASH').map((e) => e.amount));
  const nonCashExpenses = totalExpenses.minus(cashExpenses);
  const netProfit = totalNetCollection.minus(totalExpenses);
  const netMargin = totalNetCollection.greaterThan(0)
    ? netProfit.div(totalNetCollection).times(100).toDecimalPlaces(1).toNumber()
    : null;

  // Salary expense breakdown
  const salaryExpensesList = expensesRaw.filter((e) => e.isSalary);
  const totalSalaryExpenses = sum(salaryExpensesList.map((e) => e.amount));
  const totalSalaryCount = salaryExpensesList.reduce((acc, e) => acc + e.count, 0);

  // Income Breakdown: By Date
  const dateMap = new Map<string, { gross: Dec; refunds: Dec }>();
  for (const p of paymentsRaw) {
    const cur = dateMap.get(p.day) || { gross: ZERO, refunds: ZERO };
    cur.gross = cur.gross.plus(p.amount);
    dateMap.set(p.day, cur);
  }
  for (const r of refundsRaw) {
    const cur = dateMap.get(r.day) || { gross: ZERO, refunds: ZERO };
    cur.refunds = cur.refunds.plus(r.amount);
    dateMap.set(r.day, cur);
  }
  const incomeByDate: IncomeBreakdownRow[] = Array.from(dateMap.entries())
    .map(([date, d]) => ({
      date,
      gross: num(d.gross),
      refunds: num(d.refunds),
      net: num(d.gross.minus(d.refunds)),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Income Breakdown: By Branch
  const branchMap = new Map(scope.branches.map((b) => [b.id, { name: b.name, bn: b.banglaName, gross: ZERO, refunds: ZERO }]));
  for (const p of paymentsRaw) {
    if (branchMap.has(p.branchId)) {
      const b = branchMap.get(p.branchId)!;
      b.gross = b.gross.plus(p.amount);
    }
  }
  for (const r of refundsRaw) {
    if (branchMap.has(r.branchId)) {
      const b = branchMap.get(r.branchId)!;
      b.refunds = b.refunds.plus(r.amount);
    }
  }
  const incomeByBranch: BranchIncomeRow[] = Array.from(branchMap.entries()).map(([branchId, b]) => ({
    branchId,
    branchName: b.name,
    branchBanglaName: b.bn,
    gross: num(b.gross),
    refunds: num(b.refunds),
    net: num(b.gross.minus(b.refunds)),
  }));

  // Income Breakdown: By Payment Method
  const methodIncomeMap = new Map<string, { gross: Dec; refunds: Dec }>(
    PAYMENT_METHODS.map((m) => [m, { gross: ZERO, refunds: ZERO }])
  );
  for (const p of paymentsRaw) {
    const m = methodIncomeMap.get(p.method) || { gross: ZERO, refunds: ZERO };
    m.gross = m.gross.plus(p.amount);
    methodIncomeMap.set(p.method, m);
  }
  for (const r of refundsRaw) {
    const m = methodIncomeMap.get(r.method) || { gross: ZERO, refunds: ZERO };
    m.refunds = m.refunds.plus(r.amount);
    methodIncomeMap.set(r.method, m);
  }
  const incomeByMethod: MethodIncomeRow[] = PAYMENT_METHODS.map((m) => {
    const slot = methodIncomeMap.get(m)!;
    return {
      method: m,
      gross: num(slot.gross),
      refunds: num(slot.refunds),
      net: num(slot.gross.minus(slot.refunds)),
    };
  });

  // Expense Breakdown: By Category
  const categoryIds = [...new Set(expensesRaw.map((e) => e.categoryId))];
  const dbCategories = await prisma.expenseCategory.findMany({
    where: { coachingCenterId: cc, id: { in: categoryIds } },
    select: { id: true, name: true, banglaName: true, code: true },
  });
  const catLookup = new Map(dbCategories.map((c) => [c.id, c]));

  const catAgg = new Map<string, Dec>();
  for (const e of expensesRaw) {
    catAgg.set(e.categoryId, (catAgg.get(e.categoryId) || ZERO).plus(e.amount));
  }
  const expenseByCategory: CategoryExpenseRow[] = Array.from(catAgg.entries())
    .map(([categoryId, amount]) => {
      const c = catLookup.get(categoryId);
      return {
        categoryId,
        name: c?.name || 'Uncategorized',
        banglaName: c?.banglaName || null,
        code: c?.code || null,
        amount: num(amount),
        percentage: totalExpenses.greaterThan(0)
          ? amount.div(totalExpenses).times(100).toDecimalPlaces(1).toNumber()
          : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Expense Breakdown: By Branch
  const branchExpMap = new Map(scope.branches.map((b) => [b.id, { name: b.name, bn: b.banglaName, total: ZERO, cash: ZERO }]));
  for (const e of expensesRaw) {
    if (branchExpMap.has(e.branchId)) {
      const b = branchExpMap.get(e.branchId)!;
      b.total = b.total.plus(e.amount);
      if (e.method === 'CASH') {
        b.cash = b.cash.plus(e.amount);
      }
    }
  }
  const expenseByBranch: BranchExpenseRow[] = Array.from(branchExpMap.entries()).map(([branchId, b]) => ({
    branchId,
    branchName: b.name,
    branchBanglaName: b.bn,
    amount: num(b.total),
    cashAmount: num(b.cash),
    nonCashAmount: num(b.total.minus(b.cash)),
  }));

  // Expense Breakdown: By Payment Method
  const methodExpMap = new Map<string, Dec>(PAYMENT_METHODS.map((m) => [m, ZERO]));
  for (const e of expensesRaw) {
    methodExpMap.set(e.method, (methodExpMap.get(e.method) || ZERO).plus(e.amount));
  }
  const expenseByMethod: MethodExpenseRow[] = PAYMENT_METHODS.map((m) => {
    const amount = methodExpMap.get(m)!;
    return {
      method: m,
      amount: num(amount),
      percentage: totalExpenses.greaterThan(0)
        ? amount.div(totalExpenses).times(100).toDecimalPlaces(1).toNumber()
        : null,
    };
  });

  // Profit Trend
  const granularity: Granularity = range.days > MAX_DAILY_BUCKET_DAYS ? 'month' : 'day';
  const keys = enumerateBuckets(range, granularity);
  const acc = new Map(keys.map((k) => [k, { gross: ZERO, refunds: ZERO, expenses: ZERO }]));

  for (const p of paymentsRaw) {
    const k = bucketKey(p.day, granularity);
    const slot = acc.get(k);
    if (slot) slot.gross = slot.gross.plus(p.amount);
  }
  for (const r of refundsRaw) {
    const k = bucketKey(r.day, granularity);
    const slot = acc.get(k);
    if (slot) slot.refunds = slot.refunds.plus(r.amount);
  }
  for (const e of expensesRaw) {
    const k = bucketKey(e.day, granularity);
    const slot = acc.get(k);
    if (slot) slot.expenses = slot.expenses.plus(e.amount);
  }

  const profitTrend: ProfitTrendRow[] = keys.map((bucket) => {
    const s = acc.get(bucket)!;
    const netCol = s.gross.minus(s.refunds);
    const p = netCol.minus(s.expenses);
    return {
      bucket,
      gross: num(s.gross),
      refunds: num(s.refunds),
      netCollection: num(netCol),
      expenses: num(s.expenses),
      netProfit: num(p),
      margin: netCol.greaterThan(0) ? p.div(netCol).times(100).toDecimalPlaces(1).toNumber() : null,
    };
  });

  // Cash Summary: Cash Sessions in period
  const sessionWhere: Prisma.CashSessionWhereInput = {
    coachingCenterId: cc,
    businessDate: { gte: range.dateFrom, lte: range.dateTo },
    ...(scope.branchId ? { branchId: scope.branchId } : scope.branchLocked ? { branchId: { in: scope.branches.map((b) => b.id) } } : {}),
  };
  const sessions = await prisma.cashSession.findMany({
    where: sessionWhere,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      branch: { select: { id: true, name: true, banglaName: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });

  const sessionRows: CashSessionRow[] = await Promise.all(
    sessions.map(async (s) => {
      const open = s.status === 'OPEN';
      const expected = open
        ? await computeExpectedCash(cc, s.branchId, s.businessDate, s.openingCash)
        : s.expectedCash == null
          ? null
          : Number(s.expectedCash);
      const counted = s.countedCash == null ? null : Number(s.countedCash);
      const diff = open
        ? null
        : s.difference != null
          ? Number(s.difference)
          : counted != null && expected != null
            ? Math.round((counted - expected) * 100) / 100
            : null;

      return {
        id: s.id,
        businessDate: s.businessDate.toISOString().slice(0, 10),
        branchId: s.branchId,
        branchName: s.branch.name,
        branchBanglaName: s.branch.banglaName,
        status: s.status as 'OPEN' | 'CLOSED',
        openingCash: Number(s.openingCash),
        expectedCash: expected,
        countedCash: counted,
        difference: diff,
        note: s.note,
        openedByName: s.openedBy?.name || null,
        closedByName: s.closedBy?.name || null,
        closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      };
    })
  );

  const cashMethodRow = incomeByMethod.find((m) => m.method === 'CASH') || { gross: 0, refunds: 0, net: 0 };
  const cashIn = cashMethodRow.gross;
  const cashOut = cashMethodRow.refunds + num(cashExpenses);
  const openingCashTotal = sessionRows.reduce((acc, s) => acc + s.openingCash, 0);
  const expectedCashTotal = sessionRows.reduce((acc, s) => acc + (s.expectedCash ?? 0), 0);
  const countedCashTotal = sessionRows.reduce((acc, s) => acc + (s.countedCash ?? 0), 0);
  const differenceTotal = sessionRows.reduce((acc, s) => acc + (s.difference ?? 0), 0);

  // Optional previous-period comparison
  let comparison = null;
  if (params.comparison) {
    const prev = previousRange(range);
    const prevParams: FinanceReportParams = { ...params, from: prev.from, to: prev.to, comparison: false };
    const prevData = await getFinanceReports(scope, prevParams);
    const line = (cur: number, p: number) => {
      const changePct = p === 0 ? null : Math.round(((cur - p) / Math.abs(p)) * 1000) / 10;
      return { current: cur, previous: p, changePct };
    };
    comparison = {
      period: { from: prev.from, to: prev.to },
      hasPrevious: !(prevData.summary.netCollection === 0 && prevData.summary.totalExpenses === 0),
      netCollection: line(num(totalNetCollection), prevData.summary.netCollection),
      expenses: line(num(totalExpenses), prevData.summary.totalExpenses),
      netProfit: line(num(netProfit), prevData.summary.netProfit),
    };
  }

  return {
    period: { from: range.from, to: range.to, days: range.days, granularity },
    branch: { id: scope.branchId ?? null, locked: scope.branchLocked, options: scope.branches },
    summary: {
      grossCollection: num(totalGross),
      refunds: num(totalRefunds),
      netCollection: num(totalNetCollection),
      totalExpenses: num(totalExpenses),
      cashExpenses: num(cashExpenses),
      nonCashExpenses: num(nonCashExpenses),
      netProfit: num(netProfit),
      netMargin,
      salaryExpenses: num(totalSalaryExpenses),
      salaryExpensesCount: totalSalaryCount,
    },
    income: {
      byDate: incomeByDate,
      byBranch: incomeByBranch,
      byMethod: incomeByMethod,
    },
    expenses: {
      byCategory: expenseByCategory,
      byBranch: expenseByBranch,
      byMethod: expenseByMethod,
    },
    profit: {
      trend: profitTrend,
    },
    cash: {
      openingCashTotal,
      cashIn,
      cashOut,
      expectedCashTotal,
      countedCashTotal,
      differenceTotal,
      sessions: sessionRows,
    },
    comparison,
  };
}
