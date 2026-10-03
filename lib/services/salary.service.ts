import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { assertBranchAccess, resolveEffectiveBranchId, type SessionUser } from '@/lib/auth/session';
import { getCurrentDhakaDateString, toDateOnly } from '@/lib/schedule';
import { can, type PermissionCode } from '@/lib/auth/permissions';
import { recordAuditLog } from './audit.service';
import { scopeKey, ymd } from './compensation.service';
import type { SalaryGenerateInput, SalaryPaymentInput, CompensationType } from '@/lib/validations/salary';

/**
 * Phase 13 — salary periods, payables and manual payments.
 *
 * Calculation rules (documented, no hidden payroll logic):
 *  - A rule applies to a month if its [effectiveFrom, effectiveTo] window intersects the month.
 *  - MONTHLY_FIXED / PER_BATCH / CUSTOM: a flat monthly amount, never prorated. If two
 *    rules of the same scope touch the month, the one with the latest effectiveFrom wins
 *    (the rate in force at the end of the month). PER_BATCH also needs the teaching
 *    assignment itself to have been active at some point in the month.
 *  - PER_CLASS: rate x number of COMPLETED, type=CLASS AttendanceSessions taught by the
 *    teacher for the rule's batch + subject on dates inside both the month and the rule's
 *    window. Rules in one scope never overlap, so no session is counted twice.
 *    TeacherAttendance is NOT consulted: it is a per-day sign-in with no link to a class.
 *  - additions / deductions stay 0 — the system has no rule that produces them.
 */

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

const cents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

function assertFinance(user: SessionUser, code: PermissionCode) {
  if (!can(user, code)) throw new Error('SALARY_ACCESS_DENIED: only Owner, Admin or Staff can view salary');
}
function assertManager(user: SessionUser, code: PermissionCode) {
  if (!can(user, code)) throw new Error('SALARY_ACCESS_DENIED: only Owner or Admin can do this');
}

export const TEACHER_SALARY_CATEGORY_CODE = 'TEACHER_SALARY';

// ---------------------------------------------------------------------------
// Pure calculation (exported for tests)
// ---------------------------------------------------------------------------

export interface SalaryRule {
  id: string;
  type: CompensationType;
  amountCents: number;
  assignmentId: string | null;
  from: string; // YYYY-MM-DD
  to: string | null;
  notes?: string | null;
  assignment?: {
    batchId: string;
    subjectId: string;
    startDate: string;
    endDate: string | null;
    courseName: string | null;
    courseBanglaName: string | null;
    batchName: string;
    batchBanglaName: string | null;
    subjectName: string;
    subjectBanglaName: string | null;
  } | null;
}

export interface SalaryLine {
  compensationId: string;
  type: CompensationType;
  unit: 'MONTH' | 'CLASS';
  quantity: number;
  rate: number;
  amount: number;
  from: string;
  to: string;
  courseName?: string | null;
  courseBanglaName?: string | null;
  batchName?: string | null;
  batchBanglaName?: string | null;
  subjectName?: string | null;
  subjectBanglaName?: string | null;
  notes?: string | null;
}

export interface SessionPoint {
  batchId: string;
  subjectId: string | null;
  date: string; // YYYY-MM-DD
}

export function monthBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

export function calculateSalaryLines(
  rules: SalaryRule[],
  sessions: SessionPoint[],
  monthStart: string,
  monthEnd: string
): SalaryLine[] {
  const touching = rules.filter((r) => r.from <= monthEnd && (r.to ?? '9999-12-31') >= monthStart);
  const lines: SalaryLine[] = [];
  const labels = (r: SalaryRule) => ({
    courseName: r.assignment?.courseName ?? null,
    courseBanglaName: r.assignment?.courseBanglaName ?? null,
    batchName: r.assignment?.batchName ?? null,
    batchBanglaName: r.assignment?.batchBanglaName ?? null,
    subjectName: r.assignment?.subjectName ?? null,
    subjectBanglaName: r.assignment?.subjectBanglaName ?? null,
  });

  // Flat monthly scopes: pick the latest-starting rule per scope.
  const flatWinner = new Map<string, SalaryRule>();
  for (const r of touching) {
    if (r.type === 'PER_CLASS') continue;
    if (r.type === 'PER_BATCH') {
      const a = r.assignment;
      if (!a || a.startDate > monthEnd || (a.endDate && a.endDate < monthStart)) continue;
    }
    const key = scopeKey(r.type, r.assignmentId);
    const cur = flatWinner.get(key);
    if (!cur || r.from > cur.from) flatWinner.set(key, r);
  }
  for (const r of flatWinner.values()) {
    lines.push({
      compensationId: r.id,
      type: r.type,
      unit: 'MONTH',
      quantity: 1,
      rate: fromCents(r.amountCents),
      amount: fromCents(r.amountCents),
      from: r.from > monthStart ? r.from : monthStart,
      to: r.to && r.to < monthEnd ? r.to : monthEnd,
      notes: r.notes ?? null,
      ...labels(r),
    });
  }

  for (const r of touching) {
    if (r.type !== 'PER_CLASS' || !r.assignment) continue;
    const from = r.from > monthStart ? r.from : monthStart;
    const to = r.to && r.to < monthEnd ? r.to : monthEnd;
    const quantity = sessions.filter(
      (s) => s.batchId === r.assignment!.batchId && s.subjectId === r.assignment!.subjectId && s.date >= from && s.date <= to
    ).length;
    lines.push({
      compensationId: r.id,
      type: r.type,
      unit: 'CLASS',
      quantity,
      rate: fromCents(r.amountCents),
      amount: fromCents(quantity * r.amountCents),
      from,
      to,
      notes: r.notes ?? null,
      ...labels(r),
    });
  }

  const order: Record<string, number> = { MONTHLY_FIXED: 0, PER_BATCH: 1, PER_CLASS: 2, CUSTOM: 3 };
  return lines.sort((a, b) => order[a.type] - order[b.type]);
}

// ---------------------------------------------------------------------------
// Period / branch resolution
// ---------------------------------------------------------------------------

async function accessibleBranches(coachingCenterId: string, user: SessionUser) {
  const locked = user.role !== 'OWNER' && user.branchId;
  return prisma.branch.findMany({
    where: { coachingCenterId, ...(locked ? { id: user.branchId! } : {}) },
    select: { id: true, name: true, banglaName: true },
    orderBy: { name: 'asc' },
  });
}

async function resolveBranch(coachingCenterId: string, user: SessionUser, requested?: string) {
  const branches = await accessibleBranches(coachingCenterId, user);
  const wanted = resolveEffectiveBranchId(user, requested);
  const branch = wanted ? branches.find((b) => b.id === wanted) : branches.length === 1 ? branches[0] : undefined;
  if (wanted && !branch) {
    // Distinguish "not in this tenant" from "not yours".
    const exists = await prisma.branch.findFirst({ where: { id: wanted, coachingCenterId }, select: { id: true } });
    if (!exists) throw new Error('BRANCH_NOT_FOUND');
    throw new Error('FORBIDDEN_BRANCH');
  }
  if (!branch) throw new Error('BRANCH_REQUIRED: select a branch');
  assertBranchAccess(user, branch.id);
  return { branch, branches };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateSalary(coachingCenterId: string, user: SessionUser, input: SalaryGenerateInput) {
  assertManager(user, 'salary.generate');
  const { branch } = await resolveBranch(coachingCenterId, user, input.branchId);
  const { year, month } = input;
  const { start, end } = monthBounds(year, month);
  const today = getCurrentDhakaDateString();
  if (start > today) throw new Error('SALARY_PERIOD_IN_FUTURE: that month has not started yet');
  const monthInProgress = end >= today;

  // 1. Read everything needed in a few set-based queries (no per-teacher queries).
  const rows = await prisma.teacherCompensation.findMany({
    where: {
      coachingCenterId,
      branchId: branch.id,
      effectiveFrom: { lte: toDateOnly(end) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: toDateOnly(start) } }],
    },
    include: {
      teacher: { select: { id: true, name: true } },
      assignment: {
        select: {
          batchId: true,
          subjectId: true,
          startDate: true,
          endDate: true,
          batch: { select: { name: true, banglaName: true, course: { select: { name: true, banglaName: true } } } },
          subject: { select: { name: true, banglaName: true } },
        },
      },
    },
  });

  const byTeacher = new Map<string, { name: string; rules: SalaryRule[] }>();
  for (const r of rows) {
    const entry = byTeacher.get(r.teacherId) ?? { name: r.teacher.name, rules: [] };
    entry.rules.push({
      id: r.id,
      type: r.type as CompensationType,
      amountCents: cents(n(r.amount)),
      assignmentId: r.batchTeacherAssignmentId,
      from: ymd(r.effectiveFrom),
      to: r.effectiveTo ? ymd(r.effectiveTo) : null,
      notes: r.notes,
      assignment: r.assignment
        ? {
            batchId: r.assignment.batchId,
            subjectId: r.assignment.subjectId,
            startDate: ymd(r.assignment.startDate),
            endDate: r.assignment.endDate ? ymd(r.assignment.endDate) : null,
            courseName: r.assignment.batch.course?.name ?? null,
            courseBanglaName: r.assignment.batch.course?.banglaName ?? null,
            batchName: r.assignment.batch.name,
            batchBanglaName: r.assignment.batch.banglaName,
            subjectName: r.assignment.subject.name,
            subjectBanglaName: r.assignment.subject.banglaName,
          }
        : null,
    });
    byTeacher.set(r.teacherId, entry);
  }

  const classTeacherIds = [...byTeacher.entries()].filter(([, v]) => v.rules.some((r) => r.type === 'PER_CLASS')).map(([id]) => id);
  const sessionRows = classTeacherIds.length
    ? await prisma.attendanceSession.findMany({
        where: {
          coachingCenterId,
          branchId: branch.id,
          teacherId: { in: classTeacherIds },
          type: 'CLASS',
          status: 'COMPLETED',
          date: { gte: toDateOnly(start), lte: toDateOnly(end) },
        },
        select: { teacherId: true, batchId: true, subjectId: true, date: true },
      })
    : [];
  const sessionsByTeacher = new Map<string, SessionPoint[]>();
  for (const s of sessionRows) {
    const list = sessionsByTeacher.get(s.teacherId!) ?? [];
    list.push({ batchId: s.batchId, subjectId: s.subjectId, date: ymd(s.date) });
    sessionsByTeacher.set(s.teacherId!, list);
  }

  const drafts: Array<{ teacherId: string; lines: SalaryLine[]; baseCents: number }> = [];
  const skipped: Array<{ teacherId: string; teacherName: string; reason: 'NO_APPLICABLE_RULE' | 'ZERO_AMOUNT' }> = [];
  for (const [teacherId, entry] of byTeacher) {
    const lines = calculateSalaryLines(entry.rules, sessionsByTeacher.get(teacherId) ?? [], start, end);
    const baseCents = lines.reduce((s, l) => s + cents(l.amount), 0);
    if (lines.length === 0) skipped.push({ teacherId, teacherName: entry.name, reason: 'NO_APPLICABLE_RULE' });
    else if (baseCents <= 0) skipped.push({ teacherId, teacherName: entry.name, reason: 'ZERO_AMOUNT' });
    else drafts.push({ teacherId, lines, baseCents });
  }

  // 2. Write under a lock + unique constraints so concurrent clicks cannot duplicate anything.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`salary:${coachingCenterId}:${branch.id}:${year}:${month}`})::bigint)`;

    let periodCreated = false;
    let period = await tx.salaryPeriod.findUnique({
      where: { coachingCenterId_branchId_year_month: { coachingCenterId, branchId: branch.id, year, month } },
    });
    if (!period) {
      period = await tx.salaryPeriod.create({
        data: { coachingCenterId, branchId: branch.id, year, month, createdById: user.userId },
      });
      periodCreated = true;
    }
    if (period.status !== 'OPEN') throw new Error('SALARY_PERIOD_LOCKED: this salary period is already finalized');

    const existing = await tx.salaryPayable.findMany({
      where: { salaryPeriodId: period.id },
      select: { teacherId: true },
    });
    const have = new Set(existing.map((e) => e.teacherId));
    const fresh = drafts.filter((d) => !have.has(d.teacherId));

    const created = fresh.length
      ? await tx.salaryPayable.createMany({
          skipDuplicates: true,
          data: fresh.map((d) => ({
            coachingCenterId,
            branchId: branch.id,
            salaryPeriodId: period!.id,
            teacherId: d.teacherId,
            baseAmount: fromCents(d.baseCents),
            additions: 0,
            deductions: 0,
            netAmount: fromCents(d.baseCents),
            paidAmount: 0,
            remainingAmount: fromCents(d.baseCents),
            status: 'UNPAID',
            breakdown: d.lines as unknown as Prisma.InputJsonValue,
            createdById: user.userId,
          })),
        })
      : { count: 0 };

    return { period, periodCreated, created: created.count, alreadyGenerated: drafts.length - fresh.length };
  });

  if (result.periodCreated) {
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'SALARY_PERIOD_CREATED',
      entity: 'SalaryPeriod',
      entityId: result.period.id,
      details: { branchId: branch.id, year, month },
    });
  }
  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'SALARY_GENERATED',
    entity: 'SalaryPeriod',
    entityId: result.period.id,
    details: { branchId: branch.id, year, month, created: result.created, alreadyGenerated: result.alreadyGenerated, skipped: skipped.length },
  });

  return {
    periodId: result.period.id,
    created: result.created,
    alreadyGenerated: result.alreadyGenerated,
    skipped,
    monthInProgress,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSalaryOverview(
  coachingCenterId: string,
  user: SessionUser,
  params: { year: number; month: number; branchId?: string }
) {
  assertFinance(user, 'salary.read');
  if (user.role === 'TEACHER') {
    throw new Error('FORBIDDEN_TEACHER_SCOPE: salary overview is administrative');
  }
  const { branch, branches } = await resolveBranch(coachingCenterId, user, params.branchId);
  const period = await prisma.salaryPeriod.findUnique({
    where: { coachingCenterId_branchId_year_month: { coachingCenterId, branchId: branch.id, year: params.year, month: params.month } },
  });

  const payables = period
    ? await prisma.salaryPayable.findMany({
        where: { coachingCenterId, salaryPeriodId: period.id },
        include: { teacher: { select: { id: true, name: true, banglaName: true, teacherCode: true } } },
        orderBy: { teacher: { name: 'asc' } },
      })
    : [];

  const rows = payables.map((p) => {
    const lines = Array.isArray(p.breakdown) ? (p.breakdown as unknown as SalaryLine[]) : [];
    return {
      id: p.id,
      teacher: p.teacher,
      types: [...new Set(lines.map((l) => l.type))],
      baseAmount: n(p.baseAmount),
      additions: n(p.additions),
      deductions: n(p.deductions),
      netAmount: n(p.netAmount),
      paidAmount: n(p.paidAmount),
      remainingAmount: n(p.remainingAmount),
      status: p.status,
    };
  });
  const live = rows.filter((r) => r.status !== 'CANCELLED');
  const totalsCents = live.reduce(
    (a, r) => ({ payable: a.payable + cents(r.netAmount), paid: a.paid + cents(r.paidAmount), remaining: a.remaining + cents(r.remainingAmount) }),
    { payable: 0, paid: 0, remaining: 0 }
  );

  return {
    branch,
    branches,
    year: params.year,
    month: params.month,
    period: period
      ? { id: period.id, status: period.status, finalizedAt: period.finalizedAt, createdAt: period.createdAt }
      : null,
    payables: rows,
    totals: { payable: fromCents(totalsCents.payable), paid: fromCents(totalsCents.paid), remaining: fromCents(totalsCents.remaining) },
  };
}

export async function getSalaryPayableDetail(coachingCenterId: string, user: SessionUser, payableId: string) {
  assertFinance(user, 'salary.read');
  const p = await prisma.salaryPayable.findFirst({
    where: { id: payableId, coachingCenterId },
    include: {
      teacher: { select: { id: true, name: true, banglaName: true, teacherCode: true } },
      salaryPeriod: { select: { id: true, year: true, month: true, status: true } },
      branch: { select: { id: true, name: true, banglaName: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!p) throw new Error('SALARY_PAYABLE_NOT_FOUND');
  assertBranchAccess(user, p.branchId);

  if (user.role === 'TEACHER') {
    const own = await prisma.teacher.findFirst({
      where: { coachingCenterId, userId: user.userId },
      select: { id: true },
    });
    if (!own || p.teacherId !== own.id) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }
  }

  const recorderIds = [...new Set(p.payments.map((x) => x.recordedById).filter((v): v is string => !!v))];
  const recorders = recorderIds.length
    ? await prisma.user.findMany({ where: { id: { in: recorderIds }, coachingCenterId }, select: { id: true, name: true } })
    : [];
  const recorderName = new Map(recorders.map((u) => [u.id, u.name]));

  return {
    id: p.id,
    teacher: p.teacher,
    branch: p.branch,
    period: p.salaryPeriod,
    baseAmount: n(p.baseAmount),
    additions: n(p.additions),
    deductions: n(p.deductions),
    netAmount: n(p.netAmount),
    paidAmount: n(p.paidAmount),
    remainingAmount: n(p.remainingAmount),
    status: p.status,
    notes: p.notes,
    cancelReason: p.cancelReason,
    lines: (Array.isArray(p.breakdown) ? p.breakdown : []) as unknown as SalaryLine[],
    payments: p.payments.map((x) => ({
      id: x.id,
      amount: n(x.amount),
      paymentMethod: x.paymentMethod,
      paymentDate: ymd(x.paymentDate),
      transactionId: x.transactionId,
      referenceNumber: x.referenceNumber,
      notes: x.notes,
      expenseId: x.expenseId,
      recordedBy: x.recordedById ? recorderName.get(x.recordedById) ?? null : null,
      createdAt: x.createdAt,
    })),
  };
}

/** Read-only salary history of one teacher (the teacher themself, or Owner/Admin/Staff within branch scope). */
export async function listTeacherSalaryHistory(coachingCenterId: string, user: SessionUser, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND: Teacher not found in this coaching center');
  if (user.role === 'TEACHER') {
    if (teacher.userId !== user.userId) throw new Error('FORBIDDEN_TEACHER_SCOPE');
  } else {
    assertFinance(user, 'salary.read');
  }

  const rows = await prisma.salaryPayable.findMany({
    where: {
      coachingCenterId,
      teacherId,
      status: { not: 'CANCELLED' },
      ...(user.role !== 'TEACHER' && user.role !== 'OWNER' && user.branchId ? { branchId: user.branchId } : {}),
    },
    include: { salaryPeriod: { select: { year: true, month: true } } },
    orderBy: [{ salaryPeriod: { year: 'desc' } }, { salaryPeriod: { month: 'desc' } }],
    take: 60,
  });
  return rows.map((p) => ({
    id: p.id,
    year: p.salaryPeriod.year,
    month: p.salaryPeriod.month,
    netAmount: n(p.netAmount),
    paidAmount: n(p.paidAmount),
    remainingAmount: n(p.remainingAmount),
    status: p.status,
    lines: (Array.isArray(p.breakdown) ? p.breakdown : []) as unknown as SalaryLine[],
  }));
}

// ---------------------------------------------------------------------------
// Lifecycle: finalize / cancel
// ---------------------------------------------------------------------------

async function settlePeriodIfComplete(tx: Prisma.TransactionClient, salaryPeriodId: string) {
  const open = await tx.salaryPayable.count({ where: { salaryPeriodId, status: { in: ['UNPAID', 'PARTIAL'] } } });
  const total = await tx.salaryPayable.count({ where: { salaryPeriodId, status: 'PAID' } });
  if (open === 0 && total > 0) {
    await tx.salaryPeriod.updateMany({ where: { id: salaryPeriodId, status: 'FINALIZED' }, data: { status: 'PAID' } });
  }
}

export async function finalizeSalaryPeriod(coachingCenterId: string, user: SessionUser, periodId: string) {
  assertManager(user, 'salary.finalize');
  const period = await prisma.salaryPeriod.findFirst({ where: { id: periodId, coachingCenterId } });
  if (!period) throw new Error('SALARY_PERIOD_NOT_FOUND');
  assertBranchAccess(user, period.branchId);

  const count = await prisma.salaryPayable.count({ where: { salaryPeriodId: periodId, status: { not: 'CANCELLED' } } });
  if (count === 0) throw new Error('SALARY_PERIOD_EMPTY: generate salary before finalizing');

  const claimed = await prisma.salaryPeriod.updateMany({
    where: { id: periodId, coachingCenterId, status: 'OPEN' },
    data: { status: 'FINALIZED', finalizedById: user.userId, finalizedAt: new Date() },
  });
  if (claimed.count !== 1) throw new Error('SALARY_PERIOD_LOCKED: this salary period is already finalized');

  await prisma.$transaction((tx) => settlePeriodIfComplete(tx, periodId));
  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'SALARY_FINALIZED',
    entity: 'SalaryPeriod',
    entityId: periodId,
    details: { branchId: period.branchId, year: period.year, month: period.month, payables: count },
  });
  return prisma.salaryPeriod.findUniqueOrThrow({ where: { id: periodId } });
}

export async function cancelSalaryPayable(coachingCenterId: string, user: SessionUser, payableId: string, reason: string) {
  assertManager(user, 'salary.cancel');
  const p = await prisma.salaryPayable.findFirst({ where: { id: payableId, coachingCenterId } });
  if (!p) throw new Error('SALARY_PAYABLE_NOT_FOUND');
  assertBranchAccess(user, p.branchId);

  // Only an untouched payable can be cancelled; the guard lives in the WHERE so a
  // concurrent payment cannot slip in between the check and the write.
  const claimed = await prisma.salaryPayable.updateMany({
    where: { id: payableId, coachingCenterId, status: 'UNPAID', paidAmount: 0 },
    data: { status: 'CANCELLED', cancelReason: reason, cancelledById: user.userId, cancelledAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new Error('SALARY_CANNOT_CANCEL: only an unpaid salary with no payments can be cancelled');
  }
  await prisma.$transaction((tx) => settlePeriodIfComplete(tx, p.salaryPeriodId));

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'SALARY_CANCELLED',
    entity: 'SalaryPayable',
    entityId: payableId,
    details: { teacherId: p.teacherId, salaryPeriodId: p.salaryPeriodId, netAmount: n(p.netAmount), reason },
  });
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

async function ensureSalaryCategory(coachingCenterId: string): Promise<string> {
  const where = { coachingCenterId_code: { coachingCenterId, code: TEACHER_SALARY_CATEGORY_CODE } };
  const found = await prisma.expenseCategory.findUnique({ where });
  if (found) return found.id;
  try {
    const created = await prisma.expenseCategory.create({
      data: { coachingCenterId, code: TEACHER_SALARY_CATEGORY_CODE, name: 'Teacher Salary', banglaName: 'শিক্ষক বেতন' },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.expenseCategory.findUniqueOrThrow({ where });
      return winner.id;
    }
    throw error;
  }
}

/**
 * Record a manual salary payment (full or partial) and its Expense in ONE
 * transaction. The remaining balance is decremented by a conditional
 * `updateMany` whose WHERE re-checks `remainingAmount >= amount`, so two
 * simultaneous requests can never overpay — whichever commits second matches
 * zero rows and is rejected (the DB CHECK constraints are the last backstop).
 */
export async function recordSalaryPayment(
  coachingCenterId: string,
  user: SessionUser,
  payableId: string,
  input: SalaryPaymentInput
) {
  assertFinance(user, 'salary.pay');
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  const payable = await prisma.salaryPayable.findFirst({
    where: { id: payableId, coachingCenterId },
    include: {
      teacher: { select: { id: true, name: true } },
      salaryPeriod: { select: { year: true, month: true } },
    },
  });
  if (!payable) throw new Error('SALARY_PAYABLE_NOT_FOUND');
  assertBranchAccess(user, payable.branchId);

  if (idempotencyKey) {
    const existing = await prisma.salaryPayment.findFirst({ where: { coachingCenterId, salaryPayableId: payableId, idempotencyKey } });
    if (existing) return { payment: existing, idempotentReplay: true as const };
  }

  if (payable.status === 'CANCELLED') throw new Error('SALARY_CANCELLED: this salary was cancelled');
  if (payable.status === 'PAID') throw new Error('SALARY_ALREADY_PAID: this salary is already fully paid');

  const amountCents = cents(input.amount);
  if (amountCents > cents(n(payable.remainingAmount))) {
    throw new Error('SALARY_OVERPAYMENT: payment is more than the remaining salary');
  }

  const today = getCurrentDhakaDateString();
  const paymentDate = input.paymentDate ?? today;
  if (paymentDate > today) throw new Error('INVALID_PAYMENT_DATE: payment date cannot be in the future');

  if (input.paymentMethod === 'CASH') {
    // A closed cash session is never recomputed (Phase 10.9), so cash cannot be back-dated into one.
    const session = await prisma.cashSession.findUnique({
      where: { coachingCenterId_branchId_businessDate: { coachingCenterId, branchId: payable.branchId, businessDate: toDateOnly(paymentDate) } },
      select: { status: true },
    });
    if (session?.status === 'CLOSED') {
      throw new Error('SALARY_CASH_SESSION_CLOSED: the cash session for that date is already closed — use today\'s date');
    }
  }

  const categoryId = await ensureSalaryCategory(coachingCenterId);

  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const guarded = await tx.salaryPayable.updateMany({
        where: { id: payableId, coachingCenterId, status: { in: ['UNPAID', 'PARTIAL'] }, remainingAmount: { gte: input.amount } },
        data: { paidAmount: { increment: input.amount }, remainingAmount: { decrement: input.amount } },
      });
      if (guarded.count === 0) throw new Error('SALARY_OVERPAYMENT: payment is more than the remaining salary');

      const refreshed = await tx.salaryPayable.findUniqueOrThrow({ where: { id: payableId } });
      const fullyPaid = n(refreshed.remainingAmount) <= 0;
      await tx.salaryPayable.update({ where: { id: payableId }, data: { status: fullyPaid ? 'PAID' : 'PARTIAL' } });
      if (fullyPaid) await settlePeriodIfComplete(tx, payable.salaryPeriodId);

      const expense = await tx.expense.create({
        data: {
          coachingCenterId,
          branchId: payable.branchId,
          categoryId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paidTo: payable.teacher.name,
          invoiceNo: input.referenceNumber?.trim() || input.transactionId?.trim() || null,
          date: toDateOnly(paymentDate),
          notes: `Salary ${payable.salaryPeriod.year}-${String(payable.salaryPeriod.month).padStart(2, '0')}`,
          createdById: user.userId,
        },
      });

      return tx.salaryPayment.create({
        data: {
          coachingCenterId,
          branchId: payable.branchId,
          salaryPayableId: payableId,
          teacherId: payable.teacherId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDate: toDateOnly(paymentDate),
          transactionId: input.transactionId?.trim() || null,
          referenceNumber: input.referenceNumber?.trim() || null,
          notes: input.notes?.trim() || null,
          recordedById: user.userId,
          idempotencyKey,
          expenseId: expense.id,
        },
      });
    }, { timeout: 20000, maxWait: 10000 });
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.salaryPayment.findFirst({ where: { coachingCenterId, salaryPayableId: payableId, idempotencyKey } });
      if (winner) return { payment: winner, idempotentReplay: true as const };
    }
    throw error;
  }

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'SALARY_PAYMENT_CREATED',
    entity: 'SalaryPayment',
    entityId: payment.id,
    details: {
      salaryPayableId: payableId,
      teacherId: payable.teacherId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      paymentDate,
      expenseId: payment.expenseId,
      remainingBefore: n(payable.remainingAmount),
    },
  });

  return { payment, idempotentReplay: false as const };
}
