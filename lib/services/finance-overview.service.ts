import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { isBranchScoped, resolveEffectiveBranchId, type SessionUser } from '@/lib/auth/session';
import { toDateOnly } from '@/lib/schedule';
import { computeExpectedCash } from './cash-session.service';
import {
  MAX_DAILY_BUCKET_DAYS,
  bucketKey,
  buildDhakaRange,
  enumerateBuckets,
  previousRange,
  todayDhaka,
  type DhakaRange,
  type Granularity,
} from '@/lib/reports/dates';
import { dhakaDateOf, sqlAnd } from '@/lib/reports/sql';

/**
 * Phase 15.2 — the ONE place the Owner Finance Overview numbers are calculated.
 * The API route and the UI only format what this returns.
 *
 *   Gross collection = Σ Payment.amount      (status ≠ VOIDED, by paymentDate)
 *   Refunds          = Σ PaymentRefund.amount (by refundDate, payment not VOIDED)
 *   Net collection   = Gross − Refunds
 *   Expenses         = Σ Expense.amount       (status = ACTIVE, by Expense.date)
 *   Net profit       = Net collection − Expenses            (CASH BASIS)
 *
 * Salary: SalaryPayment is NEVER summed here. Every salary payment already owns
 * exactly one Expense row (SalaryPayment.expenseId), so salary is counted once,
 * through Expense.
 *
 * Refund method: PaymentRefund has no method of its own. A refund is attributed
 * to the ORIGINAL payment's method and branch (same assumption as the cash
 * session). Do not invent a refund-method model here.
 *
 * Every figure below is folded from the same three aggregate result sets with
 * Prisma.Decimal, so the invariants (method totals = net, category totals =
 * expenses, trend totals = headline totals) hold exactly, not approximately.
 * All date boundaries are Asia/Dhaka (lib/reports/dates.ts).
 */

type Dec = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const sum = (xs: Dec[]): Dec => xs.reduce((a, b) => a.plus(b), ZERO);
/** Decimal → JSON number at 2dp (max 10 digits, so exact in a double). */
const num = (d: Dec): number => d.toDecimalPlaces(2).toNumber();

export const PAYMENT_METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER'] as const;
export type FinanceMethod = (typeof PAYMENT_METHODS)[number];

export interface FinanceScope {
  coachingCenterId: string;
  /** undefined = every branch the caller may see (center-wide caller only). */
  branchId?: string;
  branches: Array<{ id: string; name: string; banglaName: string | null }>;
  branchLocked: boolean;
}

/**
 * Server-side branch resolution. A branch-locked ADMIN/STAFF is pinned to their
 * own branch whatever the client sent; a requested branch must belong to the tenant.
 */
export async function resolveFinanceScope(coachingCenterId: string, user: SessionUser, requestedBranchId?: string | null): Promise<FinanceScope> {
  const requested = requestedBranchId && requestedBranchId !== 'all' ? requestedBranchId : undefined;
  const effective = resolveEffectiveBranchId(user, requested);
  const branchLocked = isBranchScoped(user);
  const branches = await prisma.branch.findMany({
    where: { coachingCenterId, ...(branchLocked ? { id: user.branchId! } : {}) },
    select: { id: true, name: true, banglaName: true },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
  });
  if (effective && !branches.some((b) => b.id === effective)) throw new Error('BRANCH_NOT_FOUND: branch does not belong to this centre');
  return { coachingCenterId, branchId: effective, branches, branchLocked };
}

interface PeriodRows {
  payments: Array<{ day: string; method: string; amount: Dec }>;
  refunds: Array<{ day: string; method: string; amount: Dec }>;
  expenses: Array<{ day: string; method: string; amount: Dec }>;
}

/** Three aggregate queries — never row-by-row, never one query per chart point. */
async function loadPeriod(cc: string, range: DhakaRange, branchId?: string): Promise<PeriodRows> {
  const payBranch = branchId ? [Prisma.sql`p."branchId" = ${branchId}`] : [];
  const expBranch = branchId ? [Prisma.sql`e."branchId" = ${branchId}`] : [];
  const [payments, refunds, expenses] = await Promise.all([
    prisma.$queryRaw<PeriodRows['payments']>`
      SELECT ${dhakaDateOf(Prisma.sql`p."paymentDate"`)} AS day, p."paymentMethod"::text AS method, SUM(p."amount") AS amount
      FROM "payments" p
      WHERE ${sqlAnd([
        Prisma.sql`p."coachingCenterId" = ${cc}`,
        Prisma.sql`p."status"::text <> 'VOIDED'`,
        Prisma.sql`p."paymentDate" >= ${range.start}`,
        Prisma.sql`p."paymentDate" < ${range.endExclusive}`,
        ...payBranch,
      ])}
      GROUP BY 1, 2`,
    prisma.$queryRaw<PeriodRows['refunds']>`
      SELECT ${dhakaDateOf(Prisma.sql`r."refundDate"`)} AS day, p."paymentMethod"::text AS method, SUM(r."amount") AS amount
      FROM "payment_refunds" r
      JOIN "payments" p ON p."id" = r."paymentId"
      WHERE ${sqlAnd([
        Prisma.sql`r."coachingCenterId" = ${cc}`,
        Prisma.sql`p."status"::text <> 'VOIDED'`,
        Prisma.sql`r."refundDate" >= ${range.start}`,
        Prisma.sql`r."refundDate" < ${range.endExclusive}`,
        ...payBranch,
      ])}
      GROUP BY 1, 2`,
    prisma.$queryRaw<PeriodRows['expenses']>`
      SELECT to_char(e."date", 'YYYY-MM-DD') AS day, e."paymentMethod"::text AS method, SUM(e."amount") AS amount
      FROM "expenses" e
      WHERE ${sqlAnd([
        Prisma.sql`e."coachingCenterId" = ${cc}`,
        Prisma.sql`e."status" = 'ACTIVE'`,
        Prisma.sql`e."date" >= ${range.dateFrom}`,
        Prisma.sql`e."date" <= ${range.dateTo}`,
        ...expBranch,
      ])}
      GROUP BY 1, 2`,
  ]);
  return { payments, refunds, expenses };
}

export interface Totals {
  gross: Dec;
  refunds: Dec;
  net: Dec;
  expenses: Dec;
  netProfit: Dec;
}

export function totalsOf(rows: PeriodRows): Totals {
  const gross = sum(rows.payments.map((r) => r.amount));
  const refunds = sum(rows.refunds.map((r) => r.amount));
  const expenses = sum(rows.expenses.map((r) => r.amount));
  const net = gross.minus(refunds);
  return { gross, refunds, net, expenses, netProfit: net.minus(expenses) };
}

/** Net margin (%) — only defined when net collection > 0 (never divides by zero). */
export function marginOf(netProfit: Dec, net: Dec): number | null {
  return net.greaterThan(0) ? netProfit.div(net).times(100).toDecimalPlaces(1).toNumber() : null;
}

/** % change vs the previous period — null when the previous value is 0 (no infinity). */
export function changePct(current: Dec, previous: Dec): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).div(previous.abs()).times(100).toDecimalPlaces(1).toNumber();
}

export interface OverviewParams {
  from: string;
  to: string;
  comparison?: boolean;
}

export async function getFinanceOverview(scope: FinanceScope, params: OverviewParams) {
  const cc = scope.coachingCenterId;
  const range = buildDhakaRange(params.from, params.to);
  const rows = await loadPeriod(cc, range, scope.branchId);
  const t = totalsOf(rows);

  // ---- Payment-method breakdown: net per method; Σ methods === net collection ----
  const methods = PAYMENT_METHODS.map((m) => {
    const gross = sum(rows.payments.filter((r) => r.method === m).map((r) => r.amount));
    const refunds = sum(rows.refunds.filter((r) => r.method === m).map((r) => r.amount));
    return { method: m, gross, refunds, net: gross.minus(refunds) };
  });

  // ---- Trend: day buckets up to 93 days, otherwise month buckets ----
  const granularity: Granularity = range.days > MAX_DAILY_BUCKET_DAYS ? 'month' : 'day';
  const keys = enumerateBuckets(range, granularity);
  const acc = new Map(keys.map((k) => [k, { gross: ZERO, refunds: ZERO, expenses: ZERO }]));
  const fold = (list: PeriodRows['payments'], field: 'gross' | 'refunds' | 'expenses') => {
    for (const r of list) {
      const slot = acc.get(bucketKey(r.day, granularity));
      if (slot) slot[field] = slot[field].plus(r.amount);
    }
  };
  fold(rows.payments, 'gross');
  fold(rows.refunds, 'refunds');
  fold(rows.expenses, 'expenses');
  const trend = keys.map((bucket) => {
    const s = acc.get(bucket)!;
    const income = s.gross.minus(s.refunds);
    return { bucket, gross: num(s.gross), refunds: num(s.refunds), income: num(income), expenses: num(s.expenses), profit: num(income.minus(s.expenses)) };
  });

  // ---- Expense categories: real ExpenseCategory rows, ACTIVE only, same scope ----
  const grouped = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      coachingCenterId: cc,
      status: 'ACTIVE',
      date: { gte: range.dateFrom, lte: range.dateTo },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
    _sum: { amount: true },
  });
  const cats = await prisma.expenseCategory.findMany({
    where: { coachingCenterId: cc, id: { in: grouped.map((g) => g.categoryId) } },
    select: { id: true, name: true, banglaName: true, code: true },
  });
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const expenseCategories = grouped
    .map((g) => {
      const c = catMap.get(g.categoryId);
      const amount = new Prisma.Decimal(g._sum.amount ?? 0);
      return {
        categoryId: g.categoryId,
        name: c?.name ?? '—',
        banglaName: c?.banglaName ?? null,
        code: c?.code ?? null,
        amount,
      };
    })
    .sort((a, b) => b.amount.comparedTo(a.amount))
    .map((c) => ({
      ...c,
      amount: num(c.amount),
      percent: t.expenses.greaterThan(0) ? c.amount.div(t.expenses).times(100).toDecimalPlaces(1).toNumber() : null,
    }));

  // ---- Top expenses: salary-linked rows are labelled, teacher identity not exposed ----
  const top = await prisma.expense.findMany({
    where: {
      coachingCenterId: cc,
      status: 'ACTIVE',
      date: { gte: range.dateFrom, lte: range.dateTo },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
    orderBy: [{ amount: 'desc' }, { date: 'desc' }],
    take: 10,
    select: {
      id: true,
      date: true,
      amount: true,
      paymentMethod: true,
      paidTo: true,
      status: true,
      category: { select: { name: true, banglaName: true, code: true } },
      branch: { select: { name: true, banglaName: true } },
      salaryPayment: { select: { id: true } },
    },
  });
  const topExpenses = top.map((e) => {
    const isSalary = Boolean(e.salaryPayment);
    return {
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      categoryName: e.category.name,
      categoryBanglaName: e.category.banglaName,
      paidTo: isSalary ? null : e.paidTo,
      paymentMethod: e.paymentMethod,
      amount: num(new Prisma.Decimal(e.amount)),
      status: e.status,
      isSalary, // read-only in the finance workflow
      branchName: e.branch.name,
      branchBanglaName: e.branch.banglaName,
    };
  });

  // ---- Cash position: today's Dhaka session(s) via the existing CashSession logic ----
  const cashGross = methods.find((m) => m.method === 'CASH')!;
  const cashExpenses = sum(rows.expenses.filter((r) => r.method === 'CASH').map((r) => r.amount));
  const today = todayDhaka();
  const sessions = await prisma.cashSession.findMany({
    where: { coachingCenterId: cc, businessDate: toDateOnly(today), ...(scope.branchId ? { branchId: scope.branchId } : scope.branchLocked ? { branchId: { in: scope.branches.map((b) => b.id) } } : {}) },
    include: { branch: { select: { name: true, banglaName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const cashSessions = await Promise.all(
    sessions.map(async (s) => {
      const open = s.status === 'OPEN';
      // OPEN: live figure from the existing formula. CLOSED: the stored snapshot (never recomputed).
      const expected = open ? await computeExpectedCash(cc, s.branchId, s.businessDate, s.openingCash) : s.expectedCash == null ? null : Number(s.expectedCash);
      return {
        id: s.id,
        branchId: s.branchId,
        branchName: s.branch.name,
        branchBanglaName: s.branch.banglaName,
        status: s.status as 'OPEN' | 'CLOSED',
        openingCash: Number(s.openingCash),
        expectedCash: expected,
        countedCash: s.countedCash == null ? null : Number(s.countedCash),
      };
    })
  );

  // ---- Optional previous-period comparison (equal-length period immediately before) ----
  let comparison: null | {
    period: { from: string; to: string };
    hasPrevious: boolean;
    netCollection: { current: number; previous: number; changePct: number | null };
    expenses: { current: number; previous: number; changePct: number | null };
    netProfit: { current: number; previous: number; changePct: number | null };
  } = null;
  if (params.comparison) {
    const prev = previousRange(range);
    const pt = totalsOf(await loadPeriod(cc, prev, scope.branchId));
    const line = (cur: Dec, p: Dec) => ({ current: num(cur), previous: num(p), changePct: changePct(cur, p) });
    comparison = {
      period: { from: prev.from, to: prev.to },
      hasPrevious: !(pt.net.isZero() && pt.expenses.isZero()),
      netCollection: line(t.net, pt.net),
      expenses: line(t.expenses, pt.expenses),
      netProfit: line(t.netProfit, pt.netProfit),
    };
  }

  return {
    period: { from: range.from, to: range.to, days: range.days, granularity },
    branch: { id: scope.branchId ?? null, locked: scope.branchLocked, options: scope.branches },
    collection: { gross: num(t.gross), refunds: num(t.refunds), net: num(t.net) },
    expenses: { total: num(t.expenses) },
    profit: { netProfit: num(t.netProfit), margin: marginOf(t.netProfit, t.net) },
    paymentMethods: methods.map((m) => ({ method: m.method, gross: num(m.gross), refunds: num(m.refunds), net: num(m.net) })),
    expenseCategories,
    topExpenses,
    trend,
    cash: {
      movement: { collected: num(cashGross.gross), refunded: num(cashGross.refunds), expenses: num(cashExpenses), net: num(cashGross.net.minus(cashExpenses)) },
      today,
      sessions: cashSessions,
    },
    comparison,
  };
}
