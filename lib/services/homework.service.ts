import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { assertTeacherSubjectAccess, getTeacherAuthorizedBatchSubjectPairs } from './exam-result.service';
import { notifyStudentGuardians } from './guardian-notify.service';
import { mapWithConcurrency } from '@/lib/utils/concurrency';
import type {
  CreateHomeworkInput,
  HomeworkFilterParams,
  ReviewSubmissionInput,
  SubmitHomeworkInput,
  UpdateHomeworkInput,
} from '@/lib/validations/homework';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ------------------------------------------------------------------
// Scope & authorization (mirrors study-material.service.ts)
// ------------------------------------------------------------------

export interface HomeworkScope {
  coachingCenterId: string;
  user: SessionUser;
  teacherBatchSubjectPairs: { batchId: string; subjectId: string }[] | null;
}

export async function resolveHomeworkScope(coachingCenterId: string, user: SessionUser): Promise<HomeworkScope> {
  return { coachingCenterId, user, teacherBatchSubjectPairs: await getTeacherAuthorizedBatchSubjectPairs(coachingCenterId, user) };
}

function isBranchScoped(user: SessionUser) {
  return user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
}

/**
 * The exact (batch, subject) combinations the current user may author
 * homework for — every ACTIVE BatchTeacherAssignment in scope (a teacher's
 * own; every one in-branch for staff). Homework.teacherId is always
 * resolved from this same table, so a combo not listed here would be
 * rejected by resolveHomeworkContext anyway — this just surfaces the valid
 * choices up front instead of letting the form offer a dead end.
 */
export async function getHomeworkAuthoringOptions(coachingCenterId: string, user: SessionUser) {
  const where: Prisma.BatchTeacherAssignmentWhereInput = { coachingCenterId, status: 'ACTIVE' };
  if (user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findFirst({ where: { coachingCenterId, userId: user.userId } });
    if (!teacher) return { assignments: [] };
    where.teacherId = teacher.id;
  }
  if (isBranchScoped(user)) where.branchId = user.branchId!;

  const rows = await prisma.batchTeacherAssignment.findMany({
    where,
    select: {
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      subject: { select: { id: true, name: true, banglaName: true, code: true } },
    },
    orderBy: [{ batch: { name: 'asc' } }],
  });

  // distinct() on a relation-select isn't supported the same way across
  // Prisma providers here — dedupe (batch, subject) pairs in JS instead.
  const seen = new Set<string>();
  const assignments = rows.filter((r) => {
    const key = `${r.batch.id}:${r.subject.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { assignments };
}

function homeworkVisibilityWhere(scope: HomeworkScope): Prisma.HomeworkWhereInput {
  const and: Prisma.HomeworkWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (isBranchScoped(scope.user)) and.push({ branchId: scope.user.branchId! });
  if (scope.teacherBatchSubjectPairs) {
    // Batch+subject scoped, not subject-only — a teacher assigned to Math
    // in Batch A must not see Math homework in Batch B just because the
    // subject matches.
    const or = scope.teacherBatchSubjectPairs.map((p) => ({ batchId: p.batchId, subjectId: p.subjectId }));
    and.push(or.length ? { OR: or } : { id: { in: [] } });
  }
  return { AND: and };
}

/**
 * A teacher may only author homework for a batch+subject they are actively
 * assigned to teach — reuses the Phase 6 helper (BatchTeacherAssignment),
 * same as study-material.service.ts's assertSubjectAuthorized.
 */
async function assertHomeworkSubjectAuthorized(scope: HomeworkScope, batchId: string, subjectId: string) {
  if (!scope.teacherBatchSubjectPairs) return;
  try {
    await assertTeacherSubjectAccess(scope.coachingCenterId, scope.user, batchId, subjectId);
  } catch {
    throw new Error('HOMEWORK_ACCESS_DENIED: you are not assigned to teach this subject in this batch');
  }
}

function assertCanModify(scope: HomeworkScope, hw: { createdById: string | null; branchId: string }) {
  const { user } = scope;
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (isBranchScoped(user) && hw.branchId !== user.branchId) throw new Error('HOMEWORK_ACCESS_DENIED');
  if (user.role === 'STAFF') return;
  if (user.role === 'TEACHER' && hw.createdById === user.userId) return;
  throw new Error('HOMEWORK_ACCESS_DENIED: teachers may only manage their own homework');
}

/**
 * Resolves batch/subject/teacher context for a create or update: the batch
 * must exist in this tenant, the subject must actually be offered by that
 * batch, the caller must be authorized to teach it, and the homework is
 * attributed to whichever teacher currently holds the ACTIVE
 * BatchTeacherAssignment for that batch+subject (the assigned teacher of
 * record — never a client-supplied teacherId, and never guessed for a
 * staff caller: if no teacher is assigned yet, creation is rejected).
 */
async function resolveHomeworkContext(scope: HomeworkScope, input: { batchId: string; subjectId: string }) {
  const { coachingCenterId } = scope;
  const batch = await prisma.batch.findFirst({
    where: { id: input.batchId, coachingCenterId },
    select: { id: true, branchId: true },
  });
  if (!batch) throw new Error('INVALID_ACADEMIC_CONTEXT: batch not found');

  const batchSubject = await prisma.batchSubject.findFirst({
    where: { batchId: input.batchId, subjectId: input.subjectId, status: 'ACTIVE' },
  });
  if (!batchSubject) throw new Error('INVALID_ACADEMIC_CONTEXT: subject is not offered in this batch');

  await assertHomeworkSubjectAuthorized(scope, input.batchId, input.subjectId);
  assertBranchAccess(scope.user, batch.branchId);

  const assignment = await prisma.batchTeacherAssignment.findFirst({
    where: { coachingCenterId, batchId: input.batchId, subjectId: input.subjectId, status: 'ACTIVE' },
    select: { teacherId: true },
  });
  if (!assignment) throw new Error('INVALID_ACADEMIC_CONTEXT: no teacher is assigned to this subject in this batch');

  return { branchId: batch.branchId, teacherId: assignment.teacherId };
}

const detailInclude = {
  batch: { select: { id: true, name: true, banglaName: true, code: true } },
  subject: { select: { id: true, name: true, banglaName: true, code: true } },
  teacher: { select: { id: true, name: true, banglaName: true } },
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.HomeworkInclude;

async function findVisible(scope: HomeworkScope, homeworkId: string) {
  const hw = await prisma.homework.findFirst({
    where: { AND: [homeworkVisibilityWhere(scope), { id: homeworkId }] },
    include: detailInclude,
  });
  if (!hw) throw new Error('HOMEWORK_NOT_FOUND');
  return hw;
}

// ------------------------------------------------------------------
// Notifications (mirrors notifyMaterialPublished in study-material.service.ts)
// ------------------------------------------------------------------

async function notifyHomeworkPublished(
  coachingCenterId: string,
  hw: { id: string; branchId: string; batchId: string; subjectId: string },
  actorId?: string
) {
  const [subject, batch] = await Promise.all([
    prisma.subject.findUnique({ where: { id: hw.subjectId }, select: { name: true } }),
    prisma.batch.findUnique({ where: { id: hw.batchId }, select: { name: true } }),
  ]);
  const studentIds = (
    await prisma.studentBatch.findMany({
      where: { coachingCenterId, batchId: hw.batchId, status: 'ACTIVE' },
      select: { studentId: true },
    })
  ).map((r) => r.studentId);

  await mapWithConcurrency(studentIds, 10, async (studentId) => {
    await notifyStudentGuardians({
      coachingCenterId,
      branchId: hw.branchId,
      studentId,
      event: 'HOMEWORK_PUBLISHED',
      vars: { subjectName: subject?.name, batchName: batch?.name },
      triggeredById: actorId,
      sourceType: 'Homework',
      sourceId: hw.id,
    });
  });
}

async function notifySubmissionReviewed(
  coachingCenterId: string,
  submission: { id: string; studentId: string },
  hw: { branchId: string; batchId: string; subjectId: string },
  actorId?: string
) {
  const [subject, batch] = await Promise.all([
    prisma.subject.findUnique({ where: { id: hw.subjectId }, select: { name: true } }),
    prisma.batch.findUnique({ where: { id: hw.batchId }, select: { name: true } }),
  ]);
  await notifyStudentGuardians({
    coachingCenterId,
    branchId: hw.branchId,
    studentId: submission.studentId,
    event: 'HOMEWORK_REVIEWED',
    vars: { subjectName: subject?.name, batchName: batch?.name },
    triggeredById: actorId,
    sourceType: 'HomeworkSubmission',
    sourceId: submission.id,
  });
}

// ------------------------------------------------------------------
// Staff queries
// ------------------------------------------------------------------

export async function listHomeworks(scope: HomeworkScope, params: HomeworkFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  const and: Prisma.HomeworkWhereInput[] = [homeworkVisibilityWhere(scope)];
  if (params.status && params.status !== 'all') and.push({ status: params.status });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (params.batchId) and.push({ batchId: params.batchId });
  if (params.subjectId) and.push({ subjectId: params.subjectId });
  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { banglaTitle: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { subject: { name: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.HomeworkWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.homework.count({ where }),
    prisma.homework.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        banglaTitle: true,
        status: true,
        dueAt: true,
        publishedAt: true,
        createdById: true,
        branchId: true,
        batchId: true,
        createdAt: true,
        updatedAt: true,
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
        batch: { select: { id: true, name: true, banglaName: true, code: true } },
        teacher: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Two aggregate queries cover the whole page — no N+1 (AGENTS.md §38).
  const batchIds = [...new Set(rows.map((r) => r.batchId))];
  const homeworkIds = rows.map((r) => r.id);
  const [batchCounts, submissionCounts] = await Promise.all([
    batchIds.length
      ? prisma.studentBatch.groupBy({
          by: ['batchId'],
          where: { coachingCenterId: scope.coachingCenterId, batchId: { in: batchIds }, status: 'ACTIVE' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    homeworkIds.length
      ? prisma.homeworkSubmission.groupBy({ by: ['homeworkId'], where: { homeworkId: { in: homeworkIds } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const totalStudentsByBatch = new Map(batchCounts.map((b) => [b.batchId, b._count._all]));
  const submittedByHomework = new Map(submissionCounts.map((s) => [s.homeworkId, s._count._all]));

  return {
    homeworks: rows.map((r) => {
      let canModify = true;
      try {
        assertCanModify(scope, r);
      } catch {
        canModify = false;
      }
      return {
        ...r,
        canModify,
        totalStudents: totalStudentsByBatch.get(r.batchId) ?? 0,
        submittedCount: submittedByHomework.get(r.id) ?? 0,
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getHomeworkStats(scope: HomeworkScope) {
  const base = homeworkVisibilityWhere(scope);
  const [total, published, draft, closed] = await Promise.all([
    prisma.homework.count({ where: { AND: [base, { status: { not: 'ARCHIVED' } }] } }),
    prisma.homework.count({ where: { AND: [base, { status: 'PUBLISHED' }] } }),
    prisma.homework.count({ where: { AND: [base, { status: 'DRAFT' }] } }),
    prisma.homework.count({ where: { AND: [base, { status: 'CLOSED' }] } }),
  ]);
  return { total, published, draft, closed };
}

export async function getHomeworkById(scope: HomeworkScope, homeworkId: string) {
  const hw = await findVisible(scope, homeworkId);
  let canModify = true;
  try {
    assertCanModify(scope, hw);
  } catch {
    canModify = false;
  }
  const [totalStudents, submissionStats] = await Promise.all([
    prisma.studentBatch.count({ where: { coachingCenterId: scope.coachingCenterId, batchId: hw.batchId, status: 'ACTIVE' } }),
    prisma.homeworkSubmission.groupBy({ by: ['status'], where: { homeworkId }, _count: { _all: true } }),
  ]);
  const statusCounts = Object.fromEntries(submissionStats.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const submittedCount = (statusCounts.SUBMITTED ?? 0) + (statusCounts.LATE ?? 0) + (statusCounts.REVIEWED ?? 0) + (statusCounts.RETURNED ?? 0);
  return { ...hw, canModify, totalStudents, submittedCount, reviewedCount: statusCounts.REVIEWED ?? 0 };
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------

export async function createHomework(scope: HomeworkScope, input: CreateHomeworkInput) {
  const { coachingCenterId, user } = scope;
  const ctx = await resolveHomeworkContext(scope, input);

  const created = await prisma.homework.create({
    data: {
      coachingCenterId,
      branchId: ctx.branchId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: ctx.teacherId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      description: input.description,
      banglaDescription: input.banglaDescription,
      fileUrl: input.fileUrl,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      dueAt: new Date(input.dueAt),
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      createdById: user.userId,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'HOMEWORK_CREATED',
    entity: 'Homework',
    entityId: created.id,
    details: { batchId: created.batchId, subjectId: created.subjectId, status: created.status },
  });
  if (created.status === 'PUBLISHED') {
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'HOMEWORK_PUBLISHED',
      entity: 'Homework',
      entityId: created.id,
      details: { from: null, to: 'PUBLISHED' },
    });
    await notifyHomeworkPublished(coachingCenterId, created, user.userId);
  }

  return getHomeworkById(scope, created.id);
}

export async function updateHomework(scope: HomeworkScope, homeworkId: string, input: UpdateHomeworkInput) {
  const { coachingCenterId, user } = scope;
  const existing = await findVisible(scope, homeworkId);
  assertCanModify(scope, existing);
  if (existing.status === 'ARCHIVED') throw new Error('HOMEWORK_ALREADY_ARCHIVED: restore it before editing');
  if (existing.status === 'CLOSED') throw new Error('HOMEWORK_CLOSED: reopen it (publish) before editing');
  const ctx = await resolveHomeworkContext(scope, input);

  const becomesPublished = input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
  await prisma.homework.update({
    where: { id: homeworkId },
    data: {
      branchId: ctx.branchId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: ctx.teacherId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      description: input.description,
      banglaDescription: input.banglaDescription,
      fileUrl: input.fileUrl,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      dueAt: new Date(input.dueAt),
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : null,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'HOMEWORK_UPDATED',
    entity: 'Homework',
    entityId: homeworkId,
    details: { statusBefore: existing.status, statusAfter: input.status },
  });
  if (becomesPublished) {
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'HOMEWORK_PUBLISHED',
      entity: 'Homework',
      entityId: homeworkId,
      details: { from: existing.status, to: 'PUBLISHED' },
    });
    await notifyHomeworkPublished(coachingCenterId, { id: homeworkId, branchId: ctx.branchId, batchId: input.batchId, subjectId: input.subjectId }, user.userId);
  }

  return getHomeworkById(scope, homeworkId);
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['DRAFT', 'CLOSED', 'ARCHIVED'],
  CLOSED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

/**
 * DRAFT -> PUBLISHED (publish) -> CLOSED (stop accepting submissions,
 * teacher-triggered) or DRAFT (unpublish, blocked once students have
 * submitted) -> ARCHIVED (hide) -> DRAFT (restore).
 */
export async function transitionHomeworkStatus(
  scope: HomeworkScope,
  homeworkId: string,
  target: 'PUBLISHED' | 'DRAFT' | 'CLOSED' | 'ARCHIVED'
) {
  const { coachingCenterId, user } = scope;
  const hw = await findVisible(scope, homeworkId);
  assertCanModify(scope, hw);

  if (hw.status === target) {
    throw new Error(target === 'ARCHIVED' ? 'HOMEWORK_ALREADY_ARCHIVED' : `INVALID_TRANSITION: homework is already ${target}`);
  }
  if (!ALLOWED_TRANSITIONS[hw.status]?.includes(target)) {
    throw new Error(`INVALID_TRANSITION: cannot move homework from ${hw.status} to ${target}`);
  }
  if (target === 'DRAFT' && hw.status === 'PUBLISHED') {
    const submissionCount = await prisma.homeworkSubmission.count({ where: { homeworkId } });
    if (submissionCount > 0) {
      throw new Error('HOMEWORK_HAS_SUBMISSIONS: unpublish is blocked once students have submitted — close it instead');
    }
  }

  await prisma.homework.update({
    where: { id: homeworkId },
    data: {
      status: target,
      publishedAt: target === 'PUBLISHED' ? (hw.publishedAt ?? new Date()) : target === 'DRAFT' ? null : hw.publishedAt,
      updatedById: user.userId,
    },
  });

  const action =
    target === 'PUBLISHED'
      ? 'HOMEWORK_PUBLISHED'
      : target === 'CLOSED'
        ? 'HOMEWORK_CLOSED'
        : target === 'ARCHIVED'
          ? 'HOMEWORK_ARCHIVED'
          : hw.status === 'ARCHIVED'
            ? 'HOMEWORK_RESTORED'
            : 'HOMEWORK_UNPUBLISHED';

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action,
    entity: 'Homework',
    entityId: homeworkId,
    details: { from: hw.status, to: target },
  });

  if (target === 'PUBLISHED') {
    await notifyHomeworkPublished(coachingCenterId, hw, user.userId);
  }

  return { id: homeworkId, status: target };
}

export async function deleteHomework(scope: HomeworkScope, homeworkId: string) {
  const { coachingCenterId, user } = scope;
  const hw = await findVisible(scope, homeworkId);
  assertCanModify(scope, hw);
  if (hw.status !== 'DRAFT') throw new Error('HOMEWORK_NOT_DRAFT: only a draft homework can be deleted — archive it instead');
  await prisma.homework.delete({ where: { id: homeworkId } });
  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'HOMEWORK_DELETED',
    entity: 'Homework',
    entityId: homeworkId,
    details: { title: hw.title },
  });
  return { id: homeworkId, deleted: true };
}

// ------------------------------------------------------------------
// Teacher: submission roster & review
// ------------------------------------------------------------------

export async function listHomeworkSubmissions(scope: HomeworkScope, homeworkId: string) {
  const hw = await findVisible(scope, homeworkId);
  const [batchStudents, submissions] = await Promise.all([
    prisma.studentBatch.findMany({
      where: { coachingCenterId: scope.coachingCenterId, batchId: hw.batchId, status: 'ACTIVE' },
      select: { student: { select: { id: true, name: true, banglaName: true, studentIdCode: true } } },
      orderBy: { student: { name: 'asc' } },
    }),
    prisma.homeworkSubmission.findMany({
      where: { homeworkId },
      select: {
        id: true,
        studentId: true,
        status: true,
        submittedAt: true,
        isLate: true,
        content: true,
        fileUrl: true,
        feedback: true,
        reviewedAt: true,
      },
    }),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));

  return {
    homework: hw,
    roster: batchStudents.map(({ student }) => ({
      student,
      submission: byStudent.get(student.id) ?? null,
      status: byStudent.get(student.id)?.status ?? 'NOT_SUBMITTED',
    })),
  };
}

export async function reviewSubmission(
  scope: HomeworkScope,
  homeworkId: string,
  submissionId: string,
  input: ReviewSubmissionInput
) {
  const { coachingCenterId, user } = scope;
  const hw = await findVisible(scope, homeworkId);
  assertCanModify(scope, hw);

  const submission = await prisma.homeworkSubmission.findFirst({ where: { id: submissionId, homeworkId } });
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');

  const data: Prisma.HomeworkSubmissionUpdateInput = {};
  if (input.feedback !== undefined) data.feedback = input.feedback || null;
  if (input.status) {
    data.status = input.status;
    data.reviewedAt = new Date();
    data.reviewedBy = { connect: { id: user.userId } };
  }

  const updated = await prisma.homeworkSubmission.update({ where: { id: submissionId }, data });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'HOMEWORK_SUBMISSION_REVIEWED',
    entity: 'HomeworkSubmission',
    entityId: submissionId,
    details: { homeworkId, statusBefore: submission.status, statusAfter: updated.status, feedbackChanged: input.feedback !== undefined },
  });

  if (input.status === 'REVIEWED' || input.status === 'RETURNED') {
    await notifySubmissionReviewed(coachingCenterId, { id: submission.id, studentId: submission.studentId }, hw, user.userId);
  }

  return updated;
}

// ------------------------------------------------------------------
// Student / guardian portal
// ------------------------------------------------------------------

export interface PortalHomeworkParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

async function activeBatchIdsForStudent(coachingCenterId: string, studentId: string): Promise<string[]> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    select: { studentBatches: { where: { status: 'ACTIVE' }, select: { batchId: true } } },
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  return student.studentBatches.map((sb) => sb.batchId);
}

/**
 * PUBLISHED/CLOSED homework relevant to one student — resolved strictly
 * from their own ACTIVE StudentBatch memberships (never a client-supplied
 * batchId). A student who has left a batch loses visibility into its
 * homework going forward, matching the existing StudyMaterial precedent
 * (no historical carryover) — AGENTS.md Phase 10.7 §9.
 */
// A student's own relevant-homework set (bounded by their batches, not the
// whole tenant) is small enough to page and status-filter in memory —
// `computedStatus` (UPCOMING/DUE_SOON vs the stored submission status) has
// no DB column to filter on, and inventing one just for this list isn't
// worth it (AGENTS.md §40: no feature creep).
const STUDENT_HOMEWORK_CAP = 300;

export async function getStudentPortalHomeworks(coachingCenterId: string, studentId: string, params: PortalHomeworkParams = {}) {
  const batchIds = await activeBatchIdsForStudent(coachingCenterId, studentId);
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  if (batchIds.length === 0) {
    return { homeworks: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };
  }

  const where: Prisma.HomeworkWhereInput = {
    AND: [{ coachingCenterId }, { batchId: { in: batchIds } }, { status: { in: ['PUBLISHED', 'CLOSED'] } }],
  };

  const rows = await prisma.homework.findMany({
    where,
    take: STUDENT_HOMEWORK_CAP,
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      banglaTitle: true,
      description: true,
      banglaDescription: true,
      fileUrl: true,
      dueAt: true,
      publishedAt: true,
      status: true,
      subject: { select: { id: true, name: true, banglaName: true, code: true } },
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      teacher: { select: { id: true, name: true, banglaName: true } },
      submissions: { where: { studentId }, select: { status: true, submittedAt: true, isLate: true, feedback: true, reviewedAt: true } },
    },
  });

  const now = Date.now();
  const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;
  let all = rows.map(({ submissions, ...r }) => {
    const submission = submissions[0] ?? null;
    const computedStatus = submission
      ? submission.status
      : new Date(r.dueAt).getTime() - now > DUE_SOON_WINDOW_MS
        ? 'UPCOMING'
        : 'DUE_SOON';
    return { ...r, submission, computedStatus };
  });

  if (params.status && params.status !== 'all') {
    all = all.filter((h) => h.computedStatus === params.status);
  }

  const total = all.length;
  const homeworks = all.slice((page - 1) * pageSize, page * pageSize);

  return { homeworks, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function getStudentPortalHomeworkDetail(coachingCenterId: string, studentId: string, homeworkId: string) {
  const batchIds = await activeBatchIdsForStudent(coachingCenterId, studentId);
  const hw = await prisma.homework.findFirst({
    where: { id: homeworkId, coachingCenterId, batchId: { in: batchIds.length ? batchIds : ['__none__'] }, status: { in: ['PUBLISHED', 'CLOSED'] } },
    select: {
      id: true,
      title: true,
      banglaTitle: true,
      description: true,
      banglaDescription: true,
      fileUrl: true,
      dueAt: true,
      publishedAt: true,
      status: true,
      subject: { select: { id: true, name: true, banglaName: true, code: true } },
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      teacher: { select: { id: true, name: true, banglaName: true } },
      submissions: {
        where: { studentId },
        select: { id: true, status: true, submittedAt: true, isLate: true, content: true, fileUrl: true, feedback: true, reviewedAt: true },
      },
    },
  });
  if (!hw) throw new Error('HOMEWORK_NOT_FOUND');
  const { submissions, ...rest } = hw;
  return { ...rest, submission: submissions[0] ?? null };
}

export async function submitHomework(coachingCenterId: string, studentId: string, homeworkId: string, input: SubmitHomeworkInput) {
  const batchIds = await activeBatchIdsForStudent(coachingCenterId, studentId);
  const hw = await prisma.homework.findFirst({
    where: { id: homeworkId, coachingCenterId, batchId: { in: batchIds.length ? batchIds : ['__none__'] } },
    select: { id: true, status: true, dueAt: true },
  });
  if (!hw) throw new Error('HOMEWORK_NOT_FOUND');
  if (hw.status !== 'PUBLISHED') throw new Error('HOMEWORK_NOT_OPEN: this homework is not open for submission');

  const isLate = Date.now() > new Date(hw.dueAt).getTime();
  const status = isLate ? 'LATE' : 'SUBMITTED';

  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
  });
  if (existing?.status === 'REVIEWED') {
    throw new Error('SUBMISSION_ALREADY_REVIEWED: this submission has already been reviewed by your teacher');
  }

  let submission;
  let isResubmission = !!existing;
  if (!existing) {
    try {
      submission = await prisma.homeworkSubmission.create({
        data: { coachingCenterId, homeworkId, studentId, content: input.content, fileUrl: input.fileUrl, status, isLate, submittedAt: new Date() },
      });
    } catch (err) {
      // Concurrent double-click/retry race: another request created the row
      // first — fall back to the update path for a single, idempotent result.
      if (!isUniqueConstraintError(err)) throw err;
      isResubmission = true;
      submission = await prisma.homeworkSubmission.update({
        where: { homeworkId_studentId: { homeworkId, studentId } },
        data: { content: input.content, fileUrl: input.fileUrl, status, isLate, submittedAt: new Date(), reviewedAt: null, reviewedById: null },
      });
    }
  } else {
    submission = await prisma.homeworkSubmission.update({
      where: { id: existing.id },
      data: { content: input.content, fileUrl: input.fileUrl, status, isLate, submittedAt: new Date(), reviewedAt: null, reviewedById: null },
    });
  }

  await recordAuditLog({
    coachingCenterId,
    studentId,
    action: isResubmission ? 'HOMEWORK_SUBMISSION_UPDATED' : 'HOMEWORK_SUBMISSION_CREATED',
    entity: 'HomeworkSubmission',
    entityId: submission.id,
    details: { homeworkId, status, isLate },
  });

  return submission;
}
