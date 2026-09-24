import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { recordAuditLog } from './audit.service';
import { resolveAcademicContext } from './academic.service';
import {
  assertCanUseSubject,
  canManageQuestions,
  questionVisibilityWhere,
  type QuestionScope,
} from './question.service';
import type {
  CreateQuestionPaperInput,
  QuestionPaperFilterParams,
  UpdateQuestionPaperInput,
} from '@/lib/validations/question-paper';

export interface OptionSnapshot {
  text: string;
  banglaText: string | null;
  order: number;
  isCorrect: boolean;
}

type Tx = Prisma.TransactionClient;

/** Marks are stored with 2 decimals; compare in hundredths to avoid float drift. */
const cents = (n: number) => Math.round(n * 100);

function isBranchScoped(scope: QuestionScope) {
  return scope.user.role !== 'OWNER' && scope.user.role !== 'ADMIN' && !!scope.user.branchId;
}

function paperVisibilityWhere(scope: QuestionScope): Prisma.QuestionPaperWhereInput {
  const and: Prisma.QuestionPaperWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (isBranchScoped(scope)) and.push({ OR: [{ branchId: scope.user.branchId }, { branchId: null }] });
  if (scope.teacherSubjectIds) and.push({ subjectId: { in: scope.teacherSubjectIds } });
  return { AND: and };
}

function assertCanModifyPaper(scope: QuestionScope, p: { createdById: string | null; subjectId: string; branchId: string | null }) {
  const { user } = scope;
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (isBranchScoped(scope) && p.branchId && p.branchId !== user.branchId) throw new Error('QUESTION_PAPER_ACCESS_DENIED');
  if (user.role === 'STAFF') return;
  if (user.role === 'TEACHER') {
    assertCanUseSubject(scope, p.subjectId);
    if (p.createdById !== user.userId) {
      throw new Error('QUESTION_PAPER_ACCESS_DENIED: teachers may only modify their own papers');
    }
    return;
  }
  throw new Error('QUESTION_PAPER_ACCESS_DENIED');
}

function assertDraft(p: { status: string }) {
  if (p.status === 'FINALIZED') throw new Error('QUESTION_PAPER_FINALIZED: a finalized paper cannot be modified');
  if (p.status !== 'DRAFT') throw new Error('QUESTION_PAPER_ARCHIVED: an archived paper cannot be modified');
}

const questionForSnapshot = {
  id: true,
  subjectId: true,
  status: true,
  type: true,
  questionText: true,
  banglaQuestionText: true,
  marks: true,
  difficulty: true,
  answer: true,
  banglaAnswer: true,
  explanation: true,
  banglaExplanation: true,
  options: { orderBy: { order: 'asc' }, select: { optionText: true, banglaOptionText: true, order: true, isCorrect: true } },
} satisfies Prisma.QuestionSelect;

type SnapshotSource = Prisma.QuestionGetPayload<{ select: typeof questionForSnapshot }>;

function buildSnapshot(q: SnapshotSource) {
  const options: OptionSnapshot[] = q.options.map((o) => ({
    text: o.optionText,
    banglaText: o.banglaOptionText,
    order: o.order,
    isCorrect: o.isCorrect,
  }));
  return {
    questionTypeSnapshot: q.type,
    questionTextSnapshot: q.questionText,
    banglaQuestionTextSnapshot: q.banglaQuestionText,
    marksSnapshot: q.marks,
    difficultySnapshot: q.difficulty,
    optionsSnapshot: options.length ? (options as unknown as Prisma.InputJsonValue) : undefined,
    answerSnapshot: [q.answer, q.banglaAnswer].filter(Boolean).join('\n') || null,
    explanationSnapshot: [q.explanation, q.banglaExplanation].filter(Boolean).join('\n') || null,
  };
}

/**
 * Loads the requested questions within the caller's visible scope and checks
 * every selection rule: same tenant/scope, not archived, same subject as the
 * paper, no duplicates. Returns them in the requested order.
 */
async function loadSelectableQuestions(db: Tx | typeof prisma, scope: QuestionScope, subjectId: string, ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('QUESTION_ALREADY_SELECTED');
  const rows = await db.question.findMany({
    where: { AND: [questionVisibilityWhere(scope), { id: { in: ids } }] },
    select: questionForSnapshot,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const q = byId.get(id);
    if (!q) throw new Error('QUESTION_NOT_FOUND: a selected question does not exist or is not accessible');
    if (q.status === 'ARCHIVED') throw new Error('INVALID_QUESTION_SELECTION: archived questions cannot be added');
    if (q.subjectId !== subjectId) throw new Error('INVALID_QUESTION_SELECTION: every question must belong to the paper subject');
    return q;
  });
}

async function replaceItems(tx: Tx, paperId: string, questions: SnapshotSource[]) {
  await tx.questionPaperItem.deleteMany({ where: { questionPaperId: paperId } });
  await tx.questionPaperItem.createMany({
    data: questions.map((q, order) => ({ questionPaperId: paperId, questionId: q.id, order, ...buildSnapshot(q) })),
  });
}

function sumMarks(qs: Array<{ marks: Prisma.Decimal | number }>) {
  return qs.reduce((acc, q) => acc + cents(Number(q.marks)), 0) / 100;
}

// ------------------------------------------------------------------
// Queries
// ------------------------------------------------------------------

export async function listQuestionPapers(scope: QuestionScope, params: QuestionPaperFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 15));
  const and: Prisma.QuestionPaperWhereInput[] = [paperVisibilityWhere(scope)];
  if (params.status && params.status !== 'all') and.push({ status: params.status });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (params.subjectId) and.push({ subjectId: params.subjectId });
  if (params.academicClassId) and.push({ academicClassId: params.academicClassId });
  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { banglaTitle: { contains: s, mode: 'insensitive' } },
        { subject: { name: { contains: s, mode: 'insensitive' } } },
        { subject: { code: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.QuestionPaperWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.questionPaper.count({ where }),
    prisma.questionPaper.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        banglaTitle: true,
        examType: true,
        status: true,
        totalMarks: true,
        durationMinutes: true,
        updatedAt: true,
        finalizedAt: true,
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
        subjectPaper: { select: { id: true, name: true, banglaName: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    papers: rows.map((r) => ({ ...r, totalMarks: Number(r.totalMarks) })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getQuestionPaperStats(scope: QuestionScope) {
  const base = paperVisibilityWhere(scope);
  const [total, draft, finalized] = await Promise.all([
    prisma.questionPaper.count({ where: { AND: [base, { status: { not: 'ARCHIVED' } }] } }),
    prisma.questionPaper.count({ where: { AND: [base, { status: 'DRAFT' }] } }),
    prisma.questionPaper.count({ where: { AND: [base, { status: 'FINALIZED' }] } }),
  ]);
  return { total, draft, finalized };
}

/**
 * Paper with its snapshot items. `forPrint` strips correct-option flags,
 * answers and explanations so the student-facing paper can never leak them.
 */
export async function getQuestionPaperById(scope: QuestionScope, paperId: string, opts: { forPrint?: boolean } = {}) {
  const paper = await prisma.questionPaper.findFirst({
    where: { AND: [paperVisibilityWhere(scope), { id: paperId }] },
    include: {
      coachingCenter: { select: { name: true, banglaName: true, address: true } },
      branch: { select: { id: true, name: true, banglaName: true } },
      subject: { select: { id: true, name: true, banglaName: true, code: true } },
      subjectPaper: { select: { id: true, name: true, banglaName: true } },
      academicSession: { select: { id: true, name: true, banglaName: true } },
      academicProgram: { select: { id: true, name: true, banglaName: true } },
      academicClass: { select: { id: true, name: true, banglaName: true } },
      academicGroup: { select: { id: true, name: true, banglaName: true } },
      createdBy: { select: { id: true, name: true } },
      finalizedBy: { select: { id: true, name: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });
  if (!paper) throw new Error('QUESTION_PAPER_NOT_FOUND');

  let canModify = true;
  try {
    assertCanModifyPaper(scope, paper);
  } catch {
    canModify = false;
  }

  const items = paper.items.map((it) => {
    const options = ((it.optionsSnapshot as unknown as OptionSnapshot[] | null) || []).map((o) =>
      opts.forPrint ? { text: o.text, banglaText: o.banglaText, order: o.order } : o
    );
    return {
      id: it.id,
      questionId: it.questionId,
      order: it.order,
      type: it.questionTypeSnapshot,
      questionText: it.questionTextSnapshot,
      banglaQuestionText: it.banglaQuestionTextSnapshot,
      marks: Number(it.marksSnapshot),
      difficulty: it.difficultySnapshot,
      options,
      ...(opts.forPrint ? {} : { answer: it.answerSnapshot, explanation: it.explanationSnapshot }),
    };
  });

  const calculatedMarks = items.reduce((a, i) => a + cents(i.marks), 0) / 100;
  const { items: _raw, ...rest } = paper;
  return {
    ...rest,
    totalMarks: Number(paper.totalMarks),
    calculatedMarks,
    marksMatch: cents(calculatedMarks) === cents(Number(paper.totalMarks)),
    items,
    canModify: canModify && paper.status === 'DRAFT',
  };
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------

export async function createQuestionPaper(scope: QuestionScope, input: CreateQuestionPaperInput) {
  const { coachingCenterId, user } = scope;
  if (!canManageQuestions(user)) throw new Error('QUESTION_PAPER_ACCESS_DENIED');
  assertCanUseSubject(scope, input.subjectId);
  const ctx = await resolveAcademicContext(coachingCenterId, input);

  const paper = await prisma.$transaction(async (tx) => {
    const questions = await loadSelectableQuestions(tx, scope, ctx.subjectId, input.questionIds);
    const calculated = sumMarks(questions);
    const created = await tx.questionPaper.create({
      data: {
        coachingCenterId,
        branchId: isBranchScoped(scope) ? user.branchId! : null,
        academicSessionId: ctx.academicSessionId,
        academicProgramId: ctx.academicProgramId,
        academicClassId: ctx.academicClassId,
        academicGroupId: ctx.academicGroupId,
        subjectId: ctx.subjectId,
        subjectPaperId: ctx.subjectPaperId,
        title: input.title,
        banglaTitle: input.banglaTitle,
        examType: input.examType ?? null,
        examDate: input.examDate ? new Date(input.examDate) : null,
        durationMinutes: input.durationMinutes,
        totalMarks: input.totalMarks ?? calculated,
        instructions: input.instructions,
        banglaInstructions: input.banglaInstructions,
        status: 'DRAFT',
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
    await replaceItems(tx, created.id, questions);
    return { ...created, calculated, itemCount: questions.length };
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_PAPER_CREATED',
    entity: 'QuestionPaper',
    entityId: paper.id,
    details: {
      subjectId: paper.subjectId,
      questionCount: paper.itemCount,
      totalMarks: Number(paper.totalMarks),
      calculatedMarks: paper.calculated,
    },
  });

  return getQuestionPaperById(scope, paper.id);
}

export async function updateQuestionPaper(scope: QuestionScope, paperId: string, input: UpdateQuestionPaperInput) {
  const { coachingCenterId, user } = scope;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.questionPaper.findFirst({
      where: { AND: [paperVisibilityWhere(scope), { id: paperId }] },
      include: { items: { orderBy: { order: 'asc' }, select: { questionId: true } } },
    });
    if (!existing) throw new Error('QUESTION_PAPER_NOT_FOUND');
    assertCanModifyPaper(scope, existing);
    assertDraft(existing);

    const subjectId = input.subjectId ?? existing.subjectId;
    assertCanUseSubject(scope, subjectId);
    const ctx = await resolveAcademicContext(coachingCenterId, {
      subjectId,
      academicSessionId: input.academicSessionId !== undefined ? input.academicSessionId : existing.academicSessionId,
      academicProgramId: input.academicProgramId !== undefined ? input.academicProgramId : existing.academicProgramId,
      academicClassId: input.academicClassId !== undefined ? input.academicClassId : existing.academicClassId,
      academicGroupId: input.academicGroupId !== undefined ? input.academicGroupId : existing.academicGroupId,
      subjectPaperId: input.subjectPaperId !== undefined ? input.subjectPaperId : existing.subjectPaperId,
    });

    // Re-validate selection whenever the list or the subject changes.
    const questionIds =
      input.questionIds ?? existing.items.map((i) => i.questionId).filter((id): id is string => !!id);
    const itemsChanged = !!input.questionIds || subjectId !== existing.subjectId;
    let calculated: number | null = null;
    if (itemsChanged) {
      const questions = await loadSelectableQuestions(tx, scope, ctx.subjectId, questionIds);
      await replaceItems(tx, paperId, questions);
      calculated = sumMarks(questions);
    }

    await tx.questionPaper.update({
      where: { id: paperId },
      data: {
        academicSessionId: ctx.academicSessionId,
        academicProgramId: ctx.academicProgramId,
        academicClassId: ctx.academicClassId,
        academicGroupId: ctx.academicGroupId,
        subjectId: ctx.subjectId,
        subjectPaperId: ctx.subjectPaperId,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.banglaTitle !== undefined ? { banglaTitle: input.banglaTitle } : {}),
        ...(input.examType !== undefined ? { examType: input.examType } : {}),
        ...(input.examDate !== undefined ? { examDate: input.examDate ? new Date(input.examDate) : null } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.totalMarks !== undefined && input.totalMarks !== null ? { totalMarks: input.totalMarks } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.banglaInstructions !== undefined ? { banglaInstructions: input.banglaInstructions } : {}),
        updatedById: user.userId,
      },
    });
    return { itemsChanged, questionCount: questionIds.length, calculated };
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_PAPER_UPDATED',
    entity: 'QuestionPaper',
    entityId: paperId,
    details: {
      itemsChanged: result.itemsChanged,
      questionCount: result.questionCount,
      calculatedMarks: result.calculated,
      fields: Object.keys(input).filter((k) => k !== 'questionIds'),
    },
  });

  return getQuestionPaperById(scope, paperId);
}

/**
 * Atomically validates the paper, freezes each item's snapshot from the live
 * question (if it is still available) and marks the paper FINALIZED. After
 * this, no item or snapshot can change.
 */
export async function finalizeQuestionPaper(scope: QuestionScope, paperId: string) {
  const { coachingCenterId, user } = scope;

  const summary = await prisma.$transaction(async (tx) => {
    const paper = await tx.questionPaper.findFirst({
      where: { AND: [paperVisibilityWhere(scope), { id: paperId }] },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!paper) throw new Error('QUESTION_PAPER_NOT_FOUND');
    assertCanModifyPaper(scope, paper);
    assertDraft(paper);

    if (paper.items.length === 0) throw new Error('QUESTION_PAPER_EMPTY: add at least one question');
    const qIds = paper.items.map((i) => i.questionId).filter((id): id is string => !!id);
    if (new Set(qIds).size !== qIds.length) throw new Error('QUESTION_ALREADY_SELECTED');
    paper.items.forEach((it, idx) => {
      if (it.order !== idx) throw new Error('INVALID_QUESTION_ORDER');
    });

    // Freeze snapshots from the current tenant-owned question content.
    const live = await tx.question.findMany({
      where: { id: { in: qIds }, coachingCenterId },
      select: questionForSnapshot,
    });
    const liveById = new Map(live.map((q) => [q.id, q]));

    let totalCents = 0;
    for (const it of paper.items) {
      const q = it.questionId ? liveById.get(it.questionId) : undefined;
      if (q && q.status !== 'ARCHIVED') {
        if (q.subjectId !== paper.subjectId) throw new Error('INVALID_QUESTION_SELECTION: subject mismatch');
        const snap = buildSnapshot(q);
        await tx.questionPaperItem.update({
          where: { id: it.id },
          data: { ...snap, optionsSnapshot: snap.optionsSnapshot ?? Prisma.DbNull },
        });
        totalCents += cents(Number(q.marks));
      } else {
        if (!it.questionTextSnapshot || it.marksSnapshot === null) {
          throw new Error('QUESTION_PAPER_INVALID: an item has no snapshot');
        }
        totalCents += cents(Number(it.marksSnapshot));
      }
    }

    if (totalCents <= 0 || totalCents !== cents(Number(paper.totalMarks))) {
      throw new Error(
        `INVALID_TOTAL_MARKS: selected questions total ${totalCents / 100} but the paper declares ${Number(paper.totalMarks)}`
      );
    }

    // Conditional update guards against a concurrent finalize/edit.
    const res = await tx.questionPaper.updateMany({
      where: { id: paperId, coachingCenterId, status: 'DRAFT' },
      data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedById: user.userId, updatedById: user.userId },
    });
    if (res.count !== 1) throw new Error('QUESTION_PAPER_FINALIZED');

    return { questionCount: paper.items.length, totalMarks: totalCents / 100 };
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_PAPER_FINALIZED',
    entity: 'QuestionPaper',
    entityId: paperId,
    details: summary,
  });

  return getQuestionPaperById(scope, paperId);
}

export async function archiveQuestionPaper(scope: QuestionScope, paperId: string) {
  const { coachingCenterId, user } = scope;
  const paper = await prisma.questionPaper.findFirst({
    where: { AND: [paperVisibilityWhere(scope), { id: paperId }] },
    select: { id: true, status: true, createdById: true, subjectId: true, branchId: true },
  });
  if (!paper) throw new Error('QUESTION_PAPER_NOT_FOUND');
  assertCanModifyPaper(scope, paper);
  if (paper.status === 'ARCHIVED') throw new Error('QUESTION_PAPER_ALREADY_ARCHIVED');

  await prisma.questionPaper.update({
    where: { id: paperId },
    data: { status: 'ARCHIVED', updatedById: user.userId },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'QUESTION_PAPER_ARCHIVED',
    entity: 'QuestionPaper',
    entityId: paperId,
    details: { from: paper.status },
  });

  return { id: paperId, status: 'ARCHIVED' };
}
