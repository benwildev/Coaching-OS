import 'dotenv/config';
import prisma from '../lib/db';
import type { SessionUser } from '../lib/auth/session';
import {
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  getQuestionById,
  listQuestions,
  resolveQuestionScope,
  transitionQuestionStatus,
  updateQuestion,
} from '../lib/services/question.service';
import {
  createQuestionPaper,
  finalizeQuestionPaper,
  getQuestionPaperById,
  updateQuestionPaper,
} from '../lib/services/question-paper.service';
import {
  createMaterial,
  getStudentPortalMaterials,
  resolveMaterialScope,
  transitionMaterialStatus,
} from '../lib/services/study-material.service';
import { createQuestionSchema, type CreateQuestionInput } from '../lib/validations/question';
import { createQuestionPaperSchema } from '../lib/validations/question-paper';

/**
 * Phase 7 runtime verification against the configured database.
 * Every record it creates is tagged/tracked and removed in `finally`.
 */

const TAG = `P7VERIFY-${Date.now()}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

async function expectReject(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith(code)) {
      ok(`${label} → rejected with ${msg.split(':')[0]}`);
      return;
    }
    throw new Error(`FAIL: ${label} — expected ${code}, got "${msg}"`);
  }
  throw new Error(`FAIL: ${label} — expected rejection ${code}, but it succeeded`);
}

function questionInput(subjectId: string, over: Partial<CreateQuestionInput> = {}) {
  return createQuestionSchema.parse({
    subjectId,
    type: 'WRITTEN',
    difficulty: 'MEDIUM',
    marks: 5,
    questionText: `${TAG} question`,
    status: 'DRAFT',
    options: [],
    ...over,
  });
}

async function run() {
  console.log('========================================================');
  console.log('PHASE 7 RUNTIME VERIFICATION — Question Bank, Papers, Materials');
  console.log('========================================================');

  const center = await prisma.coachingCenter.findFirst({
    where: { code: { not: { startsWith: 'P7V' } } },
    include: {
      academicSessions: { take: 1 },
      academicPrograms: { include: { classes: true }, take: 5 },
      users: { take: 1, include: { roleAssignments: { include: { role: true } } } },
    },
  });
  const session = center?.academicSessions[0];
  const program = center?.academicPrograms.find((p) => p.classes.length > 0);
  const academicClass = program?.classes[0];
  const adminUser = center?.users[0];
  if (!center || !session || !program || !academicClass || !adminUser) {
    console.log('⚠ No coaching center with session/program/class/user found — cannot run DB tests.');
    process.exitCode = 1;
    return;
  }
  const cc = center.id;
  console.log(`Tenant: ${center.name} · Class: ${academicClass.name}`);

  const admin: SessionUser = {
    userId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: 'OWNER',
    coachingCenterId: cc,
    branchId: null,
  };

  const created = {
    subjectIds: [] as string[],
    teacherUserId: null as string | null,
    teacherId: null as string | null,
    studentId: null as string | null,
    otherCenterId: null as string | null,
    questionIds: new Set<string>(),
    paperIds: new Set<string>(),
    materialIds: new Set<string>(),
  };

  try {
    // ---------- temporary fixtures ----------
    const [subA, subB] = await Promise.all(
      ['A', 'B'].map((x) =>
        prisma.subject.create({
          data: { coachingCenterId: cc, academicClassId: academicClass.id, name: `${TAG} Subject ${x}`, code: `${TAG}-${x}` },
        })
      )
    );
    created.subjectIds.push(subA.id, subB.id);

    const teacherUser = await prisma.user.create({
      data: { coachingCenterId: cc, email: `${TAG.toLowerCase()}@verify.local`, passwordHash: 'x', name: `${TAG} Teacher` },
    });
    created.teacherUserId = teacherUser.id;
    const teacher = await prisma.teacher.create({
      data: {
        coachingCenterId: cc,
        userId: teacherUser.id,
        teacherCode: TAG,
        name: `${TAG} Teacher`,
        phone: '01700000000',
        teacherSubjects: { create: [{ subjectId: subA.id }] },
      },
    });
    created.teacherId = teacher.id;
    const teacherSession: SessionUser = {
      userId: teacherUser.id,
      email: teacherUser.email,
      name: teacherUser.name,
      role: 'TEACHER',
      coachingCenterId: cc,
      branchId: null,
    };

    const adminScope = await resolveQuestionScope(cc, admin);
    const teacherScope = await resolveQuestionScope(cc, teacherSession);

    // ---------- 1. Question creation (MCQ + options, atomic) ----------
    console.log('\n--- 1. Question creation ---');
    const mcq = await createQuestion(
      adminScope,
      questionInput(subA.id, {
        type: 'MCQ',
        marks: 5,
        questionText: `${TAG} What is H2O?`,
        banglaQuestionText: 'H2O কী?',
        options: [
          { optionText: 'Water', banglaOptionText: 'পানি', isCorrect: true },
          { optionText: 'Salt', banglaOptionText: null, isCorrect: false },
          { optionText: 'Sugar', banglaOptionText: null, isCorrect: false },
          { optionText: 'Oil', banglaOptionText: null, isCorrect: false },
        ],
      })
    );
    created.questionIds.add(mcq.id);
    assert(mcq.status === 'DRAFT', 'new question starts as DRAFT');
    assert(mcq.options.length === 4, 'MCQ has 4 options');
    assert(mcq.academicClassId === academicClass.id, 'class derived from subject');
    ok(`MCQ created (${mcq.id}) with 4 ordered options, status DRAFT`);

    // ---------- 2. MCQ option validation ----------
    console.log('\n--- 2. MCQ option validation ---');
    assert(mcq.options.filter((o) => o.isCorrect).length === 1, 'exactly one correct option');
    assert(mcq.options.map((o) => o.order).join(',') === '0,1,2,3', 'option order preserved');
    ok('Exactly one correct option; option order 0..3 preserved');
    const oneOption = createQuestionSchema.safeParse({
      subjectId: subA.id, type: 'MCQ', marks: 1, questionText: 'x', options: [{ optionText: 'only', isCorrect: true }],
    });
    assert(!oneOption.success, 'schema rejects MCQ with 1 option');
    ok('Schema rejects MCQ with fewer than 2 options');
    const zeroMarks = createQuestionSchema.safeParse({ subjectId: subA.id, type: 'SHORT', marks: 0, questionText: 'x' });
    const emptyText = createQuestionSchema.safeParse({ subjectId: subA.id, type: 'SHORT', marks: 1, questionText: '  ' });
    assert(!zeroMarks.success && !emptyText.success, 'marks > 0 and non-empty text enforced');
    ok('Schema rejects marks = 0 and empty question text');
    await expectReject(
      () => createQuestion(adminScope, { ...questionInput(subA.id), type: 'WRITTEN', options: [{ optionText: 'a', banglaOptionText: null, isCorrect: false }, { optionText: 'b', banglaOptionText: null, isCorrect: true }] }),
      'NON_MCQ_OPTIONS_NOT_ALLOWED',
      'Written question with options'
    );

    // ---------- 3. Invalid MCQ rejection ----------
    console.log('\n--- 3. Invalid MCQ rejection ---');
    const noCorrect = createQuestionSchema.safeParse({
      subjectId: subA.id, type: 'MCQ', marks: 1, questionText: 'x',
      options: [{ optionText: 'a', isCorrect: false }, { optionText: 'b', isCorrect: false }],
    });
    assert(!noCorrect.success, 'schema rejects MCQ without a correct option');
    ok('Schema rejects MCQ with no correct option');
    await expectReject(
      () =>
        createQuestion(adminScope, {
          ...questionInput(subA.id),
          type: 'MCQ',
          options: [
            { optionText: 'a', banglaOptionText: null, isCorrect: false },
            { optionText: 'b', banglaOptionText: null, isCorrect: false },
          ],
        }),
      'INVALID_MCQ_OPTIONS',
      'Service call with MCQ and no correct option (bypassing schema)'
    );
    const before = await prisma.question.count({ where: { coachingCenterId: cc, subjectId: subA.id } });
    assert(before === 1, 'rejected MCQ left no partial question row');
    ok('No partial question row left behind by rejected creates');

    // ---------- 4. Publication ----------
    console.log('\n--- 4. Question publication ---');
    const pub = await transitionQuestionStatus(adminScope, mcq.id, 'PUBLISHED');
    assert(pub.status === 'PUBLISHED', 'DRAFT → PUBLISHED');
    ok('DRAFT → PUBLISHED');
    const shortNoAnswer = await createQuestion(adminScope, questionInput(subA.id, { type: 'SHORT', marks: 2 }));
    created.questionIds.add(shortNoAnswer.id);
    await expectReject(() => transitionQuestionStatus(adminScope, shortNoAnswer.id, 'PUBLISHED'), 'INVALID_QUESTION', 'Publishing SHORT question without an answer');

    // ---------- 5. Duplication ----------
    console.log('\n--- 5. Question duplication ---');
    const dup = await duplicateQuestion(adminScope, mcq.id);
    created.questionIds.add(dup.id);
    assert(dup.id !== mcq.id, 'duplicate has a new id');
    assert(dup.status === 'DRAFT', 'duplicate starts as DRAFT');
    assert(dup.options.length === 4 && dup.options.filter((o) => o.isCorrect).length === 1, 'options copied');
    assert(dup.questionText === mcq.questionText && dup.marks === mcq.marks, 'content copied');
    ok(`Duplicate ${dup.id} ≠ original, status DRAFT, 4 options copied`);

    // ---------- 6. Archive ----------
    console.log('\n--- 6. Question archive ---');
    const arch = await transitionQuestionStatus(adminScope, dup.id, 'ARCHIVED');
    assert(arch.status === 'ARCHIVED', 'archived');
    ok('DRAFT → ARCHIVED');
    await expectReject(() => transitionQuestionStatus(adminScope, dup.id, 'PUBLISHED'), 'INVALID_TRANSITION', 'Publishing an archived question directly');
    await expectReject(() => transitionQuestionStatus(adminScope, dup.id, 'ARCHIVED'), 'QUESTION_ALREADY_ARCHIVED', 'Archiving twice');
    const listDefault = await listQuestions(adminScope, { subjectId: subA.id });
    assert(!listDefault.questions.some((q) => q.id === dup.id), 'archived hidden from default list');
    ok('Archived question hidden from default list');

    // ---------- 7. Tenant isolation ----------
    console.log('\n--- 7. Tenant isolation ---');
    const other = await prisma.coachingCenter.create({
      data: { name: `${TAG} Other Center`, code: `P7V-${Date.now()}`, phone: '01800000000' },
    });
    created.otherCenterId = other.id;
    const oProgram = await prisma.academicProgram.create({ data: { coachingCenterId: other.id, name: 'SSC', code: 'SSC' } });
    const oClass = await prisma.academicClass.create({
      data: { coachingCenterId: other.id, academicProgramId: oProgram.id, name: 'Class 10', code: 'C10' },
    });
    const oSubject = await prisma.subject.create({
      data: { coachingCenterId: other.id, academicClassId: oClass.id, name: 'Other Physics', code: 'OPHY' },
    });
    const oUser = await prisma.user.create({
      data: { coachingCenterId: other.id, email: 'owner@other.local', passwordHash: 'x', name: 'Other Owner' },
    });
    const otherScope = await resolveQuestionScope(other.id, { ...admin, userId: oUser.id, coachingCenterId: other.id });
    const foreignQ = await createQuestion(otherScope, questionInput(oSubject.id, { questionText: `${TAG} foreign` }));
    await expectReject(() => getQuestionById(adminScope, foreignQ.id), 'QUESTION_NOT_FOUND', 'Reading another tenant’s question');
    await expectReject(() => transitionQuestionStatus(adminScope, foreignQ.id, 'ARCHIVED'), 'QUESTION_NOT_FOUND', 'Archiving another tenant’s question');
    await expectReject(() => createQuestion(adminScope, questionInput(oSubject.id)), 'INVALID_ACADEMIC_CONTEXT', 'Creating a question on another tenant’s subject');
    const searchAll = await listQuestions(adminScope, { search: TAG, pageSize: 50 });
    assert(!searchAll.questions.some((q) => q.id === foreignQ.id), 'foreign question absent from list');
    ok('Foreign question never appears in tenant list/search');

    // ---------- 8. Teacher subject authorization ----------
    console.log('\n--- 8. Teacher subject authorization ---');
    assert(teacherScope.teacherSubjectIds?.length === 1 && teacherScope.teacherSubjectIds[0] === subA.id, 'teacher scope = subject A');
    ok('Teacher scope resolved from TeacherSubject (subject A only)');
    await expectReject(() => createQuestion(teacherScope, questionInput(subB.id)), 'QUESTION_ACCESS_DENIED', 'Teacher creating a question for an unrelated subject');
    const tq = await createQuestion(teacherScope, questionInput(subA.id, { questionText: `${TAG} teacher question` }));
    created.questionIds.add(tq.id);
    ok('Teacher can create a question for an authorized subject');
    await expectReject(() => transitionQuestionStatus(teacherScope, mcq.id, 'ARCHIVED'), 'QUESTION_ACCESS_DENIED', 'Teacher modifying a question authored by someone else');
    const bQ = await createQuestion(adminScope, questionInput(subB.id, { questionText: `${TAG} subject B` }));
    created.questionIds.add(bQ.id);
    await expectReject(() => getQuestionById(teacherScope, bQ.id), 'QUESTION_NOT_FOUND', 'Teacher reading an unrelated-subject question');
    const tList = await listQuestions(teacherScope, { search: TAG, pageSize: 50 });
    assert(tList.questions.every((q) => q.subjectId === subA.id), 'teacher list limited to subject A');
    ok('Teacher list contains only authorized-subject questions');
    const tMatScope = await resolveMaterialScope(cc, teacherSession);
    await expectReject(
      () => createMaterial(tMatScope, { title: `${TAG} x`, banglaTitle: null, description: null, banglaDescription: null, academicClassId: academicClass.id, academicGroupId: null, subjectId: subB.id, subjectPaperId: null, batchId: null, type: 'LINK', fileUrl: 'https://example.com', thumbnailUrl: null, status: 'DRAFT' }),
      'MATERIAL_ACCESS_DENIED',
      'Teacher creating material for an unrelated subject'
    );

    // ---------- 9 & 10. Study material creation + publication ----------
    console.log('\n--- 9. Study material creation ---');
    const matScope = await resolveMaterialScope(cc, admin);
    const baseMat = {
      banglaTitle: null, description: null, banglaDescription: null, academicClassId: academicClass.id,
      academicGroupId: null, subjectId: subA.id, subjectPaperId: null, batchId: null, thumbnailUrl: null,
    };
    const matPub = await createMaterial(matScope, { ...baseMat, title: `${TAG} Chapter 1 sheet`, type: 'PDF', fileUrl: 'https://example.com/ch1.pdf', status: 'DRAFT' });
    created.materialIds.add(matPub.id);
    const matDraft = await createMaterial(matScope, { ...baseMat, title: `${TAG} Unpublished notes`, type: 'LINK', fileUrl: 'https://example.com/draft', status: 'DRAFT' });
    created.materialIds.add(matDraft.id);
    assert(matPub.status === 'DRAFT' && matPub.publishedAt === null, 'material starts DRAFT');
    ok('Two DRAFT materials created');
    await expectReject(
      () => createMaterial(matScope, { ...baseMat, title: `${TAG} empty note`, type: 'NOTE', fileUrl: null, status: 'DRAFT' }),
      'MATERIAL_RESOURCE_REQUIRED',
      'NOTE material without content'
    );
    await expectReject(
      () => createMaterial(matScope, { ...baseMat, title: `${TAG} pdf`, type: 'PDF', fileUrl: null, status: 'DRAFT' }),
      'MATERIAL_RESOURCE_REQUIRED',
      'PDF material without resource URL'
    );

    console.log('\n--- 10. Material publication ---');
    const mp = await transitionMaterialStatus(matScope, matPub.id, 'PUBLISHED');
    const mpRow = await prisma.studyMaterial.findUnique({ where: { id: matPub.id } });
    assert(mp.status === 'PUBLISHED' && mpRow?.publishedAt, 'published with timestamp');
    ok('DRAFT → PUBLISHED with publishedAt set');

    // ---------- 11. Question paper creation ----------
    console.log('\n--- 11. Question paper creation ---');
    const qA = await createQuestion(adminScope, questionInput(subA.id, { type: 'WRITTEN', marks: 5, questionText: `${TAG} Question A original` }));
    const qB = await createQuestion(adminScope, questionInput(subA.id, { type: 'CQ', marks: 10, questionText: `${TAG} Question B` }));
    const qC = await createQuestion(adminScope, questionInput(subA.id, { type: 'WRITTEN', marks: 5, questionText: `${TAG} Question C` }));
    [qA, qB, qC].forEach((q) => created.questionIds.add(q.id));
    const paperInput = createQuestionPaperSchema.parse({
      title: `${TAG} Weekly Test`,
      subjectId: subA.id,
      durationMinutes: 60,
      examType: 'WEEKLY',
      questionIds: [qA.id, qB.id, qC.id],
    });
    const paper = await createQuestionPaper(adminScope, paperInput);
    created.paperIds.add(paper.id);
    assert(paper.status === 'DRAFT', 'paper starts DRAFT');
    ok(`Paper ${paper.id} created as DRAFT`);

    // ---------- 12. Question selection ----------
    console.log('\n--- 12. Question selection ---');
    assert(paper.items.length === 3, '3 items');
    assert(paper.items.map((i) => i.questionId).join() === [qA.id, qB.id, qC.id].join(), 'selection order kept');
    assert(paper.items.every((i) => i.questionText && i.marks > 0), 'snapshots stored');
    ok('3 questions selected in order, each with a snapshot');
    await expectReject(
      () => createQuestionPaper(adminScope, { ...paperInput, questionIds: [qA.id, foreignQ.id] }),
      'QUESTION_NOT_FOUND',
      'Selecting another tenant’s question'
    );
    await expectReject(
      () => createQuestionPaper(adminScope, { ...paperInput, questionIds: [qA.id, bQ.id] }),
      'INVALID_QUESTION_SELECTION',
      'Selecting a question from a different subject'
    );
    await expectReject(
      () => createQuestionPaper(adminScope, { ...paperInput, questionIds: [qA.id, dup.id] }),
      'INVALID_QUESTION_SELECTION',
      'Selecting an archived question'
    );

    // ---------- 13. Duplicate question rejection ----------
    console.log('\n--- 13. Duplicate question rejection ---');
    const dupSchema = createQuestionPaperSchema.safeParse({ ...paperInput, questionIds: [qA.id, qA.id] });
    assert(!dupSchema.success, 'schema rejects duplicates');
    ok('Schema rejects duplicate question ids');
    await expectReject(
      () => createQuestionPaper(adminScope, { ...paperInput, questionIds: [qA.id, qB.id, qA.id] }),
      'QUESTION_ALREADY_SELECTED',
      'Service rejects duplicate question ids'
    );
    const paperCount = await prisma.questionPaper.count({ where: { coachingCenterId: cc, title: paperInput.title } });
    assert(paperCount === 1, 'rejected papers left no partial rows');
    ok('No partially-created papers left behind');

    // ---------- 14. Ordering ----------
    console.log('\n--- 14. Question ordering ---');
    const reordered = await updateQuestionPaper(adminScope, paper.id, { questionIds: [qC.id, qA.id, qB.id] });
    assert(reordered.items.map((i) => i.questionId).join() === [qC.id, qA.id, qB.id].join(), 'new order');
    assert(reordered.items.map((i) => i.order).join() === '0,1,2', 'explicit contiguous order');
    ok('Reordered to C, A, B with explicit order 0,1,2');

    // ---------- 15. Total mark calculation ----------
    console.log('\n--- 15. Total mark calculation ---');
    assert(reordered.calculatedMarks === 20, `calculated total 20 (got ${reordered.calculatedMarks})`);
    assert(reordered.totalMarks === 20 && reordered.marksMatch, 'declared defaults to calculated');
    ok('5 + 10 + 5 = 20; declared total defaulted to 20');
    const mism = await updateQuestionPaper(adminScope, paper.id, { totalMarks: 25 });
    assert(!mism.marksMatch, 'mismatch flagged');
    await expectReject(() => finalizeQuestionPaper(adminScope, paper.id), 'INVALID_TOTAL_MARKS', 'Finalizing with declared 25 ≠ calculated 20');
    await updateQuestionPaper(adminScope, paper.id, { totalMarks: 20 });
    ok('Declared total restored to 20');

    // ---------- 16. Finalization ----------
    console.log('\n--- 16. Question paper finalization ---');
    const fin = await finalizeQuestionPaper(adminScope, paper.id);
    assert(fin.status === 'FINALIZED' && fin.finalizedAt, 'finalized');
    ok('DRAFT → FINALIZED');
    await expectReject(() => deleteQuestion(adminScope, qA.id), 'QUESTION_IN_USE', 'Hard-deleting a question used in a paper');

    // ---------- 17. Finalized paper modification rejection ----------
    console.log('\n--- 17. Finalized paper modification ---');
    await expectReject(() => updateQuestionPaper(adminScope, paper.id, { questionIds: [qA.id] }), 'QUESTION_PAPER_FINALIZED', 'Removing questions from a finalized paper');
    await expectReject(() => updateQuestionPaper(adminScope, paper.id, { questionIds: [qB.id, qA.id, qC.id] }), 'QUESTION_PAPER_FINALIZED', 'Reordering a finalized paper');
    await expectReject(() => updateQuestionPaper(adminScope, paper.id, { title: 'changed' }), 'QUESTION_PAPER_FINALIZED', 'Editing a finalized paper’s details');
    await expectReject(() => finalizeQuestionPaper(adminScope, paper.id), 'QUESTION_PAPER_FINALIZED', 'Finalizing twice');

    // ---------- 18. Snapshot integrity ----------
    console.log('\n--- 18. Snapshot integrity ---');
    const qAFull = await getQuestionById(adminScope, qA.id);
    await updateQuestion(adminScope, qA.id, questionInput(subA.id, { marks: 7, questionText: `${TAG} Question A EDITED` }));
    const liveA = await getQuestionById(adminScope, qA.id);
    const frozen = await getQuestionPaperById(adminScope, paper.id);
    const itemA = frozen.items.find((i) => i.questionId === qA.id)!;
    assert(liveA.questionText.endsWith('EDITED') && liveA.marks === 7, 'live question changed');
    assert(itemA.questionText === qAFull.questionText && itemA.marks === 5, 'snapshot unchanged');
    assert(frozen.calculatedMarks === 20, 'paper total unchanged');
    ok('Editing the live question did not change the finalized paper (text + marks frozen)');
    const printView = await getQuestionPaperById(adminScope, paper.id, { forPrint: true });
    assert(printView.items.every((i) => !('answer' in i) && !('explanation' in i)), 'print view strips answers');
    ok('Print view omits answers/explanations');

    // ---------- 19. Student portal ----------
    console.log('\n--- 19. Student portal visibility ---');
    const student = await prisma.student.create({
      data: {
        coachingCenterId: cc,
        studentIdCode: TAG,
        name: `${TAG} Student`,
        enrollments: {
          create: {
            coachingCenterId: cc,
            academicSessionId: session.id,
            academicProgramId: program.id,
            academicClassId: academicClass.id,
          },
        },
      },
    });
    created.studentId = student.id;
    const portal = await getStudentPortalMaterials(cc, admin, student.id, { search: TAG });
    const ids = portal.materials.map((m) => m.id);
    assert(ids.includes(matPub.id), 'published material visible');
    assert(!ids.includes(matDraft.id), 'draft material hidden');
    assert(portal.materials.every((m) => !('status' in m) && !('createdBy' in m)), 'no internal fields');
    ok('Student sees the published material only; draft hidden; no internal fields');
    await transitionMaterialStatus(matScope, matPub.id, 'DRAFT');
    const portal2 = await getStudentPortalMaterials(cc, admin, student.id, { search: TAG });
    assert(!portal2.materials.some((m) => m.id === matPub.id), 'unpublished disappears');
    ok('Unpublishing removes the material from the student portal');
    await expectReject(
      () => getStudentPortalMaterials(other.id, { ...admin, coachingCenterId: other.id }, student.id),
      'STUDENT_NOT_FOUND',
      'Another tenant requesting this student’s materials'
    );

    // Audit trail sanity
    const audit = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { coachingCenterId: cc, entityId: { in: [...created.questionIds, ...created.paperIds, ...created.materialIds] } },
      _count: true,
    });
    const actions = new Set(audit.map((a) => a.action));
    for (const a of ['QUESTION_CREATED', 'QUESTION_PUBLISHED', 'QUESTION_DUPLICATED', 'QUESTION_ARCHIVED', 'QUESTION_UPDATED', 'QUESTION_PAPER_CREATED', 'QUESTION_PAPER_UPDATED', 'QUESTION_PAPER_FINALIZED', 'MATERIAL_CREATED', 'MATERIAL_PUBLISHED']) {
      assert(actions.has(a), `audit log ${a} recorded`);
    }
    ok(`Audit logs recorded: ${[...actions].sort().join(', ')}`);
  } finally {
    // ---------- 20. Cleanup ----------
    console.log('\n--- 20. Cleanup ---');
    const entityIds = [...created.questionIds, ...created.paperIds, ...created.materialIds];
    await prisma.questionPaper.deleteMany({ where: { coachingCenterId: cc, title: { startsWith: TAG } } });
    await prisma.question.deleteMany({ where: { coachingCenterId: cc, subjectId: { in: created.subjectIds } } });
    await prisma.studyMaterial.deleteMany({ where: { coachingCenterId: cc, subjectId: { in: created.subjectIds } } });
    if (entityIds.length) await prisma.auditLog.deleteMany({ where: { coachingCenterId: cc, entityId: { in: entityIds } } });
    if (created.studentId) await prisma.student.deleteMany({ where: { id: created.studentId } });
    if (created.teacherId) await prisma.teacher.deleteMany({ where: { id: created.teacherId } });
    if (created.teacherUserId) await prisma.user.deleteMany({ where: { id: created.teacherUserId } });
    if (created.subjectIds.length) await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } });
    if (created.otherCenterId) await prisma.coachingCenter.deleteMany({ where: { id: created.otherCenterId } });

    const leftovers = await Promise.all([
      prisma.question.count({ where: { questionText: { startsWith: TAG } } }),
      prisma.questionPaper.count({ where: { title: { startsWith: TAG } } }),
      prisma.studyMaterial.count({ where: { title: { startsWith: TAG } } }),
      prisma.subject.count({ where: { code: { startsWith: TAG } } }),
      prisma.student.count({ where: { studentIdCode: TAG } }),
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
    ]);
    if (leftovers.some((n) => n > 0)) {
      console.error('✘ Cleanup left records behind:', leftovers);
      process.exitCode = 1;
    } else {
      ok('All temporary records removed (0 leftovers)');
    }
  }

  console.log('\n========================================================');
  console.log(`PHASE 7 VERIFICATION PASSED — ${passed} checks`);
  console.log('========================================================');
}

run()
  .catch((e) => {
    console.error('\nVERIFICATION ERROR:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
