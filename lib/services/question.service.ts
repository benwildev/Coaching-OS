import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { resolveAcademicContext } from './academic.service';
import { getTeacherAuthorizedSubjectIds } from './exam-result.service';
import {
  OPTION_QUESTION_TYPES,
  checkQuestionOptions,
  type CreateQuestionInput,
  type QuestionFilterParams,
  type QuestionType,
  type UpdateQuestionInput,
} from '@/lib/validations/question';

const MANAGER_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

/** Types whose answer key must be present before publication. */
const ANSWER_REQUIRED_TYPES: readonly string[] = ['SHORT', 'FILL_BLANK'];

// ------------------------------------------------------------------
// Access scope
// ------------------------------------------------------------------

export interface QuestionScope {
  coachingCenterId: string;
  user: SessionUser;
  /** null = unrestricted (OWNER/ADMIN/STAFF); array = TEACHER's authorized subjects */
  teacherSubjectIds: string[] | null;
}

export async function resolveQuestionScope(coachingCenterId: string, user: SessionUser): Promise<QuestionScope> {
  return {
    coachingCenterId,
    user,
    teacherSubjectIds: await getTeacherAuthorizedSubjectIds(coachingCenterId, user),
  };
}

function isBranchScoped(user: SessionUser) {
  return user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
}

/**
 * Tenant + branch + teacher-subject visibility filter. Branch-scoped users see
 * their branch's questions plus centre-wide (branchId = null) ones.
 */
export function questionVisibilityWhere(scope: QuestionScope): Prisma.QuestionWhereInput {
  const and: Prisma.QuestionWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (isBranchScoped(scope.user)) {
    and.push({ OR: [{ branchId: scope.user.branchId }, { branchId: null }] });
  }
  if (scope.teacherSubjectIds) {
    and.push({ subjectId: { in: scope.teacherSubjectIds } });
  }
  return { AND: and };
}

export function assertCanUseSubject(scope: QuestionScope, subjectId: string) {
  if (scope.teacherSubjectIds && !scope.teacherSubjectIds.includes(subjectId)) {
    throw new Error('QUESTION_ACCESS_DENIED: you are not assigned to teach this subject');
  }
}

/** OWNER/ADMIN: all; STAFF: own branch or centre-wide; TEACHER: own questions in authorized subjects. */
function assertCanModify(
  scope: QuestionScope,
  q: { createdById: string | null; subjectId: string; branchId: string | null }
) {
  const { user } = scope;
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (isBranchScoped(user) && q.branchId && q.branchId !== user.branchId) {
    throw new Error('QUESTION_ACCESS_DENIED');
  }
  if (user.role === 'STAFF') return;
  if (user.role === 'TEACHER') {
    assertCanUseSubject(scope, q.subjectId);
    if (q.createdById !== user.userId) {
      throw new Error('QUESTION_ACCESS_DENIED: teachers may only modify their own questions');
    }
    return;
  }
  throw new Error('QUESTION_ACCESS_DENIED');
}

export function canManageQuestions(user: SessionUser) {
  return (MANAGER_ROLES as readonly string[]).includes(user.role) || user.role === 'TEACHER';
}

// ------------------------------------------------------------------
// Serialization
// ------------------------------------------------------------------

function toNumber(d: Prisma.Decimal | number | null | undefined) {
  return d === null || d === undefined ? null : Number(d);
}

const detailInclude = {
  options: { orderBy: { order: 'asc' } },
  subject: { select: { id: true, name: true, banglaName: true, code: true } },
  subjectPaper: { select: { id: true, name: true, banglaName: true } },
  academicSession: { select: { id: true, name: true, banglaName: true } },
  academicProgram: { select: { id: true, name: true, banglaName: true } },
  academicClass: { select: { id: true, name: true, banglaName: true } },
  academicGroup: { select: { id: true, name: true, banglaName: true } },
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  _count: { select: { paperItems: true } },
} satisfies Prisma.QuestionInclude;

type QuestionDetailRow = Prisma.QuestionGetPayload<{ include: typeof detailInclude }>;

/**
 * Answer key, correct-option flags and explanations are only included when
 * `includeAnswers` is true — callers decide based on the viewer's role.
 */
export function serializeQuestion(q: QuestionDetailRow, opts: { includeAnswers: boolean; canModify?: boolean }) {
  const { includeAnswers } = opts;
  return {
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    marks: toNumber(q.marks),
    status: q.status,
    chapter: q.chapter,
    questionText: q.questionText,
    banglaQuestionText: q.banglaQuestionText,
    answer: includeAnswers ? q.answer : undefined,
    banglaAnswer: includeAnswers ? q.banglaAnswer : undefined,
    explanation: includeAnswers ? q.explanation : undefined,
    banglaExplanation: includeAnswers ? q.banglaExplanation : undefined,
    options: q.options.map((o) => ({
      id: o.id,
      order: o.order,
      optionText: o.optionText,
      banglaOptionText: o.banglaOptionText,
      ...(includeAnswers ? { isCorrect: o.isCorrect } : {}),
    })),
    subjectId: q.subjectId,
    subjectPaperId: q.subjectPaperId,
    academicSessionId: q.academicSessionId,
    academicProgramId: q.academicProgramId,
    academicClassId: q.academicClassId,
    academicGroupId: q.academicGroupId,
    subject: q.subject,
    subjectPaper: q.subjectPaper,
    academicSession: q.academicSession,
    academicProgram: q.academicProgram,
    academicClass: q.academicClass,
    academicGroup: q.academicGroup,
    branch: q.branch,
    createdBy: q.createdBy,
    updatedBy: q.updatedBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    usedInPapers: q._count.paperItems,
    canModify: opts.canModify,
  };
}

// ------------------------------------------------------------------
// Validation guards
// ------------------------------------------------------------------

/**
 * Publish guard: content, marks, options and answer key must all be valid.
 * Used both on explicit publish and when a question is saved as PUBLISHED.
 */
function assertPublishable(q: {
  type: string;
  questionText: string;
  marks: number;
  answer: string | null;
  banglaAnswer: string | null;
  options: Array<{ optionText: string; isCorrect: boolean }>;
}) {
  if (!q.questionText?.trim()) throw new Error('INVALID_QUESTION: question text is required');
  if (!(q.marks > 0)) throw new Error('INVALID_QUESTION: marks must be greater than 0');
  const optErr = checkQuestionOptions(q.type, q.options);
  if (optErr) throw new Error(optErr);
  if (ANSWER_REQUIRED_TYPES.includes(q.type) && !q.answer && !q.banglaAnswer) {
    throw new Error('INVALID_QUESTION: an answer is required before publishing this question type');
  }
}

function normalizeOptions(type: string, options: CreateQuestionInput['options']) {
  if (!OPTION_QUESTION_TYPES.includes(type as QuestionType)) return [];
  return options.map((o, i) => ({
    optionText: o.optionText.trim(),
    banglaOptionText: o.banglaOptionText ?? null,
    isCorrect: !!o.isCorrect,
    order: i,
  }));
}

// ------------------------------------------------------------------
// Queries
// ------------------------------------------------------------------

export async function listQuestions(scope: QuestionScope, params: QuestionFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  const and: Prisma.QuestionWhereInput[] = [questionVisibilityWhere(scope)];

  if (params.status && params.status !== 'all') and.push({ status: params.status });
  else if (!params.includeArchived) and.push({ status: { not: 'ARCHIVED' } });
  if (params.type) and.push({ type: params.type });
  if (params.difficulty) and.push({ difficulty: params.difficulty });
  if (params.subjectId) and.push({ subjectId: params.subjectId });
  if (params.subjectPaperId) and.push({ subjectPaperId: params.subjectPaperId });
  if (params.academicClassId) and.push({ academicClassId: params.academicClassId });
  if (params.academicGroupId) and.push({ academicGroupId: params.academicGroupId });
  if (params.chapter) and.push({ chapter: { contains: params.chapter, mode: 'insensitive' } });
  if (params.createdById) and.push({ createdById: params.createdById });
  if (params.excludeIds?.length) and.push({ id: { notIn: params.excludeIds } });

  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { questionText: { contains: s, mode: 'insensitive' } },
        { banglaQuestionText: { contains: s, mode: 'insensitive' } },
        { chapter: { contains: s, mode: 'insensitive' } },
        { subject: { name: { contains: s, mode: 'insensitive' } } },
        { subject: { banglaName: { contains: s, mode: 'insensitive' } } },
        { subject: { code: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }

  const where: Prisma.QuestionWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        difficulty: true,
        marks: true,
        status: true,
        chapter: true,
        questionText: true,
        banglaQuestionText: true,
        subjectId: true,
        createdById: true,
        branchId: true,
        updatedAt: true,
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
        subjectPaper: { select: { id: true, name: true, banglaName: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  const questions = rows.map((r) => {
    let canModify = true;
    try {
      assertCanModify(scope, r);
    } catch {
      canModify = false;
    }
    return { ...r, marks: toNumber(r.marks), canModify };
  });

  return {
    questions,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/** Genuine counts within the caller's visible scope. */
export async function getQuestionStats(scope: QuestionScope) {
  const base = questionVisibilityWhere(scope);
  const [total, published, draft, archived] = await Promise.all([
    prisma.question.count({ where: base }),
    prisma.question.count({ where: { AND: [base, { status: 'PUBLISHED' }] } }),
    prisma.question.count({ where: { AND: [base, { status: 'DRAFT' }] } }),
    prisma.question.count({ where: { AND: [base, { status: 'ARCHIVED' }] } }),
  ]);
  return { total, published, draft, archived };
}

async function findVisibleQuestion(scope: QuestionScope, questionId: string) {
  const q = await prisma.question.findFirst({
    where: { AND: [questionVisibilityWhere(scope), { id: questionId }] },
    include: detailInclude,
  });
  if (!q) throw new Error('QUESTION_NOT_FOUND');
  return q;
}

export async function getQuestionById(scope: QuestionScope, questionId: string) {
  const q = await findVisibleQuestion(scope, questionId);
  let canModify = true;
  try {
    assertCanModify(scope, q);
  } catch {
    canModify = false;
  }
  // Every caller of this service is staff or an authorized teacher.
  return serializeQuestion(q, { includeAnswers: true, canModify });
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------

export async function createQuestion(scope: QuestionScope, input: CreateQuestionInput) {
  const { coachingCenterId, user } = scope;
  if (!canManageQuestions(user)) throw new Error('QUESTION_ACCESS_DENIED');

  assertCanUseSubject(scope, input.subjectId);
  const ctx = await resolveAcademicContext(coachingCenterId, input);

  const optErr = checkQuestionOptions(input.type, input.options);
  const options = normalizeOptions(input.type, input.options);
  if (optErr) throw new Error(optErr);
  if (input.status === 'PUBLISHED') assertPublishable({ ...input, options });

  const question = await prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        coachingCenterId,
        branchId: isBranchScoped(user) ? user.branchId! : null,
        academicSessionId: ctx.academicSessionId,
        academicProgramId: ctx.academicProgramId,
        academicClassId: ctx.academicClassId,
        academicGroupId: ctx.academicGroupId,
        subjectId: ctx.subjectId,
        subjectPaperId: ctx.subjectPaperId,
        chapter: input.chapter,
        type: input.type,
        difficulty: input.difficulty,
        marks: input.marks,
        questionText: input.questionText,
        banglaQuestionText: input.banglaQuestionText,
        answer: input.answer,
        banglaAnswer: input.banglaAnswer,
        explanation: input.explanation,
        banglaExplanation: input.banglaExplanation,
        status: input.status,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
    if (options.length) {
      await tx.questionOption.createMany({ data: options.map((o) => ({ ...o, questionId: created.id })) });
    }
    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_CREATED',
    entity: 'Question',
    entityId: question.id,
    details: { subjectId: question.subjectId, type: question.type, marks: input.marks, status: question.status },
  });

  return getQuestionById(scope, question.id);
}

export async function updateQuestion(scope: QuestionScope, questionId: string, input: UpdateQuestionInput) {
  const { coachingCenterId, user } = scope;
  const existing = await findVisibleQuestion(scope, questionId);
  assertCanModify(scope, existing);
  if (existing.status === 'ARCHIVED') throw new Error('QUESTION_ALREADY_ARCHIVED: restore it before editing');

  assertCanUseSubject(scope, input.subjectId);
  const ctx = await resolveAcademicContext(coachingCenterId, input);

  const optErr = checkQuestionOptions(input.type, input.options);
  const options = normalizeOptions(input.type, input.options);
  if (optErr) throw new Error(optErr);
  if (input.status === 'PUBLISHED') assertPublishable({ ...input, options });

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: {
        academicSessionId: ctx.academicSessionId,
        academicProgramId: ctx.academicProgramId,
        academicClassId: ctx.academicClassId,
        academicGroupId: ctx.academicGroupId,
        subjectId: ctx.subjectId,
        subjectPaperId: ctx.subjectPaperId,
        chapter: input.chapter,
        type: input.type,
        difficulty: input.difficulty,
        marks: input.marks,
        questionText: input.questionText,
        banglaQuestionText: input.banglaQuestionText,
        answer: input.answer,
        banglaAnswer: input.banglaAnswer,
        explanation: input.explanation,
        banglaExplanation: input.banglaExplanation,
        status: input.status,
        updatedById: user.userId,
      },
    });
    await tx.questionOption.deleteMany({ where: { questionId } });
    if (options.length) {
      await tx.questionOption.createMany({ data: options.map((o) => ({ ...o, questionId })) });
    }
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_UPDATED',
    entity: 'Question',
    entityId: questionId,
    details: {
      subjectId: ctx.subjectId,
      type: input.type,
      statusBefore: existing.status,
      statusAfter: input.status,
    },
  });

  return getQuestionById(scope, questionId);
}

/**
 * Lifecycle transitions:
 *   DRAFT → PUBLISHED (publish guard), PUBLISHED → DRAFT (unpublish),
 *   DRAFT/PUBLISHED → ARCHIVED, ARCHIVED → DRAFT (explicit restore only).
 */
export async function transitionQuestionStatus(
  scope: QuestionScope,
  questionId: string,
  target: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
) {
  const { coachingCenterId, user } = scope;
  const q = await findVisibleQuestion(scope, questionId);
  assertCanModify(scope, q);

  if (q.status === target) {
    if (target === 'ARCHIVED') throw new Error('QUESTION_ALREADY_ARCHIVED');
    throw new Error(`INVALID_TRANSITION: question is already ${target}`);
  }
  if (target === 'PUBLISHED') {
    if (q.status === 'ARCHIVED') throw new Error('INVALID_TRANSITION: restore the archived question before publishing');
    await resolveAcademicContext(coachingCenterId, q);
    assertCanUseSubject(scope, q.subjectId);
    assertPublishable({ ...q, marks: Number(q.marks) });
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: target, updatedById: user.userId },
  });

  const action =
    target === 'PUBLISHED'
      ? 'QUESTION_PUBLISHED'
      : target === 'ARCHIVED'
        ? 'QUESTION_ARCHIVED'
        : q.status === 'ARCHIVED'
          ? 'QUESTION_RESTORED'
          : 'QUESTION_UNPUBLISHED';

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action,
    entity: 'Question',
    entityId: questionId,
    details: { from: q.status, to: target },
  });

  return { id: updated.id, status: updated.status };
}

export async function duplicateQuestion(scope: QuestionScope, questionId: string) {
  const { coachingCenterId, user } = scope;
  if (!canManageQuestions(user)) throw new Error('QUESTION_ACCESS_DENIED');
  const src = await findVisibleQuestion(scope, questionId);
  assertCanUseSubject(scope, src.subjectId);

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        coachingCenterId,
        branchId: isBranchScoped(user) ? user.branchId! : src.branchId,
        academicSessionId: src.academicSessionId,
        academicProgramId: src.academicProgramId,
        academicClassId: src.academicClassId,
        academicGroupId: src.academicGroupId,
        subjectId: src.subjectId,
        subjectPaperId: src.subjectPaperId,
        chapter: src.chapter,
        type: src.type,
        difficulty: src.difficulty,
        marks: src.marks,
        questionText: src.questionText,
        banglaQuestionText: src.banglaQuestionText,
        answer: src.answer,
        banglaAnswer: src.banglaAnswer,
        explanation: src.explanation,
        banglaExplanation: src.banglaExplanation,
        status: 'DRAFT',
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
    if (src.options.length) {
      await tx.questionOption.createMany({
        data: src.options.map((o) => ({
          questionId: created.id,
          optionText: o.optionText,
          banglaOptionText: o.banglaOptionText,
          isCorrect: o.isCorrect,
          order: o.order,
        })),
      });
    }
    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_DUPLICATED',
    entity: 'Question',
    entityId: copy.id,
    details: { sourceQuestionId: src.id, subjectId: src.subjectId },
  });

  return getQuestionById(scope, copy.id);
}

/**
 * Hard delete is only allowed while no question paper references the
 * question; otherwise it must be archived so paper history stays intact.
 */
export async function deleteQuestion(scope: QuestionScope, questionId: string) {
  const { coachingCenterId, user } = scope;
  const q = await findVisibleQuestion(scope, questionId);
  assertCanModify(scope, q);

  const usage = await prisma.questionPaperItem.count({ where: { questionId } });
  if (usage > 0) {
    throw new Error('QUESTION_IN_USE: this question is used in a question paper — archive it instead');
  }

  await prisma.question.delete({ where: { id: questionId } });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_DELETED',
    entity: 'Question',
    entityId: questionId,
    details: { subjectId: q.subjectId, type: q.type, status: q.status },
  });

  return { id: questionId, deleted: true };
}

/**
 * Form/filter options: the subjects the caller may use (a TEACHER only gets
 * authorized subjects) with their papers, and the people who have authored
 * visible questions (for the created-by filter).
 */
export async function getQuestionBankOptions(scope: QuestionScope) {
  const [subjects, creators] = await Promise.all([
    prisma.subject.findMany({
      where: {
        coachingCenterId: scope.coachingCenterId,
        ...(scope.teacherSubjectIds ? { id: { in: scope.teacherSubjectIds } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        academicClassId: true,
        academicGroupId: true,
        papers: { orderBy: { paperNumber: 'asc' }, select: { id: true, name: true, banglaName: true, paperNumber: true } },
      },
    }),
    prisma.user.findMany({
      where: { coachingCenterId: scope.coachingCenterId, createdQuestions: { some: questionVisibilityWhere(scope) } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 100,
    }),
  ]);
  return { subjects, creators, restrictedToTeacherSubjects: !!scope.teacherSubjectIds };
}
