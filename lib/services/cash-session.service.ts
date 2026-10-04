import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { isBranchScoped, resolveEffectiveBranchId, type SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAuditLog } from './audit.service';
import { todayDhaka, dhakaDayStart, addDays, isIsoDate } from '@/lib/reports/dates';
import { toDateOnly } from '@/lib/schedule';

/**
 * Phase 10.9 cash reconciliation — one OPEN/CLOSED session per branch per
 * Dhaka business day, no shifts. Never recomputes expectedCash after close,
 * never silently forces a nonzero difference to balance (AGENTS.md Phase
 * 10.9 §11/§12).
 */

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function assertCollectionRole(user: SessionUser) {
  if (!can(user, 'fees.cash_session.manage')) {
    throw new Error('CASH_SESSION_ACCESS_DENIED: only Owner, Admin, or Staff can manage cash sessions');
  }
}

function isDuplicateError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Phase 13: cash that left the drawer as an Expense (salary payments and any
 * other CASH expense) on the given Dhaka business date. Expense.date is a
 * @db.Date holding the Dhaka calendar date, so it matches the session's
 * businessDate exactly.
 */
export async function getCashExpensesForDate(coachingCenterId: string, branchId: string, businessDate: Date): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { coachingCenterId, branchId, paymentMethod: 'CASH', status: 'ACTIVE', date: businessDate }, // Phase 15.2: cancelled expenses never leave the drawer
    _sum: { amount: true },
  });
  return n(agg._sum.amount);
}


export async function computeExpectedCash(coachingCenterId: string, branchId: string, businessDate: Date, openingCash: Prisma.Decimal | number): Promise<number> {
  const ymd = businessDate.toISOString().slice(0, 10);
  const dayStart = dhakaDayStart(ymd);
  const dayEnd = dhakaDayStart(addDays(ymd, 1));

  const [cashCollected, cashRefunded, cashExpenses] = await Promise.all([
    prisma.payment.aggregate({
      where: { coachingCenterId, branchId, paymentMethod: 'CASH', status: { not: 'VOIDED' }, paymentDate: { gte: dayStart, lt: dayEnd } },
      _sum: { amount: true },
    }),
    prisma.paymentRefund.aggregate({
      where: {
        coachingCenterId,
        refundDate: { gte: dayStart, lt: dayEnd },
        payment: { branchId, paymentMethod: 'CASH' },
      },
      _sum: { amount: true },
    }),
    getCashExpensesForDate(coachingCenterId, branchId, businessDate),
  ]);

  return n(openingCash) + n(cashCollected._sum.amount) - n(cashRefunded._sum.amount) - cashExpenses;
}

export async function getTodaySession(coachingCenterId: string, branchId: string) {
  const businessDate = toDateOnly(todayDhaka());
  return prisma.cashSession.findUnique({
    where: { coachingCenterId_branchId_businessDate: { coachingCenterId, branchId, businessDate } },
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
}

export async function openCashSession(coachingCenterId: string, user: SessionUser, branchId: string, openingCash: number) {
  assertCollectionRole(user);
  if (!(openingCash >= 0)) throw new Error('INVALID_OPENING_CASH: opening cash must be zero or greater');

  const branch = await prisma.branch.findFirst({ where: { id: branchId, coachingCenterId } });
  if (!branch) throw new Error('BRANCH_NOT_FOUND');

  const businessDate = toDateOnly(todayDhaka());
  try {
    const session = await prisma.cashSession.create({
      data: { coachingCenterId, branchId, businessDate, openingCash, openedById: user.userId },
    });

    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'CASH_SESSION_OPENED',
      entity: 'CashSession',
      entityId: session.id,
      details: { branchId, businessDate: businessDate.toISOString().slice(0, 10), openingCash },
    });

    return session;
  } catch (error) {
    if (isDuplicateError(error)) throw new Error('CASH_SESSION_ALREADY_OPEN: a session for this branch and date already exists');
    throw error;
  }
}

export interface CloseCashSessionInput {
  countedCash: number;
  note?: string;
}

/**
 * Closing is a concurrency-safe atomic claim (same pattern as Phase 10.8's
 * retry claim): the session row is only ever transitioned OPEN → CLOSED by
 * whichever request's `updateMany` actually matches a row still OPEN, so two
 * simultaneous "Close" clicks can never both record a close.
 */
export async function closeCashSession(coachingCenterId: string, user: SessionUser, sessionId: string, input: CloseCashSessionInput) {
  assertCollectionRole(user);
  if (!(input.countedCash >= 0)) throw new Error('INVALID_COUNTED_CASH: counted cash must be zero or greater');

  const session = await prisma.cashSession.findFirst({ where: { id: sessionId, coachingCenterId } });
  if (!session) throw new Error('CASH_SESSION_NOT_FOUND');

  const expectedCash = await computeExpectedCash(coachingCenterId, session.branchId, session.businessDate, session.openingCash);
  const difference = Math.round((input.countedCash - expectedCash) * 100) / 100;
  const note = input.note?.trim() || null;

  if (Math.abs(difference) > 0.005 && !note) {
    throw new Error('CASH_SESSION_NOTE_REQUIRED: a note is required to close with a nonzero discrepancy');
  }

  const claimed = await prisma.cashSession.updateMany({
    where: { id: sessionId, coachingCenterId, status: 'OPEN' },
    data: {
      status: 'CLOSED',
      countedCash: input.countedCash,
      expectedCash,
      difference,
      note,
      closedById: user.userId,
      closedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new Error('CASH_SESSION_ALREADY_CLOSED: this session was already closed');
  }

  const updated = await prisma.cashSession.findUniqueOrThrow({ where: { id: sessionId } });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'CASH_SESSION_CLOSED',
    entity: 'CashSession',
    entityId: sessionId,
    details: { expectedCash, countedCash: input.countedCash, difference, hasNote: !!note },
  });

  return updated;
}

export interface CashSessionListParams {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function listCashSessions(coachingCenterId: string, params: CashSessionListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));

  const where: Prisma.CashSessionWhereInput = { coachingCenterId };
  if (params.branchId) where.branchId = params.branchId;
  if (params.dateFrom || params.dateTo) {
    where.businessDate = {};
    if (params.dateFrom) where.businessDate.gte = toDateOnly(params.dateFrom);
    if (params.dateTo) where.businessDate.lte = toDateOnly(params.dateTo);
  }

  const [total, sessions] = await Promise.all([
    prisma.cashSession.count({ where }),
    prisma.cashSession.findMany({
      where,
      orderBy: { businessDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        branch: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { sessions, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getCashBoxDashboard(
  coachingCenterId: string,
  user: SessionUser,
  requestedBranchId?: string | null,
  dateStr?: string | null
) {
  const requested = requestedBranchId && requestedBranchId !== 'all' ? requestedBranchId : undefined;
  const effectiveBranchId = resolveEffectiveBranchId(user, requested);
  const branchLocked = isBranchScoped(user);

  const branches = await prisma.branch.findMany({
    where: { coachingCenterId, ...(branchLocked ? { id: user.branchId! } : {}) },
    select: { id: true, name: true, banglaName: true },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
  });

  if (effectiveBranchId && !branches.some((b) => b.id === effectiveBranchId)) {
    throw new Error('BRANCH_NOT_FOUND: branch does not belong to this centre');
  }

  const activeBranchId = effectiveBranchId || branches[0]?.id;
  const businessDateStr = dateStr && isIsoDate(dateStr) ? dateStr : todayDhaka();
  const businessDate = toDateOnly(businessDateStr);

  let currentSession = null;
  let cashCollections = 0;
  let cashRefunds = 0;
  let cashExpenses = 0;
  let expectedCash: number | null = null;

  if (activeBranchId) {
    currentSession = await prisma.cashSession.findUnique({
      where: {
        coachingCenterId_branchId_businessDate: {
          coachingCenterId,
          branchId: activeBranchId,
          businessDate,
        },
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, banglaName: true } },
      },
    });

    const ymd = businessDate.toISOString().slice(0, 10);
    const dayStart = dhakaDayStart(ymd);
    const dayEnd = dhakaDayStart(addDays(ymd, 1));

    const [collectedAgg, refundedAgg, expAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          coachingCenterId,
          branchId: activeBranchId,
          paymentMethod: 'CASH',
          status: { not: 'VOIDED' },
          paymentDate: { gte: dayStart, lt: dayEnd },
        },
        _sum: { amount: true },
      }),
      prisma.paymentRefund.aggregate({
        where: {
          coachingCenterId,
          refundDate: { gte: dayStart, lt: dayEnd },
          payment: { branchId: activeBranchId, paymentMethod: 'CASH' },
        },
        _sum: { amount: true },
      }),
      getCashExpensesForDate(coachingCenterId, activeBranchId, businessDate),
    ]);

    cashCollections = n(collectedAgg._sum.amount);
    cashRefunds = n(refundedAgg._sum.amount);
    cashExpenses = expAgg;

    if (currentSession) {
      if (currentSession.status === 'OPEN') {
        expectedCash = n(currentSession.openingCash) + cashCollections - cashRefunds - cashExpenses;
      } else {
        expectedCash = currentSession.expectedCash != null ? n(currentSession.expectedCash) : null;
      }
    }
  }

  const history = await prisma.cashSession.findMany({
    where: {
      coachingCenterId,
      ...(activeBranchId ? { branchId: activeBranchId } : {}),
    },
    orderBy: { businessDate: 'desc' },
    take: 30,
    include: {
      branch: { select: { id: true, name: true, banglaName: true } },
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });

  return {
    branch: {
      id: activeBranchId ?? null,
      locked: branchLocked,
      options: branches,
    },
    date: businessDateStr,
    session: currentSession
      ? {
          id: currentSession.id,
          businessDate: currentSession.businessDate.toISOString().slice(0, 10),
          branchId: currentSession.branchId,
          branchName: currentSession.branch.name,
          branchBanglaName: currentSession.branch.banglaName,
          status: currentSession.status as 'OPEN' | 'CLOSED',
          openingCash: n(currentSession.openingCash),
          expectedCash,
          countedCash: currentSession.countedCash != null ? n(currentSession.countedCash) : null,
          difference: currentSession.difference != null ? n(currentSession.difference) : null,
          note: currentSession.note,
          openedByName: currentSession.openedBy?.name || null,
          closedByName: currentSession.closedBy?.name || null,
          openedAt: currentSession.openedAt.toISOString(),
          closedAt: currentSession.closedAt ? currentSession.closedAt.toISOString() : null,
        }
      : null,
    movements: {
      cashCollections,
      cashRefunds,
      cashExpenses,
      netMovement: cashCollections - cashRefunds - cashExpenses,
    },
    history: history.map((h) => ({
      id: h.id,
      businessDate: h.businessDate.toISOString().slice(0, 10),
      branchId: h.branchId,
      branchName: h.branch.name,
      branchBanglaName: h.branch.banglaName,
      status: h.status as 'OPEN' | 'CLOSED',
      openingCash: n(h.openingCash),
      expectedCash: h.expectedCash != null ? n(h.expectedCash) : null,
      countedCash: h.countedCash != null ? n(h.countedCash) : null,
      difference: h.difference != null ? n(h.difference) : null,
      note: h.note,
      openedByName: h.openedBy?.name || null,
      closedByName: h.closedBy?.name || null,
      closedAt: h.closedAt ? h.closedAt.toISOString() : null,
    })),
  };
}

