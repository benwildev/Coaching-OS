import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { calculateOverallExamResult, getCoachingCenterGradingConfig } from '@/lib/services/result-calculation.service';
import { canViewInternalResults, NO_MATCH_ID, type ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { sqlAnd, sqlIn } from './sql';
import { int, paginate, pct, pickName, resolveOptionalRange, sortRows, type ViewHandler } from './report-utils';

/**
 * Exam reports read the grade / GPA / isPassed values that Phase 6
 * (bulkSaveSubjectResults → calculateSubjectGrade) persisted on each Result;
 * the report layer never re-grades. Per-student overall results use the
 * same calculateOverallExamResult() the result history uses.
 *
 * resultScope:
 *   published (default) — only exams with status PUBLISHED
 *   internal            — every non-cancelled exam, incl. unpublished marks;
 *                         OWNER/ADMIN/STAFF only (never TEACHER)
 *
 * Averages: average % = SUM(marksObtained) / SUM(subject totalMarks) over
 * PRESENT results with marks — the same basis as getBatchPerformanceStats.
 */

function effectiveResultScope(scope: ReportScope, filters: ReportFilters): 'published' | 'internal' {
  return filters.resultScope === 'internal' && canViewInternalResults(scope.role) ? 'internal' : 'published';
}

/** Predicates over results r / exam_subjects es / exams e / students st. */
function resultSqlWhere(scope: ReportScope, filters: ReportFilters): Prisma.Sql {
  const rs = effectiveResultScope(scope, filters);
  const range = resolveOptionalRange(filters);
  const parts: Prisma.Sql[] = [Prisma.sql`e."coachingCenterId" = ${scope.coachingCenterId}`];
  parts.push(rs === 'published' ? Prisma.sql`e."status" = 'PUBLISHED'` : Prisma.sql`e."status" <> 'CANCELLED'`);
  if (scope.branchId) parts.push(Prisma.sql`(e."branchId" = ${scope.branchId} OR (e."branchId" IS NULL AND st."branchId" = ${scope.branchId}))`);
  if (filters.academicSessionId) parts.push(Prisma.sql`e."academicSessionId" = ${filters.academicSessionId}`);
  if (filters.programId) parts.push(Prisma.sql`e."academicProgramId" = ${filters.programId}`);
  if (filters.classId) parts.push(Prisma.sql`e."academicClassId" = ${filters.classId}`);
  if (filters.groupId) parts.push(Prisma.sql`e."academicGroupId" = ${filters.groupId}`);
  if (filters.batchId) parts.push(Prisma.sql`e."batchId" = ${filters.batchId}`);
  if (filters.examType) parts.push(Prisma.sql`e."examType" = ${filters.examType}`);
  if (filters.examId) parts.push(Prisma.sql`e."id" = ${filters.examId}`);
  if (filters.subjectId) parts.push(Prisma.sql`es."subjectId" = ${filters.subjectId}`);
  if (filters.studentId) parts.push(Prisma.sql`r."studentId" = ${filters.studentId}`);
  if (range) {
    parts.push(Prisma.sql`e."startDate" >= ${range.start}`);
    parts.push(Prisma.sql`e."startDate" < ${range.endExclusive}`);
  }
  if (scope.teacher) {
    const t = scope.teacher;
    const ors: Prisma.Sql[] = t.pairs.map((p) => Prisma.sql`(e."batchId" = ${p.batchId} AND es."subjectId" = ${p.subjectId})`);
    if (t.subjectIds.length) ors.push(Prisma.sql`(e."batchId" IS NULL AND ${sqlIn(Prisma.sql`es."subjectId"`, t.subjectIds)})`);
    parts.push(ors.length ? Prisma.sql`(${Prisma.join(ors, ' OR ')})` : Prisma.sql`FALSE`);
  }
  return sqlAnd(parts);
}

const FROM_RESULTS = Prisma.sql`
  FROM "results" r
  JOIN "exam_subjects" es ON es."id" = r."examSubjectId"
  JOIN "exams" e ON e."id" = es."examId"
  JOIN "students" st ON st."id" = r."studentId"`;

/** Same exam scope as resultSqlWhere, for listing exams that may have no results yet. */
function examWhere(scope: ReportScope, filters: ReportFilters): Prisma.ExamWhereInput {
  const rs = effectiveResultScope(scope, filters);
  const range = resolveOptionalRange(filters);
  const and: Prisma.ExamWhereInput[] = [
    { coachingCenterId: scope.coachingCenterId },
    rs === 'published' ? { status: 'PUBLISHED' } : { status: { not: 'CANCELLED' } },
  ];
  if (scope.branchId) and.push({ OR: [{ branchId: scope.branchId }, { branchId: null }] });
  if (filters.academicSessionId) and.push({ academicSessionId: filters.academicSessionId });
  if (filters.programId) and.push({ academicProgramId: filters.programId });
  if (filters.classId) and.push({ academicClassId: filters.classId });
  if (filters.groupId) and.push({ academicGroupId: filters.groupId });
  if (filters.batchId) and.push({ batchId: filters.batchId });
  if (filters.examType) and.push({ examType: filters.examType });
  if (filters.subjectId) and.push({ examSubjects: { some: { subjectId: filters.subjectId } } });
  if (range) and.push({ startDate: { gte: range.start, lt: range.endExclusive } });
  if (filters.search) and.push({ OR: [{ title: { contains: filters.search, mode: 'insensitive' } }, { banglaTitle: { contains: filters.search } }] });
  if (scope.teacher) {
    const t = scope.teacher;
    const ors: Prisma.ExamWhereInput[] = t.pairs.map((p) => ({ batchId: p.batchId, examSubjects: { some: { subjectId: p.subjectId } } }));
    if (t.subjectIds.length) ors.push({ batchId: null, examSubjects: { some: { subjectId: { in: t.subjectIds } } } });
    and.push(ors.length ? { OR: ors } : { id: NO_MATCH_ID });
  }
  return { AND: and };
}

interface AggRow {
  results: bigint;
  students: bigint;
  present: bigint;
  absent: bigint;
  passed: bigint;
  failed: bigint;
  marks: Prisma.Decimal | null;
  possible: Prisma.Decimal | null;
  avgMarks: Prisma.Decimal | null;
  gpaSum: Prisma.Decimal | null;
  gpaCount: bigint;
}

const AGG_SELECT = Prisma.sql`
  COUNT(*) AS results,
  COUNT(DISTINCT r."studentId") AS students,
  COUNT(*) FILTER (WHERE r."status" = 'PRESENT' AND r."marksObtained" IS NOT NULL) AS present,
  COUNT(*) FILTER (WHERE r."status" <> 'PRESENT') AS absent,
  COUNT(*) FILTER (WHERE r."isPassed") AS passed,
  COUNT(*) FILTER (WHERE NOT r."isPassed") AS failed,
  SUM(r."marksObtained") FILTER (WHERE r."status" = 'PRESENT') AS marks,
  SUM(es."totalMarks") FILTER (WHERE r."status" = 'PRESENT' AND r."marksObtained" IS NOT NULL) AS possible,
  AVG(r."marksObtained") FILTER (WHERE r."status" = 'PRESENT') AS "avgMarks",
  SUM(r."gpa") FILTER (WHERE r."status" = 'PRESENT' AND r."gpa" IS NOT NULL) AS "gpaSum",
  COUNT(r."gpa") FILTER (WHERE r."status" = 'PRESENT') AS "gpaCount"`;

function shapeAgg(a: AggRow | undefined) {
  const results = int(a?.results);
  const passed = int(a?.passed);
  const possible = a?.possible ? Number(a.possible) : 0;
  const gpaCount = int(a?.gpaCount);
  return {
    results,
    students: int(a?.students),
    present: int(a?.present),
    absent: int(a?.absent),
    passed,
    failed: int(a?.failed),
    passPct: pct(passed, results),
    averagePct: possible > 0 && a?.marks ? Math.round((Number(a.marks) / possible) * 1000) / 10 : null,
    averageMarks: a?.avgMarks !== null && a?.avgMarks !== undefined ? Math.round(Number(a.avgMarks) * 100) / 100 : null,
    averageGpa: gpaCount > 0 && a?.gpaSum ? Math.round((Number(a.gpaSum) / gpaCount) * 100) / 100 : null,
  };
}

// ------------------------------------------------------------------
// Exam performance summary (list of exams)
// ------------------------------------------------------------------

export const examSummary: ViewHandler = async ({ scope, filters }) => {
  const where = resultSqlWhere(scope, filters);
  const exams = await prisma.exam.findMany({
    where: examWhere(scope, filters),
    orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    take: EXPORT_ROW_LIMIT,
    select: {
      id: true,
      title: true,
      banglaTitle: true,
      examType: true,
      status: true,
      startDate: true,
      publishedAt: true,
      batch: { select: { id: true, name: true, banglaName: true } },
      academicClass: { select: { name: true, banglaName: true } },
      _count: { select: { examStudents: true, examSubjects: true } },
    },
  });
  const [perExam, overall] = await Promise.all([
    prisma.$queryRaw<Array<AggRow & { examId: string }>>`SELECT e."id" AS "examId", ${AGG_SELECT} ${FROM_RESULTS} WHERE ${where} GROUP BY 1`,
    prisma.$queryRaw<AggRow[]>`SELECT ${AGG_SELECT} ${FROM_RESULTS} WHERE ${where}`,
  ]);
  const aggMap = new Map(perExam.map((r) => [r.examId, r]));
  const rows = exams.map((e) => ({
    exam: { id: e.id, title: e.title, banglaTitle: e.banglaTitle, examType: e.examType, status: e.status, startDate: e.startDate.toISOString(), publishedAt: e.publishedAt?.toISOString() ?? null },
    batch: e.batch,
    academicClass: e.academicClass,
    registeredStudents: e._count.examStudents,
    subjects: e._count.examSubjects,
    ...shapeAgg(aggMap.get(e.id)),
  }));
  type Row = (typeof rows)[number];
  const sort: Record<string, (r: Row) => string | number | null> = {
    startDate: (r) => r.exam.startDate,
    title: (r) => r.exam.title,
    averagePct: (r) => r.averagePct,
    passPct: (r) => r.passPct,
  };
  const sorted = sortRows(rows, sort[filters.sort || 'startDate'] ?? sort.startDate, filters.dir || 'desc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: {
      resultScope: effectiveResultScope(scope, filters),
      overall: { exams: rows.length, ...shapeAgg(overall[0]) },
      ...paginate(sorted, filters.page, filters.pageSize),
    },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.exam, value: (r: Row) => pickName(lang, r.exam.title, r.exam.banglaTitle) },
        { header: R.col.examDate, value: (r: Row) => r.exam.startDate.slice(0, 10) },
        { header: R.col.batch, value: (r: Row) => pickName(lang, r.batch?.name, r.batch?.banglaName) },
        { header: R.col.status, value: (r: Row) => r.exam.status },
        { header: R.col.students, value: (r: Row) => r.registeredStudents },
        { header: R.col.results, value: (r: Row) => r.results },
        { header: R.col.averagePct, value: (r: Row) => r.averagePct },
        { header: R.col.passCount, value: (r: Row) => r.passed },
        { header: R.col.failCount, value: (r: Row) => r.failed },
        { header: R.col.passPct, value: (r: Row) => r.passPct },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Grade distribution (persisted subject grades)
// ------------------------------------------------------------------

export const examGrades: ViewHandler = async ({ scope, filters }) => {
  const where = resultSqlWhere(scope, filters);
  const [rows, config] = await Promise.all([
    prisma.$queryRaw<Array<{ grade: string | null; status: string; n: bigint }>>`
      SELECT r."grade", r."status", COUNT(*) AS n ${FROM_RESULTS} WHERE ${where} GROUP BY 1, 2`,
    getCoachingCenterGradingConfig(scope.coachingCenterId),
  ]);
  const byGrade = new Map<string, number>();
  let absent = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.status !== 'PRESENT') absent += int(r.n);
    else if (!r.grade) pending += int(r.n);
    else byGrade.set(r.grade, (byGrade.get(r.grade) || 0) + int(r.n));
  }
  // Order by the centre's configured grading scale; any grade present in the
  // data but no longer in the scale is still shown (after the scale).
  const scaleGrades = config.scale.map((s) => s.grade);
  const extra = Array.from(byGrade.keys()).filter((g) => !scaleGrades.includes(g));
  const graded = Array.from(byGrade.values()).reduce((s, n) => s + n, 0);
  const dist = [...scaleGrades, ...extra].map((g) => ({
    grade: g,
    gradePoint: config.scale.find((s) => s.grade === g)?.gradePoint ?? null,
    count: byGrade.get(g) || 0,
    share: pct(byGrade.get(g) || 0, graded),
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof dist)[number];
  return {
    data: { resultScope: effectiveResultScope(scope, filters), rows: dist, graded, absent, pending },
    export: {
      rows: dist,
      columns: [
        { header: R.col.grade, value: (r: Row) => r.grade },
        { header: R.col.gradePoint, value: (r: Row) => r.gradePoint },
        { header: R.col.count, value: (r: Row) => r.count },
        { header: R.col.sharePct, value: (r: Row) => r.share },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Subject & batch performance
// ------------------------------------------------------------------

export const examSubjects: ViewHandler = async ({ scope, filters }) => {
  const where = resultSqlWhere(scope, filters);
  const raw = await prisma.$queryRaw<Array<AggRow & { id: string; name: string; bn: string | null; code: string }>>`
    SELECT sub."id", sub."name", sub."banglaName" AS bn, sub."code", ${AGG_SELECT}
    ${FROM_RESULTS} JOIN "subjects" sub ON sub."id" = es."subjectId"
    WHERE ${where} GROUP BY 1, 2, 3, 4`;
  const rows = raw.map((r) => ({ subject: { id: r.id, name: r.name, banglaName: r.bn, code: r.code }, ...shapeAgg(r) }));
  type Row = (typeof rows)[number];
  // Neutral default order (alphabetical) — sorting by a metric is the user's explicit choice.
  const sort: Record<string, (r: Row) => string | number | null> = {
    name: (r) => r.subject.name,
    averagePct: (r) => r.averagePct,
    passPct: (r) => r.passPct,
    students: (r) => r.students,
  };
  const sorted = sortRows(rows, sort[filters.sort || 'name'] ?? sort.name, filters.dir || 'asc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: { resultScope: effectiveResultScope(scope, filters), ...paginate(sorted, filters.page, filters.pageSize) },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.subject, value: (r: Row) => pickName(lang, r.subject.name, r.subject.banglaName) },
        { header: R.col.students, value: (r: Row) => r.students },
        { header: R.col.averageMarks, value: (r: Row) => r.averageMarks },
        { header: R.col.averagePct, value: (r: Row) => r.averagePct },
        { header: R.col.passCount, value: (r: Row) => r.passed },
        { header: R.col.failCount, value: (r: Row) => r.failed },
        { header: R.col.passPct, value: (r: Row) => r.passPct },
      ],
    },
  };
};

export const examBatches: ViewHandler = async ({ scope, filters }) => {
  const where = resultSqlWhere(scope, filters);
  const raw = await prisma.$queryRaw<Array<AggRow & { id: string | null; name: string | null; bn: string | null; exams: bigint }>>`
    SELECT b."id", b."name", b."banglaName" AS bn, COUNT(DISTINCT e."id") AS exams, ${AGG_SELECT}
    ${FROM_RESULTS} LEFT JOIN "batches" b ON b."id" = e."batchId"
    WHERE ${where} GROUP BY 1, 2, 3`;
  const rows = raw.map((r) => ({ batch: r.id ? { id: r.id, name: r.name, banglaName: r.bn } : null, exams: int(r.exams), ...shapeAgg(r) }));
  type Row = (typeof rows)[number];
  const sort: Record<string, (r: Row) => string | number | null> = {
    name: (r) => r.batch?.name ?? null,
    averagePct: (r) => r.averagePct,
    averageGpa: (r) => r.averageGpa,
    passPct: (r) => r.passPct,
  };
  const sorted = sortRows(rows, sort[filters.sort || 'name'] ?? sort.name, filters.dir || 'asc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: { resultScope: effectiveResultScope(scope, filters), ...paginate(sorted, filters.page, filters.pageSize) },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.batch, value: (r: Row) => (r.batch ? pickName(lang, r.batch.name, r.batch.banglaName) : R.noBatch) },
        { header: R.col.exams, value: (r: Row) => r.exams },
        { header: R.col.students, value: (r: Row) => r.students },
        { header: R.col.results, value: (r: Row) => r.results },
        { header: R.col.averagePct, value: (r: Row) => r.averagePct },
        { header: R.col.averageGpa, value: (r: Row) => r.averageGpa },
        { header: R.col.passCount, value: (r: Row) => r.passed },
        { header: R.col.failCount, value: (r: Row) => r.failed },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Drill-down: exam → students → subject results
// ------------------------------------------------------------------

async function loadExamResults(scope: ReportScope, filters: ReportFilters) {
  if (!filters.examId) throw new Error('INVALID_FILTER: examId is required');
  const exam = await prisma.exam.findFirst({
    where: { AND: [examWhere(scope, { ...filters, dateFrom: undefined, dateTo: undefined, search: undefined }), { id: filters.examId }] },
    select: {
      id: true,
      title: true,
      banglaTitle: true,
      examType: true,
      status: true,
      startDate: true,
      publishedAt: true,
      batch: { select: { id: true, name: true, banglaName: true } },
      academicClass: { select: { name: true, banglaName: true } },
      _count: { select: { examStudents: true } },
    },
  });
  if (!exam) throw new Error('EXAM_NOT_FOUND');
  const where = resultSqlWhere(scope, { ...filters, dateFrom: undefined, dateTo: undefined, subjectId: undefined });
  const results = await prisma.$queryRaw<
    Array<{ studentId: string; code: string; name: string; bn: string | null; subjectId: string; subjectName: string; subjectBn: string | null; status: string; marks: Prisma.Decimal | null; total: Prisma.Decimal; passMarks: Prisma.Decimal; grade: string | null; gpa: Prisma.Decimal | null; isPassed: boolean; rank: number | null }>
  >`
    SELECT r."studentId" AS "studentId", st."studentIdCode" AS code, st."name", st."banglaName" AS bn,
           sub."id" AS "subjectId", sub."name" AS "subjectName", sub."banglaName" AS "subjectBn",
           r."status", r."marksObtained" AS marks, es."totalMarks" AS total, es."passMarks" AS "passMarks",
           r."grade", r."gpa", r."isPassed" AS "isPassed", r."rank"
    ${FROM_RESULTS} JOIN "subjects" sub ON sub."id" = es."subjectId"
    WHERE ${where}
    ORDER BY st."studentIdCode", sub."name"`;
  return { exam, results };
}

function studentOverall(rows: Awaited<ReturnType<typeof loadExamResults>>['results']) {
  const subjects = rows.map((r) => ({
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    subjectBanglaName: r.subjectBn,
    status: r.status,
    marksObtained: r.marks !== null ? Number(r.marks) : null,
    totalMarks: Number(r.total),
    passMarks: Number(r.passMarks),
    grade: r.grade ?? '',
    gpa: r.gpa !== null ? Number(r.gpa) : 0,
    gpaValue: r.gpa !== null ? Number(r.gpa) : null,
    isPassed: r.isPassed,
  }));
  // Same function (and default config) getStudentResultHistory uses.
  return { subjects, overall: calculateOverallExamResult(subjects) };
}

export const examDetail: ViewHandler = async ({ scope, filters }) => {
  const { exam, results } = await loadExamResults(scope, filters);
  const byStudent = new Map<string, typeof results>();
  for (const r of results) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) || []), r]);
  const rows = Array.from(byStudent.values()).map((rs) => {
    const { overall } = studentOverall(rs);
    return {
      student: { id: rs[0].studentId, studentIdCode: rs[0].code, name: rs[0].name, banglaName: rs[0].bn },
      rank: rs[0].rank,
      subjects: rs.length,
      ...overall,
    };
  });
  type Row = (typeof rows)[number];
  const gradeDist = new Map<string, number>();
  for (const r of rows) gradeDist.set(r.overallGrade, (gradeDist.get(r.overallGrade) || 0) + 1);
  const config = await getCoachingCenterGradingConfig(scope.coachingCenterId);
  const sort: Record<string, (r: Row) => string | number | null> = {
    studentIdCode: (r) => r.student.studentIdCode,
    name: (r) => r.student.name,
    total: (r) => r.totalMarksObtained,
    gpa: (r) => r.overallGpa,
    rank: (r) => r.rank,
  };
  const sorted = sortRows(rows, sort[filters.sort || 'studentIdCode'] ?? sort.studentIdCode, filters.dir || 'asc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: {
      resultScope: effectiveResultScope(scope, filters),
      exam: { ...exam, startDate: exam.startDate.toISOString(), publishedAt: exam.publishedAt?.toISOString() ?? null },
      summary: {
        registeredStudents: exam._count.examStudents,
        studentsWithResults: rows.length,
        passed: rows.filter((r) => r.isPassed).length,
        failed: rows.filter((r) => !r.isPassed).length,
      },
      overallGrades: [...config.scale.map((s) => s.grade), ...Array.from(gradeDist.keys()).filter((g) => !config.scale.some((s) => s.grade === g))]
        .map((g) => ({ grade: g, count: gradeDist.get(g) || 0 })),
      ...paginate(sorted, filters.page, filters.pageSize),
    },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.studentId, value: (r: Row) => r.student.studentIdCode },
        { header: R.col.name, value: (r: Row) => pickName(lang, r.student.name, r.student.banglaName) },
        { header: R.col.subjects, value: (r: Row) => r.subjects },
        { header: R.col.total, value: (r: Row) => r.totalMarksObtained },
        { header: R.col.totalPossible, value: (r: Row) => r.totalExamMarks },
        { header: R.col.percentage, value: (r: Row) => r.overallPercentage },
        { header: R.col.grade, value: (r: Row) => r.overallGrade },
        { header: R.col.gpa, value: (r: Row) => r.overallGpa },
        { header: R.col.result, value: (r: Row) => (r.isPassed ? R.pass : R.fail) },
        { header: R.col.rank, value: (r: Row) => r.rank },
      ],
    },
  };
};

export const examStudentResult: ViewHandler = async ({ scope, filters }) => {
  if (!filters.studentId) throw new Error('INVALID_FILTER: studentId is required');
  const { exam, results } = await loadExamResults(scope, filters);
  if (results.length === 0) throw new Error('RESULT_NOT_FOUND');
  const { subjects, overall } = studentOverall(results);
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof subjects)[number];
  return {
    data: {
      resultScope: effectiveResultScope(scope, filters),
      exam: { id: exam.id, title: exam.title, banglaTitle: exam.banglaTitle, status: exam.status, startDate: exam.startDate.toISOString() },
      student: { id: results[0].studentId, studentIdCode: results[0].code, name: results[0].name, banglaName: results[0].bn },
      rank: results[0].rank,
      subjects,
      overall,
    },
    export: {
      rows: subjects,
      columns: [
        { header: R.col.subject, value: (r: Row) => pickName(lang, r.subjectName, r.subjectBanglaName) },
        { header: R.col.status, value: (r: Row) => r.status },
        { header: R.col.marks, value: (r: Row) => r.marksObtained },
        { header: R.col.totalPossible, value: (r: Row) => r.totalMarks },
        { header: R.col.grade, value: (r: Row) => r.grade },
        { header: R.col.gpa, value: (r: Row) => r.gpaValue },
      ],
    },
  };
};
