import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { computePercentage, getAttendanceThreshold } from '@/lib/services/attendance.service';
import type { ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { bucketKey, enumerateBuckets, type DhakaRange } from './dates';
import { sqlAnd, sqlIn } from './sql';
import { int, paginate, pickName, resolveRange, sortRows, type ViewHandler } from './report-utils';

/**
 * Attendance reports reuse the Phase 4 definition verbatim
 * (attendance.service.ts computePercentage):
 *
 *   percentage = (PRESENT + LATE) / (PRESENT + LATE + ABSENT)
 *
 * counted only over COMPLETED sessions and only where a StudentAttendance
 * mark actually exists; EXCUSED is reported but excluded from the ratio.
 * Marks are only ever created for students eligible on that session date
 * (StudentBatch join/leave window), so counting marks respects historical
 * batch membership automatically. The database does the counting
 * (GROUP BY status); only the final ratio is computed by computePercentage.
 */

interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

const emptyCounts = (): StatusCounts => ({ present: 0, absent: 0, late: 0, excused: 0 });

function addCount(c: StatusCounts, status: string, n: number) {
  if (status === 'PRESENT') c.present += n;
  else if (status === 'ABSENT') c.absent += n;
  else if (status === 'LATE') c.late += n;
  else if (status === 'EXCUSED') c.excused += n;
}

function withPct(c: StatusCounts) {
  const counted = c.present + c.late + c.absent;
  return { ...c, marks: counted + c.excused, percentage: counted > 0 ? computePercentage(c) : null };
}

/** WHERE clause over attendance_sessions `s` joined to batches `b`. */
export function sessionSqlWhere(scope: ReportScope, filters: ReportFilters, range: DhakaRange): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`s."coachingCenterId" = ${scope.coachingCenterId}`,
    Prisma.sql`s."status" = 'COMPLETED'`,
    Prisma.sql`s."date" >= ${range.dateFrom}`,
    Prisma.sql`s."date" <= ${range.dateTo}`,
  ];
  if (scope.branchId) parts.push(Prisma.sql`s."branchId" = ${scope.branchId}`);
  if (filters.batchId) parts.push(Prisma.sql`s."batchId" = ${filters.batchId}`);
  if (filters.subjectId) parts.push(Prisma.sql`s."subjectId" = ${filters.subjectId}`);
  if (filters.teacherId) parts.push(Prisma.sql`s."teacherId" = ${filters.teacherId}`);
  if (filters.academicSessionId) parts.push(Prisma.sql`b."academicSessionId" = ${filters.academicSessionId}`);
  if (filters.programId) parts.push(Prisma.sql`b."academicProgramId" = ${filters.programId}`);
  if (filters.classId) parts.push(Prisma.sql`b."academicClassId" = ${filters.classId}`);
  if (filters.groupId) parts.push(Prisma.sql`b."academicGroupId" = ${filters.groupId}`);
  if (filters.courseId) parts.push(Prisma.sql`b."courseId" = ${filters.courseId}`);
  if (scope.teacher) {
    const t = scope.teacher;
    const ors: Prisma.Sql[] = [];
    if (t.teacherId) ors.push(Prisma.sql`s."teacherId" = ${t.teacherId}`);
    if (t.pairs.length) {
      ors.push(Prisma.sql`(s."batchId", s."subjectId") IN (${Prisma.join(t.pairs.map((p) => Prisma.sql`(${p.batchId}, ${p.subjectId})`))})`);
    }
    parts.push(ors.length ? Prisma.sql`(${Prisma.join(ors, ' OR ')})` : Prisma.sql`FALSE`);
  }
  return sqlAnd(parts);
}

const FROM_MARKS = Prisma.sql`
  FROM "student_attendances" sa
  JOIN "attendance_sessions" s ON s."id" = sa."attendanceSessionId"
  JOIN "batches" b ON b."id" = s."batchId"`;

// ------------------------------------------------------------------
// Summary + breakdowns + trend
// ------------------------------------------------------------------

export const attendanceSummary: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const where = sessionSqlWhere(scope, filters, range);
  const studentFilter = filters.studentId ? Prisma.sql` AND sa."studentId" = ${filters.studentId}` : Prisma.empty;

  const [totals, sessions, byBatch, bySubject, byBranch, byDay] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
      SELECT sa."status"::text AS status, COUNT(*) AS n ${FROM_MARKS} WHERE ${where}${studentFilter} GROUP BY 1`,
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM "attendance_sessions" s JOIN "batches" b ON b."id" = s."batchId" WHERE ${where}`,
    prisma.$queryRaw<Array<{ id: string; name: string; bn: string | null; status: string; n: bigint }>>`
      SELECT b."id", b."name", b."banglaName" AS bn, sa."status"::text AS status, COUNT(*) AS n
      ${FROM_MARKS} WHERE ${where}${studentFilter} GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<Array<{ id: string | null; name: string | null; bn: string | null; status: string; n: bigint }>>`
      SELECT sub."id", sub."name", sub."banglaName" AS bn, sa."status"::text AS status, COUNT(*) AS n
      ${FROM_MARKS} LEFT JOIN "subjects" sub ON sub."id" = s."subjectId"
      WHERE ${where}${studentFilter} GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<Array<{ id: string; name: string; bn: string | null; status: string; n: bigint }>>`
      SELECT br."id", br."name", br."banglaName" AS bn, sa."status"::text AS status, COUNT(*) AS n
      ${FROM_MARKS} JOIN "branches" br ON br."id" = s."branchId"
      WHERE ${where}${studentFilter} GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<Array<{ day: Date; status: string; n: bigint }>>`
      SELECT s."date" AS day, sa."status"::text AS status, COUNT(*) AS n
      ${FROM_MARKS} WHERE ${where}${studentFilter} GROUP BY 1, 2`,
  ]);

  const total = emptyCounts();
  for (const r of totals) addCount(total, r.status, int(r.n));

  const group = (rows: Array<{ id: string | null; name: string | null; bn: string | null; status: string; n: bigint }>) => {
    const map = new Map<string, { id: string | null; name: string | null; banglaName: string | null; counts: StatusCounts }>();
    for (const r of rows) {
      const key = r.id ?? '__none__';
      const cur = map.get(key) || { id: r.id, name: r.name, banglaName: r.bn, counts: emptyCounts() };
      addCount(cur.counts, r.status, int(r.n));
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((g) => ({ id: g.id, name: g.name, banglaName: g.banglaName, ...withPct(g.counts) }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const granularity = filters.granularity === 'day' && range.days > 93 ? 'week' : filters.granularity;
  const trendMap = new Map<string, StatusCounts>();
  for (const r of byDay) {
    const k = bucketKey(r.day.toISOString().slice(0, 10), granularity);
    const cur = trendMap.get(k) || emptyCounts();
    addCount(cur, r.status, int(r.n));
    trendMap.set(k, cur);
  }
  const trend = enumerateBuckets(range, granularity).map((k) => ({ bucket: k, ...withPct(trendMap.get(k) || emptyCounts()) }));

  return {
    data: {
      range: { from: range.from, to: range.to },
      granularity,
      totals: { sessions: int(sessions[0]?.n), ...withPct(total) },
      byBatch: group(byBatch),
      bySubject: group(bySubject),
      byBranch: group(byBranch),
      trend,
    },
  };
};

// ------------------------------------------------------------------
// Per student (+ low attendance)
// ------------------------------------------------------------------

async function perStudentRows(scope: ReportScope, filters: ReportFilters, range: DhakaRange) {
  const where = sessionSqlWhere(scope, filters, range);
  const search = filters.search
    ? Prisma.sql` AND (st."name" ILIKE ${'%' + filters.search + '%'} OR st."studentIdCode" ILIKE ${'%' + filters.search + '%'})`
    : Prisma.empty;
  const bySubject = !!filters.subjectId;
  const raw = await prisma.$queryRaw<
    Array<{ studentId: string; code: string; name: string; bn: string | null; batchId: string; batchName: string; batchBn: string | null; status: string; n: bigint }>
  >`
    SELECT sa."studentId" AS "studentId", st."studentIdCode" AS code, st."name", st."banglaName" AS bn,
           b."id" AS "batchId", b."name" AS "batchName", b."banglaName" AS "batchBn",
           sa."status"::text AS status, COUNT(*) AS n
    ${FROM_MARKS} JOIN "students" st ON st."id" = sa."studentId"
    WHERE ${where}${search}
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`;

  const map = new Map<string, { student: { id: string; studentIdCode: string; name: string; banglaName: string | null }; batch: { id: string; name: string; banglaName: string | null }; counts: StatusCounts }>();
  for (const r of raw) {
    const key = `${r.studentId}:${r.batchId}`;
    const cur =
      map.get(key) ||
      {
        student: { id: r.studentId, studentIdCode: r.code, name: r.name, banglaName: r.bn },
        batch: { id: r.batchId, name: r.batchName, banglaName: r.batchBn },
        counts: emptyCounts(),
      };
    addCount(cur.counts, r.status, int(r.n));
    map.set(key, cur);
  }
  return { bySubject, rows: Array.from(map.values()).map((r) => ({ student: r.student, batch: r.batch, ...withPct(r.counts) })) };
}

type StudentRow = Awaited<ReturnType<typeof perStudentRows>>['rows'][number];

const STUDENT_SORT: Record<string, (r: StudentRow) => string | number | null> = {
  percentage: (r) => r.percentage,
  name: (r) => r.student.name,
  studentIdCode: (r) => r.student.studentIdCode,
  batch: (r) => r.batch.name,
  absent: (r) => r.absent,
  present: (r) => r.present,
};

function studentExport(lang: 'en' | 'bn', subjectName: string | null) {
  const R = DICTIONARY[lang].reports;
  return [
    { header: R.col.studentId, value: (r: StudentRow) => r.student.studentIdCode },
    { header: R.col.name, value: (r: StudentRow) => pickName(lang, r.student.name, r.student.banglaName) },
    { header: R.col.batch, value: (r: StudentRow) => pickName(lang, r.batch.name, r.batch.banglaName) },
    { header: R.col.subject, value: () => subjectName ?? R.allSubjects },
    { header: R.col.present, value: (r: StudentRow) => r.present },
    { header: R.col.late, value: (r: StudentRow) => r.late },
    { header: R.col.absent, value: (r: StudentRow) => r.absent },
    { header: R.col.excused, value: (r: StudentRow) => r.excused },
    { header: R.col.attendancePct, value: (r: StudentRow) => r.percentage },
  ];
}

async function subjectLabel(scope: ReportScope, filters: ReportFilters) {
  if (!filters.subjectId) return null;
  const s = await prisma.subject.findFirst({ where: { id: filters.subjectId, coachingCenterId: scope.coachingCenterId }, select: { name: true, banglaName: true } });
  return s ? pickName(filters.lang, s.name, s.banglaName) : null;
}

export const attendanceStudents: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const { rows } = await perStudentRows(scope, filters, range);
  const sorted = sortRows(rows, STUDENT_SORT[filters.sort || 'name'] ?? STUDENT_SORT.name, filters.dir || 'asc');
  if (forExport && sorted.length > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  return {
    data: { range: { from: range.from, to: range.to }, ...paginate(sorted, filters.page, filters.pageSize) },
    export: { rows: sorted, columns: studentExport(filters.lang, await subjectLabel(scope, filters)) },
  };
};

export const attendanceLow: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const threshold = await getAttendanceThreshold(scope.coachingCenterId);
  const { rows } = await perStudentRows(scope, filters, range);
  // Same rule as getLowAttendanceStudents: at least one counted mark, strictly below threshold.
  const low = rows.filter((r) => r.percentage !== null && r.percentage < threshold);
  const sorted = sortRows(low, STUDENT_SORT[filters.sort || 'percentage'] ?? STUDENT_SORT.percentage, filters.dir || 'asc');
  if (forExport && sorted.length > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  return {
    data: { range: { from: range.from, to: range.to }, threshold, ...paginate(sorted, filters.page, filters.pageSize) },
    export: { rows: sorted, columns: studentExport(filters.lang, await subjectLabel(scope, filters)) },
  };
};

// ------------------------------------------------------------------
// Student drill-down (date-wise)
// ------------------------------------------------------------------

export const attendanceStudentDetail: ViewHandler = async ({ scope, filters, forExport }) => {
  if (!filters.studentId) throw new Error('INVALID_FILTER: studentId is required');
  const student = await prisma.student.findFirst({
    where: { id: filters.studentId, coachingCenterId: scope.coachingCenterId },
    select: { id: true, studentIdCode: true, name: true, banglaName: true, branchId: true },
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  if (scope.branchLocked && student.branchId && student.branchId !== scope.branchId) throw new Error('FORBIDDEN_BRANCH');

  const range = resolveRange(filters);
  const where = sessionSqlWhere(scope, filters, range);
  const rows = await prisma.$queryRaw<
    Array<{ date: Date; status: string; inTime: string | null; remarks: string | null; batchId: string; batchName: string; batchBn: string | null; subjectName: string | null; subjectBn: string | null; teacherName: string | null; teacherBn: string | null; startTime: string | null }>
  >`
    SELECT s."date", sa."status"::text AS status, sa."inTime" AS "inTime", sa."remarks",
           b."id" AS "batchId", b."name" AS "batchName", b."banglaName" AS "batchBn",
           sub."name" AS "subjectName", sub."banglaName" AS "subjectBn",
           t."name" AS "teacherName", t."banglaName" AS "teacherBn", s."startTime" AS "startTime"
    ${FROM_MARKS}
    LEFT JOIN "subjects" sub ON sub."id" = s."subjectId"
    LEFT JOIN "teachers" t ON t."id" = s."teacherId"
    WHERE ${where} AND sa."studentId" = ${student.id}
    ORDER BY s."date" DESC, s."startTime" DESC NULLS LAST
    LIMIT ${EXPORT_ROW_LIMIT + 1}`;
  if (forExport && rows.length > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');

  const counts = emptyCounts();
  for (const r of rows) addCount(counts, r.status, 1);
  const records = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    status: r.status,
    inTime: r.inTime,
    remarks: r.remarks,
    startTime: r.startTime,
    batch: { id: r.batchId, name: r.batchName, banglaName: r.batchBn },
    subject: r.subjectName ? { name: r.subjectName, banglaName: r.subjectBn } : null,
    teacher: r.teacherName ? { name: r.teacherName, banglaName: r.teacherBn } : null,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof records)[number];
  return {
    data: {
      range: { from: range.from, to: range.to },
      student: { id: student.id, studentIdCode: student.studentIdCode, name: student.name, banglaName: student.banglaName },
      totals: withPct(counts),
      ...paginate(records, filters.page, filters.pageSize),
    },
    export: {
      rows: records,
      columns: [
        { header: R.col.date, value: (r: Row) => r.date },
        { header: R.col.subject, value: (r: Row) => pickName(lang, r.subject?.name, r.subject?.banglaName) },
        { header: R.col.batch, value: (r: Row) => pickName(lang, r.batch.name, r.batch.banglaName) },
        { header: R.col.teacher, value: (r: Row) => pickName(lang, r.teacher?.name, r.teacher?.banglaName) },
        { header: R.col.status, value: (r: Row) => r.status },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Per batch
// ------------------------------------------------------------------

/**
 * Students per batch = StudentBatch memberships whose effective window
 * [joinedAt, endDate] overlaps the report range — historical members who
 * left before the range, or joined after it, are not counted.
 */
export async function batchMembershipCounts(coachingCenterId: string, batchIds: string[], range: DhakaRange) {
  if (batchIds.length === 0) return new Map<string, number>();
  const rows = await prisma.studentBatch.groupBy({
    by: ['batchId'],
    where: {
      coachingCenterId,
      batchId: { in: batchIds },
      joinedAt: { lt: range.endExclusive },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.batchId, r._count._all]));
}

export async function attendanceByBatch(scope: ReportScope, filters: ReportFilters, range: DhakaRange, onlyBatchIds?: string[]) {
  const base = sessionSqlWhere(scope, filters, range);
  const where = onlyBatchIds ? Prisma.sql`${base} AND ${sqlIn(Prisma.sql`s."batchId"`, onlyBatchIds)}` : base;
  const [marks, sessions] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; status: string; n: bigint }>>`
      SELECT b."id", sa."status"::text AS status, COUNT(*) AS n ${FROM_MARKS} WHERE ${where} GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ id: string; n: bigint }>>`
      SELECT b."id", COUNT(*) AS n FROM "attendance_sessions" s JOIN "batches" b ON b."id" = s."batchId" WHERE ${where} GROUP BY 1`,
  ]);
  const map = new Map<string, { sessions: number; counts: StatusCounts }>();
  for (const s of sessions) map.set(s.id, { sessions: int(s.n), counts: emptyCounts() });
  for (const m of marks) {
    const cur = map.get(m.id) || { sessions: 0, counts: emptyCounts() };
    addCount(cur.counts, m.status, int(m.n));
    map.set(m.id, cur);
  }
  return map;
}

export const attendanceBatches: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const agg = await attendanceByBatch(scope, filters, range);
  const ids = Array.from(agg.keys());
  const [batches, members] = await Promise.all([
    prisma.batch.findMany({
      where: { id: { in: ids }, coachingCenterId: scope.coachingCenterId },
      select: { id: true, name: true, banglaName: true, code: true, branch: { select: { name: true, banglaName: true } } },
    }),
    batchMembershipCounts(scope.coachingCenterId, ids, range),
  ]);
  const rows = batches.map((b) => {
    const a = agg.get(b.id)!;
    return { batch: b, students: members.get(b.id) ?? 0, sessions: a.sessions, ...withPct(a.counts) };
  });
  type Row = (typeof rows)[number];
  const sort: Record<string, (r: Row) => string | number | null> = {
    name: (r) => r.batch.name,
    percentage: (r) => r.percentage,
    sessions: (r) => r.sessions,
    students: (r) => r.students,
  };
  const sorted = sortRows(rows, sort[filters.sort || 'name'] ?? sort.name, filters.dir || 'asc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: { range: { from: range.from, to: range.to }, ...paginate(sorted, filters.page, filters.pageSize) },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.batch, value: (r: Row) => pickName(lang, r.batch.name, r.batch.banglaName) },
        { header: R.col.batchCode, value: (r: Row) => r.batch.code },
        { header: R.col.branch, value: (r: Row) => pickName(lang, r.batch.branch.name, r.batch.branch.banglaName) },
        { header: R.col.students, value: (r: Row) => r.students },
        { header: R.col.sessions, value: (r: Row) => r.sessions },
        { header: R.col.present, value: (r: Row) => r.present },
        { header: R.col.late, value: (r: Row) => r.late },
        { header: R.col.absent, value: (r: Row) => r.absent },
        { header: R.col.excused, value: (r: Row) => r.excused },
        { header: R.col.attendancePct, value: (r: Row) => r.percentage },
      ],
    },
  };
};
