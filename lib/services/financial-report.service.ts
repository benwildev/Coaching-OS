import prisma from '@/lib/db';
import type { Prisma, PaymentMethod } from '@prisma/client';
import { buildDhakaRange, isIsoDate, todayDhaka } from '@/lib/reports/dates';
import { getTodaySession, getCashExpensesForDate } from './cash-session.service';

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function startOfTodayDhaka(): Date {
  // Asia/Dhaka has no DST; a fixed +6h offset is always correct.
  const now = new Date();
  const dhakaNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const y = dhakaNow.getUTCFullYear();
  const m = dhakaNow.getUTCMonth();
  const d = dhakaNow.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 6 * 60 * 60 * 1000);
}

function startOfMonthDhaka(): Date {
  const now = new Date();
  const dhakaNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const y = dhakaNow.getUTCFullYear();
  const m = dhakaNow.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0) - 6 * 60 * 60 * 1000);
}

export interface DashboardParams {
  branchId?: string;
}

/** All real, database-backed KPIs — never fabricated growth %, targets, or forecasts. */
export async function getFeeDashboard(coachingCenterId: string, params: DashboardParams = {}) {
  const todayStart = startOfTodayDhaka();
  const monthStart = startOfMonthDhaka();
  const now = new Date();

  const branchFilter = params.branchId && params.branchId !== 'all' ? { branchId: params.branchId } : {};

  const [
    todayPayments,
    monthPayments,
    outstandingAgg,
    overdueAgg,
    invoicesIssuedThisMonth,
    paymentsCountToday,
    studentsWithDue,
    recentPaymentsRaw,
    urgentDuesRaw,
    activeStructuresRaw,
    monthPaymentsByMethod,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { coachingCenterId, ...branchFilter, paymentDate: { gte: todayStart }, status: { not: 'VOIDED' } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { coachingCenterId, ...branchFilter, paymentDate: { gte: monthStart }, status: { not: 'VOIDED' } },
      _sum: { amount: true },
    }),
    prisma.feeInvoice.aggregate({
      where: { coachingCenterId, ...branchFilter, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] } },
      _sum: { dueAmount: true },
    }),
    prisma.feeInvoice.aggregate({
      where: {
        coachingCenterId,
        ...branchFilter,
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: now },
        dueAmount: { gt: 0 },
      },
      _sum: { dueAmount: true },
    }),
    prisma.feeInvoice.count({
      where: { coachingCenterId, ...branchFilter, invoiceDate: { gte: monthStart }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    }),
    prisma.payment.count({
      where: { coachingCenterId, ...branchFilter, paymentDate: { gte: todayStart }, status: { not: 'VOIDED' } },
    }),
    prisma.feeInvoice.findMany({
      where: { coachingCenterId, ...branchFilter, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] }, dueAmount: { gt: 0 } },
      distinct: ['studentId'],
      select: { studentId: true },
    }),
    prisma.payment.findMany({
      where: { coachingCenterId, ...branchFilter, status: { not: 'VOIDED' } },
      take: 6,
      orderBy: { paymentDate: 'desc' },
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        student: {
          select: {
            id: true,
            name: true,
            studentIdCode: true,
            phone: true,
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
          },
        },
      },
    }),
    prisma.feeInvoice.findMany({
      where: {
        coachingCenterId,
        ...branchFilter,
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        dueAmount: { gt: 0 },
      },
      take: 5,
      orderBy: [{ dueDate: 'asc' }, { dueAmount: 'desc' }],
      select: {
        id: true,
        invoiceNumber: true,
        dueAmount: true,
        totalAmount: true,
        dueDate: true,
        status: true,
        student: {
          select: {
            id: true,
            name: true,
            studentIdCode: true,
            studentBatches: {
              where: { status: 'ACTIVE' },
              take: 1,
              select: { batch: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.feeStructure.findMany({
      where: { coachingCenterId, ...branchFilter, isActive: true },
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        amount: true,
        feeType: true,
        frequency: true,
        _count: {
          select: { feeAssignments: true },
        },
      },
    }),
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { coachingCenterId, ...branchFilter, paymentDate: { gte: monthStart }, status: { not: 'VOIDED' } },
      _sum: { amount: true },
    }),
  ]);

  const methodTotals: Record<string, number> = { CASH: 0, BKASH: 0, NAGAD: 0, BANK: 0, CARD: 0, OTHER: 0 };
  for (const p of monthPaymentsByMethod) {
    if (p.paymentMethod) methodTotals[p.paymentMethod] = n(p._sum.amount);
  }

  const nowMs = Date.now();
  return {
    todayCollection: n(todayPayments._sum.amount),
    monthCollection: n(monthPayments._sum.amount),
    outstandingDue: n(outstandingAgg._sum.dueAmount),
    overdueAmount: n(overdueAgg._sum.dueAmount),
    invoicesIssuedThisMonth,
    paymentsCountToday,
    studentsWithDueCount: studentsWithDue.length,
    recentPayments: recentPaymentsRaw.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amount: n(p.amount),
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate.toISOString(),
      student: p.student,
      invoice: p.invoice,
    })),
    urgentDues: urgentDuesRaw.map((inv) => {
      const daysOverdue = inv.dueDate ? Math.max(0, Math.floor((nowMs - new Date(inv.dueDate).getTime()) / 86400000)) : 0;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        dueAmount: n(inv.dueAmount),
        totalAmount: n(inv.totalAmount),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        daysOverdue,
        status: inv.status,
        student: {
          id: inv.student.id,
          name: inv.student.name,
          studentIdCode: inv.student.studentIdCode,
          batchName: inv.student.studentBatches[0]?.batch.name || null,
        },
      };
    }),
    activeStructures: activeStructuresRaw.map((s) => ({
      id: s.id,
      name: s.name,
      banglaName: s.banglaName,
      amount: n(s.amount),
      feeType: s.feeType,
      frequency: s.frequency,
      assignmentsCount: s._count.feeAssignments,
    })),
    methodBreakdown: methodTotals,
  };
}

export interface CollectionReportParams {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  paymentMethod?: string;
  batchId?: string;
  collectedById?: string;
}

const METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER'];

export async function getCollectionReport(coachingCenterId: string, params: CollectionReportParams = {}) {
  const where: Prisma.PaymentWhereInput = { coachingCenterId, status: { not: 'VOIDED' } };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.paymentMethod && params.paymentMethod !== 'all') where.paymentMethod = params.paymentMethod as PaymentMethod;
  if (params.collectedById && params.collectedById !== 'all') where.collectedById = params.collectedById;
  if (params.batchId && params.batchId !== 'all') {
    where.student = { studentBatches: { some: { batchId: params.batchId, status: 'ACTIVE' } } };
  }
  where.paymentDate = {};
  if (params.dateFrom) where.paymentDate.gte = new Date(params.dateFrom);
  if (params.dateTo) where.paymentDate.lte = new Date(`${params.dateTo}T23:59:59.999`);
  if (!params.dateFrom && !params.dateTo) {
    where.paymentDate.gte = startOfMonthDhaka();
  }

  const payments = await prisma.payment.findMany({
    where,
    select: { amount: true, paymentMethod: true, paymentDate: true },
    orderBy: { paymentDate: 'asc' },
  });

  const totals: Record<string, number> = Object.fromEntries(METHODS.map((m) => [m, 0]));
  let grandTotal = 0;
  const byDate = new Map<string, { count: number; methods: Record<string, number>; total: number }>();

  for (const p of payments) {
    const amount = n(p.amount);
    totals[p.paymentMethod] = (totals[p.paymentMethod] || 0) + amount;
    grandTotal += amount;

    const dateKey = p.paymentDate.toISOString().slice(0, 10);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { count: 0, methods: Object.fromEntries(METHODS.map((m) => [m, 0])), total: 0 });
    }
    const row = byDate.get(dateKey)!;
    row.count += 1;
    row.methods[p.paymentMethod] = (row.methods[p.paymentMethod] || 0) + amount;
    row.total += amount;
  }

  const daily = Array.from(byDate.entries())
    .map(([date, row]) => ({ date, ...row }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    totalsByMethod: totals,
    grandTotal,
    paymentsCount: payments.length,
    daily,
  };
}

export interface DueReportParams {
  branchId?: string;
  batchId?: string;
  overdueOnly?: boolean;
  search?: string;
  sortBy?: 'dueDate' | 'amount' | 'name';
  page?: number;
  pageSize?: number;
}

export async function getDueReport(coachingCenterId: string, params: DueReportParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 30));
  const skip = (page - 1) * pageSize;

  const where: Prisma.FeeInvoiceWhereInput = {
    coachingCenterId,
    status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
    dueAmount: { gt: 0 },
  };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.batchId && params.batchId !== 'all') {
    where.student = { studentBatches: { some: { batchId: params.batchId, status: 'ACTIVE' } } };
  }
  if (params.overdueOnly) {
    where.dueDate = { lt: new Date() };
  }
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { student: { name: { contains: q, mode: 'insensitive' } } },
      { student: { studentIdCode: { contains: q, mode: 'insensitive' } } },
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
    ];
  }

  let orderBy: Prisma.FeeInvoiceOrderByWithRelationInput = { dueDate: 'asc' };
  if (params.sortBy === 'amount') orderBy = { dueAmount: 'desc' };
  if (params.sortBy === 'name') orderBy = { student: { name: 'asc' } };

  const [total, invoices] = await Promise.all([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentIdCode: true,
            phone: true,
            studentGuardians: {
              where: { isPrimary: true },
              take: 1,
              include: { guardian: { select: { name: true, phone: true } } },
            },
            studentBatches: {
              where: { status: 'ACTIVE' },
              take: 1,
              include: { batch: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const now = Date.now();
  const rows = invoices.map((inv) => {
    const daysOverdue = inv.dueDate ? Math.max(0, Math.floor((now - inv.dueDate.getTime()) / 86400000)) : 0;
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      dueDate: inv.dueDate,
      totalAmount: n(inv.totalAmount),
      paidAmount: n(inv.paidAmount),
      dueAmount: n(inv.dueAmount),
      daysOverdue,
      student: {
        id: inv.student.id,
        name: inv.student.name,
        studentIdCode: inv.student.studentIdCode,
        phone: inv.student.phone,
      },
      guardian: inv.student.studentGuardians[0]?.guardian || null,
      batch: inv.student.studentBatches[0]?.batch || null,
    };
  });

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Batch-wise financial view for the batch detail page's Financial tab. */
export async function getBatchFinancialSummary(coachingCenterId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId } });
  if (!batch) return null;

  const activeStudents = await prisma.studentBatch.findMany({
    where: { batchId, coachingCenterId, status: 'ACTIVE' },
    include: { student: { select: { id: true, name: true, studentIdCode: true } } },
  });
  const studentIds = activeStudents.map((sb) => sb.studentId);

  if (studentIds.length === 0) {
    return { batch, students: [], totals: { totalBilled: 0, totalCollected: 0, totalDue: 0, collectionCount: 0 } };
  }

  const invoices = await prisma.feeInvoice.findMany({
    where: { coachingCenterId, studentId: { in: studentIds }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    select: { studentId: true, totalAmount: true, paidAmount: true, dueAmount: true, status: true, _count: { select: { payments: true } } },
  });

  const byStudent = new Map<string, { billed: number; paid: number; due: number; collectionCount: number; hasOverdue: boolean }>();
  for (const inv of invoices) {
    const cur = byStudent.get(inv.studentId) || { billed: 0, paid: 0, due: 0, collectionCount: 0, hasOverdue: false };
    cur.billed += n(inv.totalAmount);
    cur.paid += n(inv.paidAmount);
    cur.due += n(inv.dueAmount);
    cur.collectionCount += inv._count.payments;
    if (inv.status === 'OVERDUE') cur.hasOverdue = true;
    byStudent.set(inv.studentId, cur);
  }

  const students = activeStudents.map((sb) => {
    const fin = byStudent.get(sb.studentId) || { billed: 0, paid: 0, due: 0, collectionCount: 0, hasOverdue: false };
    const status = fin.due <= 0 && fin.billed > 0 ? 'PAID' : fin.hasOverdue ? 'OVERDUE' : fin.paid > 0 ? 'PARTIAL' : fin.billed > 0 ? 'DUE' : 'NONE';
    return {
      student: sb.student,
      totalBilled: fin.billed,
      totalPaid: fin.paid,
      totalDue: fin.due,
      collectionCount: fin.collectionCount,
      status,
    };
  });

  const totals = students.reduce(
    (acc, s) => {
      acc.totalBilled += s.totalBilled;
      acc.totalCollected += s.totalPaid;
      acc.totalDue += s.totalDue;
      acc.collectionCount += s.collectionCount;
      return acc;
    },
    { totalBilled: 0, totalCollected: 0, totalDue: 0, collectionCount: 0 }
  );

  return { batch, students, totals };
}

// ------------------------------------------------------------------
// Daily Collection Dashboard (Phase 10.9) — an arbitrary selected Dhaka
// business date, unlike getFeeDashboard's fixed "today + this month". Built
// on lib/reports/dates.ts (the more complete, already-shared Dhaka-boundary
// utility) rather than this file's own startOfTodayDhaka/startOfMonthDhaka,
// which stay untouched to avoid destabilizing the existing dashboard above.
// ------------------------------------------------------------------

export interface DailyCollectionParams {
  date?: string; // YYYY-MM-DD, Dhaka calendar date — defaults to today
  branchId?: string;
}

export async function getDailyCollectionSummary(coachingCenterId: string, params: DailyCollectionParams = {}) {
  const date = params.date && isIsoDate(params.date) ? params.date : todayDhaka();
  const range = buildDhakaRange(date, date);
  const branchFilter = params.branchId ? { branchId: params.branchId } : {};

  const [paymentsByMethod, refunds] = await Promise.all([
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { coachingCenterId, ...branchFilter, status: { not: 'VOIDED' }, paymentDate: { gte: range.start, lt: range.endExclusive } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentRefund.findMany({
      where: { coachingCenterId, refundDate: { gte: range.start, lt: range.endExclusive }, payment: { ...branchFilter } },
      select: { amount: true, payment: { select: { paymentMethod: true } } },
    }),
  ]);

  const refundByMethod = new Map<PaymentMethod, number>();
  for (const r of refunds) {
    refundByMethod.set(r.payment.paymentMethod, (refundByMethod.get(r.payment.paymentMethod) || 0) + n(r.amount));
  }

  const methods = METHODS.map((method) => {
    const g = paymentsByMethod.find((x) => x.paymentMethod === method);
    const gross = n(g?._sum.amount);
    const refunded = refundByMethod.get(method) || 0;
    return { method, count: g?._count._all ?? 0, gross, refunded, net: gross - refunded };
  });

  const totalCollection = methods.reduce((s, m) => s + m.gross, 0);
  const refundedAmount = methods.reduce((s, m) => s + m.refunded, 0);
  const paymentsCount = methods.reduce((s, m) => s + m.count, 0);

  const isToday = date === todayDhaka();
  const cashSession = isToday && params.branchId ? await getTodaySession(coachingCenterId, params.branchId) : null;
  const cashExpenses = cashSession && params.branchId ? await getCashExpensesForDate(coachingCenterId, params.branchId, cashSession.businessDate) : 0;

  return {
    date,
    branchId: params.branchId ?? null,
    totalCollection,
    refundedAmount,
    netCollection: totalCollection - refundedAmount,
    paymentsCount,
    receiptsCount: paymentsCount, // one receipt per payment
    methods,
    cashSession: cashSession
      ? {
          id: cashSession.id,
          status: cashSession.status,
          openingCash: n(cashSession.openingCash),
          cashExpenses,
          countedCash: cashSession.countedCash != null ? n(cashSession.countedCash) : null,
          expectedCash: cashSession.expectedCash != null ? n(cashSession.expectedCash) : null,
          difference: cashSession.difference != null ? n(cashSession.difference) : null,
          openedBy: cashSession.openedBy,
          closedBy: cashSession.closedBy,
        }
      : null,
  };
}
