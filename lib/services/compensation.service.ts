import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { getCurrentDhakaDateString, toDateOnly } from '@/lib/schedule';
import { recordAuditLog } from './audit.service';
import type { CompensationCreateInput, CompensationUpdateInput, CompensationType } from '@/lib/validations/salary';

/**
 * Phase 13 — teacher compensation rules.
 *
 * A rule is never silently rewritten once salary was generated from it:
 *  - type / teacher / assignment are immutable (change the pay model = end the
 *    old rule and add a new one);
 *  - amount and start date are locked once any SalaryPayable references the rule;
 *  - overlapping rules in the same "scope" are rejected (see scopeKey).
 * Generated salary keeps its own snapshot, so even a later edit can never
 * change history.
 */

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

export function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const needsAssignment = (type: string) => type === 'PER_BATCH' || type === 'PER_CLASS';

/**
 * Two rules of the same scope must never be in force on the same day:
 *  - MONTHLY_FIXED          one per teacher
 *  - CUSTOM                 one per teacher
 *  - PER_BATCH / PER_CLASS  one pay model per teaching assignment (so the same
 *                           batch+subject can never be paid twice)
 */
export function scopeKey(type: string, assignmentId: string | null | undefined): string {
  return needsAssignment(type) ? `ASSIGNMENT:${assignmentId}` : type;
}

/** Inclusive date ranges as YYYY-MM-DD strings; null end = open-ended. */
export function rangesOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  return aFrom <= (bTo ?? '9999-12-31') && bFrom <= (aTo ?? '9999-12-31');
}

function assertManager(user: SessionUser) {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('COMPENSATION_ACCESS_DENIED: only Owner or Admin can manage teacher compensation');
  }
}

async function loadTeacher(coachingCenterId: string, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND: Teacher not found in this coaching center');
  return teacher;
}

const compensationInclude = {
  assignment: {
    select: {
      id: true,
      status: true,
      batch: {
        select: {
          id: true,
          name: true,
          banglaName: true,
          course: { select: { id: true, name: true, banglaName: true } },
        },
      },
      subject: { select: { id: true, name: true, banglaName: true } },
    },
  },
  branch: { select: { id: true, name: true, banglaName: true } },
} satisfies Prisma.TeacherCompensationInclude;

type CompensationRow = Prisma.TeacherCompensationGetPayload<{ include: typeof compensationInclude }>;

export type CompensationPhase = 'CURRENT' | 'UPCOMING' | 'EXPIRED';

function serialize(row: CompensationRow, today: string) {
  const from = ymd(row.effectiveFrom);
  const to = row.effectiveTo ? ymd(row.effectiveTo) : null;
  const phase: CompensationPhase = from > today ? 'UPCOMING' : to && to < today ? 'EXPIRED' : 'CURRENT';
  return {
    id: row.id,
    teacherId: row.teacherId,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    type: row.type as CompensationType,
    amount: n(row.amount),
    assignmentId: row.batchTeacherAssignmentId,
    assignment: row.assignment
      ? {
          course: row.assignment.batch.course
            ? { id: row.assignment.batch.course.id, name: row.assignment.batch.course.name, banglaName: row.assignment.batch.course.banglaName }
            : null,
          batch: { id: row.assignment.batch.id, name: row.assignment.batch.name, banglaName: row.assignment.batch.banglaName },
          subject: { id: row.assignment.subject.id, name: row.assignment.subject.name, banglaName: row.assignment.subject.banglaName },
          status: row.assignment.status,
        }
      : null,
    effectiveFrom: from,
    effectiveTo: to,
    status: row.status,
    phase,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

/** Compensation ids that a generated (non-cancelled) SalaryPayable was calculated from, with the latest period month. */
async function usageByCompensation(coachingCenterId: string, teacherId: string): Promise<Map<string, string>> {
  const payables = await prisma.salaryPayable.findMany({
    where: { coachingCenterId, teacherId, status: { not: 'CANCELLED' } },
    select: { breakdown: true, salaryPeriod: { select: { year: true, month: true } } },
  });
  const used = new Map<string, string>(); // compensationId -> latest "YYYY-MM-01"
  for (const p of payables) {
    const monthStart = `${p.salaryPeriod.year}-${String(p.salaryPeriod.month).padStart(2, '0')}-01`;
    const lines = Array.isArray(p.breakdown) ? (p.breakdown as Array<{ compensationId?: string }>) : [];
    for (const line of lines) {
      if (!line.compensationId) continue;
      const prev = used.get(line.compensationId);
      if (!prev || monthStart > prev) used.set(line.compensationId, monthStart);
    }
  }
  return used;
}

/**
 * Read access: OWNER/ADMIN (branch-scoped rules for branch-locked admins) or a
 * TEACHER looking at their own profile. STAFF and other teachers get nothing.
 */
export async function listTeacherCompensation(coachingCenterId: string, user: SessionUser, teacherId: string) {
  const teacher = await loadTeacher(coachingCenterId, teacherId);

  if (user.role === 'TEACHER') {
    if (teacher.userId !== user.userId) throw new Error('FORBIDDEN_TEACHER_SCOPE');
  } else if (user.role === 'OWNER' || user.role === 'ADMIN') {
    if (teacher.branchId) assertBranchAccess(user, teacher.branchId);
  } else {
    throw new Error('COMPENSATION_ACCESS_DENIED: not allowed to view teacher compensation');
  }

  const rows = await prisma.teacherCompensation.findMany({
    where: {
      coachingCenterId,
      teacherId,
      // A branch-locked admin only sees rules of their own branch.
      ...(user.role === 'ADMIN' && user.branchId ? { branchId: user.branchId } : {}),
    },
    include: compensationInclude,
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  const today = getCurrentDhakaDateString();
  const items = rows.map((r) => serialize(r, today));
  return {
    current: items.filter((i) => i.phase === 'CURRENT'),
    upcoming: items.filter((i) => i.phase === 'UPCOMING'),
    history: items.filter((i) => i.phase === 'EXPIRED'),
  };
}

async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  coachingCenterId: string,
  teacherId: string,
  type: string,
  assignmentId: string | null,
  from: string,
  to: string | null,
  excludeId?: string
) {
  const key = scopeKey(type, assignmentId);
  const others = await tx.teacherCompensation.findMany({
    where: { coachingCenterId, teacherId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, type: true, batchTeacherAssignmentId: true, effectiveFrom: true, effectiveTo: true },
  });
  for (const o of others) {
    if (scopeKey(o.type, o.batchTeacherAssignmentId) !== key) continue;
    if (rangesOverlap(from, to, ymd(o.effectiveFrom), o.effectiveTo ? ymd(o.effectiveTo) : null)) {
      throw new Error('COMPENSATION_OVERLAP: this teacher already has a rule for the same scope that overlaps these dates — end it first');
    }
  }
}

export async function createCompensation(
  coachingCenterId: string,
  user: SessionUser,
  teacherId: string,
  input: CompensationCreateInput
) {
  assertManager(user);
  const teacher = await loadTeacher(coachingCenterId, teacherId);
  if (teacher.branchId) assertBranchAccess(user, teacher.branchId);

  let branchId: string;
  let assignmentId: string | null = null;

  if (needsAssignment(input.type)) {
    // The assignment must be this teacher's own, in this tenant — never a client-supplied batch/subject.
    const assignment = await prisma.batchTeacherAssignment.findFirst({
      where: { id: input.assignmentId, teacherId, coachingCenterId },
    });
    if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND: that teaching assignment does not belong to this teacher');
    if (assignment.status !== 'ACTIVE') throw new Error('ASSIGNMENT_NOT_ACTIVE: that teaching assignment has ended');
    branchId = assignment.branchId;
    assignmentId = assignment.id;
  } else {
    const requested = teacher.branchId ?? input.branchId;
    if (!requested) throw new Error('BRANCH_REQUIRED: this teacher has no home branch — choose the branch that pays this salary');
    const branch = await prisma.branch.findFirst({ where: { id: requested, coachingCenterId } });
    if (!branch) throw new Error('BRANCH_NOT_FOUND');
    branchId = branch.id;
  }
  assertBranchAccess(user, branchId);

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comp:' + teacherId})::bigint)`;
    await assertNoOverlap(tx, coachingCenterId, teacherId, input.type, assignmentId, input.effectiveFrom, input.effectiveTo ?? null);
    return tx.teacherCompensation.create({
      data: {
        coachingCenterId,
        branchId,
        teacherId,
        type: input.type,
        amount: input.amount,
        batchTeacherAssignmentId: assignmentId,
        effectiveFrom: toDateOnly(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? toDateOnly(input.effectiveTo) : null,
        notes: input.notes?.trim() || null,
        createdById: user.userId,
        updatedById: user.userId,
      },
      include: compensationInclude,
    });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'TEACHER_COMPENSATION_CREATED',
    entity: 'TeacherCompensation',
    entityId: created.id,
    details: {
      teacherId,
      type: input.type,
      amount: input.amount,
      assignmentId,
      branchId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    },
  });

  return serialize(created, getCurrentDhakaDateString());
}

async function loadOwnedCompensation(coachingCenterId: string, user: SessionUser, teacherId: string, compensationId: string) {
  assertManager(user);
  const existing = await prisma.teacherCompensation.findFirst({
    where: { id: compensationId, teacherId, coachingCenterId },
    include: compensationInclude,
  });
  if (!existing) throw new Error('COMPENSATION_NOT_FOUND');
  assertBranchAccess(user, existing.branchId);
  return existing;
}

export async function updateCompensation(
  coachingCenterId: string,
  user: SessionUser,
  teacherId: string,
  compensationId: string,
  input: CompensationUpdateInput
) {
  const existing = await loadOwnedCompensation(coachingCenterId, user, teacherId, compensationId);
  const used = (await usageByCompensation(coachingCenterId, teacherId)).get(compensationId);

  const fromChanged = input.effectiveFrom !== undefined && input.effectiveFrom !== ymd(existing.effectiveFrom);
  const amountChanged = input.amount !== undefined && input.amount !== n(existing.amount);
  if (used && (fromChanged || amountChanged)) {
    throw new Error('COMPENSATION_IN_USE: salary was already generated from this rule — end it and add a new rule instead of changing the amount or start date');
  }

  const from = input.effectiveFrom ?? ymd(existing.effectiveFrom);
  const to = input.effectiveTo === undefined ? (existing.effectiveTo ? ymd(existing.effectiveTo) : null) : input.effectiveTo;
  if (to && to < from) throw new Error('INVALID_DATE_RANGE: end date cannot be before the start date');
  if (used && to && to < used) {
    throw new Error('COMPENSATION_IN_USE: salary was already generated for a month after that end date');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comp:' + teacherId})::bigint)`;
    await assertNoOverlap(tx, coachingCenterId, teacherId, existing.type, existing.batchTeacherAssignmentId, from, to, existing.id);
    return tx.teacherCompensation.update({
      where: { id: compensationId },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        effectiveFrom: toDateOnly(from),
        effectiveTo: to ? toDateOnly(to) : null,
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
        updatedById: user.userId,
      },
      include: compensationInclude,
    });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'TEACHER_COMPENSATION_UPDATED',
    entity: 'TeacherCompensation',
    entityId: compensationId,
    details: {
      teacherId,
      before: { amount: n(existing.amount), effectiveFrom: ymd(existing.effectiveFrom), effectiveTo: existing.effectiveTo ? ymd(existing.effectiveTo) : null },
      after: { amount: n(updated.amount), effectiveFrom: from, effectiveTo: to },
    },
  });

  return serialize(updated, getCurrentDhakaDateString());
}

/**
 * End a rule. A rule that has not started and was never used is simply
 * withdrawn (deleted); anything else keeps its row and gets an end date.
 */
export async function endCompensation(
  coachingCenterId: string,
  user: SessionUser,
  teacherId: string,
  compensationId: string,
  effectiveTo?: string
) {
  const existing = await loadOwnedCompensation(coachingCenterId, user, teacherId, compensationId);
  const today = getCurrentDhakaDateString();
  const from = ymd(existing.effectiveFrom);
  const used = (await usageByCompensation(coachingCenterId, teacherId)).get(compensationId);

  if (from > today && !used) {
    await prisma.teacherCompensation.delete({ where: { id: compensationId } });
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'TEACHER_COMPENSATION_ENDED',
      entity: 'TeacherCompensation',
      entityId: compensationId,
      details: { teacherId, withdrawn: true, type: existing.type, amount: n(existing.amount), effectiveFrom: from },
    });
    return { withdrawn: true as const };
  }

  const end = effectiveTo ?? (today > from ? today : from);
  if (end < from) throw new Error('INVALID_DATE_RANGE: end date cannot be before the start date');
  if (existing.effectiveTo && end > ymd(existing.effectiveTo)) {
    throw new Error('COMPENSATION_ALREADY_ENDED: this rule already ends on or before that date');
  }
  if (used && end < used) throw new Error('COMPENSATION_IN_USE: salary was already generated for a month after that end date');

  const updated = await prisma.teacherCompensation.update({
    where: { id: compensationId },
    data: { effectiveTo: toDateOnly(end), status: 'ENDED', updatedById: user.userId },
    include: compensationInclude,
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'TEACHER_COMPENSATION_ENDED',
    entity: 'TeacherCompensation',
    entityId: compensationId,
    details: {
      teacherId,
      type: existing.type,
      before: { effectiveTo: existing.effectiveTo ? ymd(existing.effectiveTo) : null },
      after: { effectiveTo: end },
    },
  });

  return { withdrawn: false as const, compensation: serialize(updated, today) };
}
