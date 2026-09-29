import prisma from '@/lib/db';
import { Prisma, type PaymentMethod } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { computeDisplayStatus, syncOverdueStatuses } from '@/lib/services/invoice.service';
import { canCompareBranches, type ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { bucketKey, enumerateBuckets, MAX_DAILY_BUCKET_DAYS } from './dates';
import { dhakaDateOf, sqlAnd } from './sql';
import { int, money, moneySub, pickName, resolveRange, type ViewHandler } from './report-utils';

/**
 * Financial reports read Phase 5's persisted financial truth — they never
 * recompute an invoice:
 *
 *   invoiced   = SUM(FeeInvoice.totalAmount)      by invoiceDate, excl. DRAFT/CANCELLED
 *   discounts  = SUM(FeeDiscount.amount)          by FeeDiscount.createdAt (type DISCOUNT / WAIVER)
 *   collected  = SUM(Payment.amount)              by paymentDate, excl. VOIDED (same as getCollectionReport)
 *   refunded   = SUM(PaymentRefund.amount)        by refundDate
 *   due        = SUM(FeeInvoice.dueAmount)        ISSUED/PARTIAL/OVERDUE — a point-in-time snapshot (now)
 *   overdue    = due where dueDate < now          (same predicate as getFeeDashboard / syncOverdueStatuses)
 *
 * FeeInvoice.paidAmount/dueAmount are maintained transactionally by
 * payment.service (payments increment, refunds decrement), so they are
 * already net of refunds. All sums are computed by PostgreSQL and carried as
 * exact decimal strings.
 */

const OPEN_INVOICE: Array<'ISSUED' | 'PARTIAL' | 'OVERDUE'> = ['ISSUED', 'PARTIAL', 'OVERDUE'];
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER'];

function branchOf(scope: ReportScope) {
  return scope.branchId ? { branchId: scope.branchId } : {};
}

/** Optional student-level narrowing shared by every finance query. */
function studentNarrowing(scope: ReportScope, filters: ReportFilters): Prisma.StudentWhereInput | undefined {
  const and: Prisma.StudentWhereInput[] = [];
  if (filters.batchId) and.push({ studentBatches: { some: { batchId: filters.batchId, status: 'ACTIVE' } } });
  if (filters.academicSessionId || filters.programId || filters.classId || filters.groupId) {
    and.push({
      enrollments: {
        some: {
          ...(filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {}),
          ...(filters.programId ? { academicProgramId: filters.programId } : {}),
          ...(filters.classId ? { academicClassId: filters.classId } : {}),
          ...(filters.groupId ? { academicGroupId: filters.groupId } : {}),
        },
      },
    });
  }
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { studentIdCode: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  return and.length ? { AND: and } : undefined;
}

function invoiceWhere(scope: ReportScope, filters: ReportFilters): Prisma.FeeInvoiceWhereInput {
  const student = studentNarrowing(scope, filters);
  return { coachingCenterId: scope.coachingCenterId, ...branchOf(scope), ...(student ? { student } : {}) };
}

function paymentWhere(scope: ReportScope, filters: ReportFilters): Prisma.PaymentWhereInput {
  const student = studentNarrowing(scope, filters);
  return {
    coachingCenterId: scope.coachingCenterId,
    ...branchOf(scope),
    ...(filters.method ? { paymentMethod: filters.method as PaymentMethod } : {}),
    ...(student ? { student } : {}),
  };
}

function refundWhere(scope: ReportScope, filters: ReportFilters): Prisma.PaymentRefundWhereInput {
  const student = studentNarrowing(scope, filters);
  const payment: Prisma.PaymentWhereInput = {
    ...branchOf(scope),
    ...(filters.method ? { paymentMethod: filters.method as PaymentMethod } : {}),
    ...(student ? { student } : {}),
  };
  return { coachingCenterId: scope.coachingCenterId, ...(Object.keys(payment).length ? { payment } : {}) };
}

function discountWhere(scope: ReportScope, filters: ReportFilters): Prisma.FeeDiscountWhereInput {
  const and: Prisma.FeeDiscountWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  const student = studentNarrowing(scope, filters);
  if (scope.branchId || student) {
    const inv: Prisma.FeeInvoiceWhereInput = { ...branchOf(scope), ...(student ? { student } : {}) };
    const asg: Prisma.StudentFeeAssignmentWhereInput = { ...branchOf(scope), ...(student ? { student } : {}) };
    and.push({ OR: [{ feeInvoice: inv }, { feeInvoiceId: null, studentFeeAssignment: asg }] });
  }
  if (filters.adjustmentType) and.push({ type: filters.adjustmentType });
  return { AND: and };
}

// ------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------

export async function financeTotals(scope: ReportScope, filters: ReportFilters) {
  const range = resolveRange(filters);
  const now = new Date();
  const [invoiced, discounts, collected, refunded, due, overdue] = await Promise.all([
    prisma.feeInvoice.aggregate({
      where: { ...invoiceWhere(scope, filters), status: { notIn: ['DRAFT', 'CANCELLED'] }, invoiceDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { totalAmount: true, subtotalAmount: true },
      _count: { _all: true },
    }),
    prisma.feeDiscount.groupBy({
      by: ['type'],
      where: { AND: [discountWhere(scope, { ...filters, adjustmentType: undefined }), { createdAt: { gte: range.start, lt: range.endExclusive } }] },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { ...paymentWhere(scope, filters), status: { not: 'VOIDED' }, paymentDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentRefund.aggregate({
      where: { ...refundWhere(scope, filters), refundDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.aggregate({
      where: { ...invoiceWhere(scope, filters), status: { in: OPEN_INVOICE }, dueAmount: { gt: 0 } },
      _sum: { dueAmount: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.aggregate({
      where: { ...invoiceWhere(scope, filters), status: { in: OPEN_INVOICE }, dueAmount: { gt: 0 }, dueDate: { lt: now } },
      _sum: { dueAmount: true },
      _count: { _all: true },
    }),
  ]);
  const disc = discounts.find((d) => d.type === 'DISCOUNT');
  const waiv = discounts.find((d) => d.type === 'WAIVER');
  return {
    range: { from: range.from, to: range.to },
    asOf: now.toISOString(),
    invoiced: money(invoiced._sum.totalAmount),
    invoiceCount: invoiced._count._all,
    discounts: money(disc?._sum.amount),
    discountCount: disc?._count._all ?? 0,
    waivers: money(waiv?._sum.amount),
    waiverCount: waiv?._count._all ?? 0,
    collected: money(collected._sum.amount),
    paymentCount: collected._count._all,
    refunded: money(refunded._sum.amount),
    refundCount: refunded._count._all,
    netCollected: moneySub(collected._sum.amount, refunded._sum.amount),
    due: money(due._sum.dueAmount),
    dueInvoiceCount: due._count._all,
    overdue: money(overdue._sum.dueAmount),
    overdueInvoiceCount: overdue._count._all,
  };
}

export const financeSummary: ViewHandler = async ({ scope, filters }) => ({ data: { totals: await financeTotals(scope, filters) } });

// ------------------------------------------------------------------
// Trend (invoice date / payment date / refund date — kept as separate series)
// ------------------------------------------------------------------

function paymentSqlWhere(scope: ReportScope, filters: ReportFilters, alias: Prisma.Sql): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  if (scope.branchId) parts.push(Prisma.sql`${alias}."branchId" = ${scope.branchId}`);
  if (filters.batchId) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "student_batches" sb WHERE sb."studentId" = ${alias}."studentId" AND sb."batchId" = ${filters.batchId} AND sb."status" = 'ACTIVE')`);
  }
  if (filters.academicSessionId || filters.programId || filters.classId || filters.groupId) {
    const e: Prisma.Sql[] = [Prisma.sql`e."studentId" = ${alias}."studentId"`];
    if (filters.academicSessionId) e.push(Prisma.sql`e."academicSessionId" = ${filters.academicSessionId}`);
    if (filters.programId) e.push(Prisma.sql`e."academicProgramId" = ${filters.programId}`);
    if (filters.classId) e.push(Prisma.sql`e."academicClassId" = ${filters.classId}`);
    if (filters.groupId) e.push(Prisma.sql`e."academicGroupId" = ${filters.groupId}`);
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "student_enrollments" e WHERE ${sqlAnd(e)})`);
  }
  return parts;
}

export const financeTrend: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const granularity = filters.granularity === 'day' && range.days > MAX_DAILY_BUCKET_DAYS ? 'month' : filters.granularity;
  const cc = scope.coachingCenterId;
  const inv = Prisma.sql`i`;
  const pay = Prisma.sql`p`;
  const methodSql = filters.method ? [Prisma.sql`p."paymentMethod"::text = ${filters.method}`] : [];

  const [invoices, payments, refunds] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; amount: Prisma.Decimal; n: bigint }>>`
      SELECT ${dhakaDateOf(Prisma.sql`i."invoiceDate"`)} AS day, SUM(i."totalAmount") AS amount, COUNT(*) AS n
      FROM "fee_invoices" i
      WHERE ${sqlAnd([
        Prisma.sql`i."coachingCenterId" = ${cc}`,
        Prisma.sql`i."status"::text NOT IN ('DRAFT', 'CANCELLED')`,
        Prisma.sql`i."invoiceDate" >= ${range.start}`,
        Prisma.sql`i."invoiceDate" < ${range.endExclusive}`,
        ...paymentSqlWhere(scope, filters, inv),
      ])}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: string; amount: Prisma.Decimal; n: bigint }>>`
      SELECT ${dhakaDateOf(Prisma.sql`p."paymentDate"`)} AS day, SUM(p."amount") AS amount, COUNT(*) AS n
      FROM "payments" p
      WHERE ${sqlAnd([
        Prisma.sql`p."coachingCenterId" = ${cc}`,
        Prisma.sql`p."status"::text <> 'VOIDED'`,
        Prisma.sql`p."paymentDate" >= ${range.start}`,
        Prisma.sql`p."paymentDate" < ${range.endExclusive}`,
        ...methodSql,
        ...paymentSqlWhere(scope, filters, pay),
      ])}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: string; amount: Prisma.Decimal; n: bigint }>>`
      SELECT ${dhakaDateOf(Prisma.sql`r."refundDate"`)} AS day, SUM(r."amount") AS amount, COUNT(*) AS n
      FROM "payment_refunds" r JOIN "payments" p ON p."id" = r."paymentId"
      WHERE ${sqlAnd([
        Prisma.sql`r."coachingCenterId" = ${cc}`,
        Prisma.sql`r."refundDate" >= ${range.start}`,
        Prisma.sql`r."refundDate" < ${range.endExclusive}`,
        ...methodSql,
        ...paymentSqlWhere(scope, filters, pay),
      ])}
      GROUP BY 1`,
  ]);

  const buckets = enumerateBuckets(range, granularity);
  const fold = (rows: Array<{ day: string; amount: Prisma.Decimal; n: bigint }>) => {
    const m = new Map<string, { amount: Prisma.Decimal; count: number }>();
    for (const r of rows) {
      const k = bucketKey(r.day, granularity);
      const cur = m.get(k) || { amount: new Prisma.Decimal(0), count: 0 };
      cur.amount = cur.amount.plus(r.amount);
      cur.count += int(r.n);
      m.set(k, cur);
    }
    return m;
  };
  const im = fold(invoices);
  const pm = fold(payments);
  const rm = fold(refunds);
  const rows = buckets.map((b) => ({
    bucket: b,
    invoiced: money(im.get(b)?.amount),
    invoiceCount: im.get(b)?.count ?? 0,
    collected: money(pm.get(b)?.amount),
    paymentCount: pm.get(b)?.count ?? 0,
    refunded: money(rm.get(b)?.amount),
    refundCount: rm.get(b)?.count ?? 0,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { range: { from: range.from, to: range.to }, granularity, rows, hasData: invoices.length + payments.length + refunds.length > 0 },
    export: {
      rows,
      columns: [
        { header: R.col.period, value: (r: Row) => r.bucket },
        { header: `${R.col.invoiced} (BDT)`, value: (r: Row) => r.invoiced },
        { header: R.col.invoices, value: (r: Row) => r.invoiceCount },
        { header: `${R.col.collected} (BDT)`, value: (r: Row) => r.collected },
        { header: R.col.payments, value: (r: Row) => r.paymentCount },
        { header: `${R.col.refunded} (BDT)`, value: (r: Row) => r.refunded },
        { header: R.col.refunds, value: (r: Row) => r.refundCount },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Payment methods
// ------------------------------------------------------------------

export const financeMethods: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const grouped = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: { ...paymentWhere(scope, { ...filters, method: undefined }), status: { not: 'VOIDED' }, paymentDate: { gte: range.start, lt: range.endExclusive } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const rows = PAYMENT_METHODS.map((m) => {
    const g = grouped.find((x) => x.paymentMethod === m);
    return { method: m, count: g?._count._all ?? 0, amount: money(g?._sum.amount) };
  });
  const total = grouped.reduce((s, g) => s.plus(g._sum.amount ?? 0), new Prisma.Decimal(0));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { range: { from: range.from, to: range.to }, rows, total: money(total), count: grouped.reduce((s, g) => s + g._count._all, 0) },
    export: {
      rows,
      columns: [
        { header: R.col.method, value: (r: Row) => (DICTIONARY[lang].paymentMethod as Record<string, string>)[r.method] ?? r.method },
        { header: R.col.payments, value: (r: Row) => r.count },
        { header: `${R.col.amount} (BDT)`, value: (r: Row) => r.amount },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Due / overdue
// ------------------------------------------------------------------

const DUE_SORT: Record<string, Prisma.FeeInvoiceOrderByWithRelationInput> = {
  dueDate: { dueDate: 'asc' },
  dueAmount: { dueAmount: 'asc' },
  totalAmount: { totalAmount: 'asc' },
  invoiceNumber: { invoiceNumber: 'asc' },
};

export const financeDue: ViewHandler = async ({ scope, filters, forExport }) => {
  const now = new Date();
  const where: Prisma.FeeInvoiceWhereInput = {
    ...invoiceWhere(scope, filters),
    status: { in: OPEN_INVOICE },
    dueAmount: { gt: 0 },
    ...(filters.overdueOnly === 'true' ? { dueDate: { lt: now } } : {}),
  };
  const sortKey = filters.sort && DUE_SORT[filters.sort] ? filters.sort : 'dueDate';
  const orderBy = { [sortKey]: filters.dir || 'asc' } as Prisma.FeeInvoiceOrderByWithRelationInput;

  const [total, agg] = await Promise.all([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.aggregate({ where, _sum: { totalAmount: true, paidAmount: true, dueAmount: true } }),
  ]);
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');

  const invoices = await prisma.feeInvoice.findMany({
    where,
    orderBy: [orderBy, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      dueAmount: true,
      status: true,
      student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } },
      branch: { select: { name: true, banglaName: true } },
    },
  });
  // Existing Phase 5 lazy reconciliation — same call the invoice list makes on read.
  await syncOverdueStatuses(scope.coachingCenterId, invoices.map((i) => i.id));

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    total: money(inv.totalAmount),
    paid: money(inv.paidAmount),
    due: money(inv.dueAmount),
    status: computeDisplayStatus(inv.status, inv.dueDate, Number(inv.dueAmount)),
    student: inv.student,
    branch: inv.branch,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      asOf: now.toISOString(),
      totals: { total: money(agg._sum.totalAmount), paid: money(agg._sum.paidAmount), due: money(agg._sum.dueAmount) },
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.studentId, value: (r: Row) => r.student.studentIdCode },
        { header: R.col.name, value: (r: Row) => pickName(lang, r.student.name, r.student.banglaName) },
        { header: R.col.invoice, value: (r: Row) => r.invoiceNumber },
        { header: R.col.dueDate, value: (r: Row) => (r.dueDate ? r.dueDate.slice(0, 10) : '') },
        { header: `${R.col.originalAmount} (BDT)`, value: (r: Row) => r.total },
        { header: `${R.col.paid} (BDT)`, value: (r: Row) => r.paid },
        { header: `${R.col.due} (BDT)`, value: (r: Row) => r.due },
        { header: R.col.status, value: (r: Row) => r.status },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Discounts / waivers (persisted FeeDiscount rows only)
// ------------------------------------------------------------------

export const financeDiscounts: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const where: Prisma.FeeDiscountWhereInput = { AND: [discountWhere(scope, filters), { createdAt: { gte: range.start, lt: range.endExclusive } }] };
  const [total, agg] = await Promise.all([prisma.feeDiscount.count({ where }), prisma.feeDiscount.aggregate({ where, _sum: { amount: true } })]);
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const dir = filters.dir || 'desc';
  const orderBy: Prisma.FeeDiscountOrderByWithRelationInput = filters.sort === 'amount' ? { amount: dir } : { createdAt: dir };
  const items = await prisma.feeDiscount.findMany({
    where,
    orderBy: [orderBy, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      type: true,
      amount: true,
      reason: true,
      createdAt: true,
      feeInvoice: { select: { id: true, invoiceNumber: true, student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } } } },
      studentFeeAssignment: { select: { name: true, student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } } } },
    },
  });
  const rows = items.map((d) => ({
    id: d.id,
    type: d.type,
    amount: money(d.amount),
    reason: d.reason,
    date: d.createdAt.toISOString(),
    invoice: d.feeInvoice ? { id: d.feeInvoice.id, invoiceNumber: d.feeInvoice.invoiceNumber } : null,
    feeName: d.studentFeeAssignment?.name ?? null,
    student: d.feeInvoice?.student ?? d.studentFeeAssignment?.student ?? null,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      range: { from: range.from, to: range.to },
      totalAmount: money(agg._sum.amount),
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.date, value: (r: Row) => r.date.slice(0, 10) },
        { header: R.col.studentId, value: (r: Row) => r.student?.studentIdCode },
        { header: R.col.name, value: (r: Row) => pickName(lang, r.student?.name, r.student?.banglaName) },
        { header: R.col.invoice, value: (r: Row) => r.invoice?.invoiceNumber ?? r.feeName },
        { header: R.col.adjustmentType, value: (r: Row) => r.type },
        { header: `${R.col.amount} (BDT)`, value: (r: Row) => r.amount },
        { header: R.col.reason, value: (r: Row) => r.reason },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Refunds
// ------------------------------------------------------------------

export const financeRefunds: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const where: Prisma.PaymentRefundWhereInput = { ...refundWhere(scope, filters), refundDate: { gte: range.start, lt: range.endExclusive } };
  const [total, agg] = await Promise.all([prisma.paymentRefund.count({ where }), prisma.paymentRefund.aggregate({ where, _sum: { amount: true } })]);
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const dir = filters.dir || 'desc';
  const orderBy: Prisma.PaymentRefundOrderByWithRelationInput = filters.sort === 'amount' ? { amount: dir } : { refundDate: dir };
  const items = await prisma.paymentRefund.findMany({
    where,
    orderBy: [orderBy, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      amount: true,
      reason: true,
      refundDate: true,
      referenceNumber: true,
      payment: {
        select: {
          id: true,
          receiptNumber: true,
          paymentMethod: true,
          invoice: { select: { id: true, invoiceNumber: true } },
          student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } },
        },
      },
    },
  });
  const rows = items.map((r) => ({
    id: r.id,
    date: r.refundDate.toISOString(),
    amount: money(r.amount),
    reason: r.reason,
    referenceNumber: r.referenceNumber,
    method: r.payment.paymentMethod,
    payment: { id: r.payment.id, receiptNumber: r.payment.receiptNumber },
    invoice: r.payment.invoice,
    student: r.payment.student,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      range: { from: range.from, to: range.to },
      totalAmount: money(agg._sum.amount),
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.refundDate, value: (r: Row) => r.date.slice(0, 10) },
        { header: R.col.studentId, value: (r: Row) => r.student.studentIdCode },
        { header: R.col.name, value: (r: Row) => pickName(lang, r.student.name, r.student.banglaName) },
        { header: R.col.invoice, value: (r: Row) => r.invoice.invoiceNumber },
        { header: R.col.receipt, value: (r: Row) => r.payment.receiptNumber },
        { header: `${R.col.amount} (BDT)`, value: (r: Row) => r.amount },
        { header: R.col.reason, value: (r: Row) => r.reason },
        { header: R.col.method, value: (r: Row) => (DICTIONARY[lang].paymentMethod as Record<string, string>)[r.method] ?? r.method },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Collector summary — groupBy(collectedById, paymentMethod), folded into
// cash vs digital per collector, exactly like the brief's example table.
// ------------------------------------------------------------------

export const financeCollectors: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const grouped = await prisma.payment.groupBy({
    by: ['collectedById', 'paymentMethod'],
    where: { ...paymentWhere(scope, { ...filters, method: undefined }), status: { not: 'VOIDED' }, paymentDate: { gte: range.start, lt: range.endExclusive } },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const collectorIds = Array.from(new Set(grouped.map((g) => g.collectedById).filter((v): v is string => !!v)));
  const users = collectorIds.length
    ? await prisma.user.findMany({ where: { id: { in: collectorIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? id : null);

  const byCollector = new Map<string | null, { paymentsCount: number; cash: Prisma.Decimal; digital: Prisma.Decimal }>();
  for (const g of grouped) {
    const cur = byCollector.get(g.collectedById) ?? { paymentsCount: 0, cash: new Prisma.Decimal(0), digital: new Prisma.Decimal(0) };
    cur.paymentsCount += g._count._all;
    if (g.paymentMethod === 'CASH') cur.cash = cur.cash.plus(g._sum.amount ?? 0);
    else cur.digital = cur.digital.plus(g._sum.amount ?? 0);
    byCollector.set(g.collectedById, cur);
  }

  const rows = Array.from(byCollector.entries())
    .map(([collectedById, agg]) => ({
      collectorId: collectedById,
      collectorName: nameOf(collectedById) ?? 'Unassigned',
      paymentsCount: agg.paymentsCount,
      cash: money(agg.cash),
      digital: money(agg.digital),
      total: money(agg.cash.plus(agg.digital)),
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { range: { from: range.from, to: range.to }, rows },
    export: {
      rows,
      columns: [
        { header: R.col.collector, value: (r: Row) => r.collectorName },
        { header: R.col.payments, value: (r: Row) => r.paymentsCount },
        { header: `${R.col.cash} (BDT)`, value: (r: Row) => r.cash },
        { header: `${R.col.digital} (BDT)`, value: (r: Row) => r.digital },
        { header: `${R.col.amount} (BDT)`, value: (r: Row) => r.total },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Branch comparison (OWNER/ADMIN only) — factual side-by-side, no ranking
// ------------------------------------------------------------------

export const financeBranches: ViewHandler = async ({ scope, filters }) => {
  if (!canCompareBranches(scope.role)) throw new Error('FORBIDDEN_REPORT');
  const range = resolveRange(filters);
  const cc = scope.coachingCenterId;
  const branchIds = scope.branchId ? [scope.branchId] : undefined;
  const [branches, invoiced, collected, due, refunds] = await Promise.all([
    prisma.branch.findMany({ where: { coachingCenterId: cc, ...(branchIds ? { id: { in: branchIds } } : {}) }, select: { id: true, name: true, banglaName: true }, orderBy: [{ isMain: 'desc' }, { name: 'asc' }] }),
    prisma.feeInvoice.groupBy({
      by: ['branchId'],
      where: { coachingCenterId: cc, ...branchOf(scope), status: { notIn: ['DRAFT', 'CANCELLED'] }, invoiceDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['branchId'],
      where: { coachingCenterId: cc, ...branchOf(scope), status: { not: 'VOIDED' }, paymentDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ['branchId'],
      where: { coachingCenterId: cc, ...branchOf(scope), status: { in: OPEN_INVOICE }, dueAmount: { gt: 0 } },
      _sum: { dueAmount: true },
    }),
    prisma.$queryRaw<Array<{ branchId: string | null; amount: Prisma.Decimal; n: bigint }>>`
      SELECT p."branchId" AS "branchId", SUM(r."amount") AS amount, COUNT(*) AS n
      FROM "payment_refunds" r JOIN "payments" p ON p."id" = r."paymentId"
      WHERE ${sqlAnd([
        Prisma.sql`r."coachingCenterId" = ${cc}`,
        Prisma.sql`r."refundDate" >= ${range.start}`,
        Prisma.sql`r."refundDate" < ${range.endExclusive}`,
        ...(scope.branchId ? [Prisma.sql`p."branchId" = ${scope.branchId}`] : []),
      ])}
      GROUP BY 1`,
  ]);
  const keys: Array<string | null> = [...branches.map((b) => b.id)];
  // Records with no branch (branchId NULL) are shown as their own honest row.
  const hasUnassigned = [...invoiced, ...collected, ...due].some((r) => r.branchId === null) || refunds.some((r) => r.branchId === null);
  if (hasUnassigned && !scope.branchId) keys.push(null);
  const rows = keys.map((id) => {
    const b = branches.find((x) => x.id === id) ?? null;
    const inv = invoiced.find((x) => x.branchId === id);
    const pay = collected.find((x) => x.branchId === id);
    const d = due.find((x) => x.branchId === id);
    const rf = refunds.find((x) => x.branchId === id);
    return {
      branchId: id,
      branch: b,
      invoiced: money(inv?._sum.totalAmount),
      invoiceCount: inv?._count._all ?? 0,
      collected: money(pay?._sum.amount),
      paymentCount: pay?._count._all ?? 0,
      refunded: money(rf?.amount),
      due: money(d?._sum.dueAmount),
    };
  });
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { range: { from: range.from, to: range.to }, rows },
    export: {
      rows,
      columns: [
        { header: R.col.branch, value: (r: Row) => (r.branch ? pickName(lang, r.branch.name, r.branch.banglaName) : R.unassignedBranch) },
        { header: `${R.col.invoiced} (BDT)`, value: (r: Row) => r.invoiced },
        { header: R.col.invoices, value: (r: Row) => r.invoiceCount },
        { header: `${R.col.collected} (BDT)`, value: (r: Row) => r.collected },
        { header: `${R.col.refunded} (BDT)`, value: (r: Row) => r.refunded },
        { header: `${R.col.due} (BDT)`, value: (r: Row) => r.due },
      ],
    },
  };
};
