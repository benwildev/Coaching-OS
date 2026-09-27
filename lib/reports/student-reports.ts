import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { NO_MATCH_ID, type ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { enumerateBuckets, bucketKey, previousRange, type DhakaRange } from './dates';
import { dhakaDateOf, sqlAnd, sqlIn } from './sql';
import { int, pct, pickName, resolveRange, type ViewHandler } from './report-utils';

/**
 * Student reports. Academic filters (year/program/class/group/course) are
 * applied through StudentEnrollment — the historical record — never through
 * a "current" pointer, so a past academic year reports the students that
 * were actually enrolled in it.
 */

function enrollmentFilter(filters: ReportFilters): Prisma.StudentEnrollmentWhereInput | null {
  const w: Prisma.StudentEnrollmentWhereInput = {};
  if (filters.academicSessionId) w.academicSessionId = filters.academicSessionId;
  if (filters.programId) w.academicProgramId = filters.programId;
  if (filters.classId) w.academicClassId = filters.classId;
  if (filters.groupId) w.academicGroupId = filters.groupId;
  if (filters.courseId) w.courseId = filters.courseId;
  return Object.keys(w).length ? w : null;
}

export function studentScopeWhere(scope: ReportScope, filters: ReportFilters): Prisma.StudentWhereInput {
  const and: Prisma.StudentWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (scope.teacher) {
    const ids = scope.teacher.batchIds.length ? scope.teacher.batchIds : [NO_MATCH_ID];
    and.push({ studentBatches: { some: { batchId: { in: ids }, status: 'ACTIVE' } } });
  }
  const enr = enrollmentFilter(filters);
  if (enr) and.push({ enrollments: { some: enr } });
  if (filters.batchId) and.push({ studentBatches: { some: { batchId: filters.batchId } } });
  if (filters.status) and.push({ status: filters.status });
  if (filters.search) {
    const q = filters.search;
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { banglaName: { contains: q } },
        { studentIdCode: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    });
  }
  return { AND: and };
}

// ------------------------------------------------------------------
// Directory
// ------------------------------------------------------------------

const DIRECTORY_SORT: Record<string, Prisma.StudentOrderByWithRelationInput> = {
  name: { name: 'asc' },
  studentIdCode: { studentIdCode: 'asc' },
  createdAt: { createdAt: 'asc' },
  status: { status: 'asc' },
};

export const studentDirectory: ViewHandler = async ({ scope, filters, forExport }) => {
  const where = studentScopeWhere(scope, filters);
  const sortKey = filters.sort && DIRECTORY_SORT[filters.sort] ? filters.sort : 'studentIdCode';
  const dir = filters.dir || 'asc';
  const orderBy = { [Object.keys(DIRECTORY_SORT[sortKey])[0]]: dir } as Prisma.StudentOrderByWithRelationInput;
  const enr = enrollmentFilter(filters) ?? {};

  const total = await prisma.student.count({ where });
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');

  const students = await prisma.student.findMany({
    where,
    orderBy: [orderBy, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      studentIdCode: true,
      name: true,
      banglaName: true,
      phone: true,
      status: true,
      createdAt: true,
      branch: { select: { name: true, banglaName: true } },
      enrollments: {
        where: enr,
        orderBy: { admissionDate: 'desc' },
        take: 1,
        select: {
          status: true,
          admissionDate: true,
          academicSession: { select: { name: true, banglaName: true } },
          academicProgram: { select: { name: true, banglaName: true } },
          academicClass: { select: { name: true, banglaName: true } },
          academicGroup: { select: { name: true, banglaName: true } },
        },
      },
      studentBatches: {
        where: filters.batchId ? { batchId: filters.batchId } : { status: 'ACTIVE' },
        orderBy: { joinedAt: 'desc' },
        select: { status: true, batch: { select: { id: true, name: true, banglaName: true } } },
      },
    },
  });

  const rows = students.map((s) => {
    const e = s.enrollments[0];
    return {
      id: s.id,
      studentIdCode: s.studentIdCode,
      name: s.name,
      banglaName: s.banglaName,
      phone: s.phone,
      status: s.status,
      branch: s.branch,
      academicSession: e?.academicSession ?? null,
      program: e?.academicProgram ?? null,
      class: e?.academicClass ?? null,
      group: e?.academicGroup ?? null,
      enrollmentStatus: e?.status ?? null,
      admissionDate: e?.admissionDate ?? null,
      batches: s.studentBatches.map((sb) => ({ ...sb.batch, membershipStatus: sb.status })),
    };
  });

  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.studentId, value: (r: Row) => r.studentIdCode },
        { header: R.col.name, value: (r: Row) => pickName(lang, r.name, r.banglaName) },
        { header: R.col.mobile, value: (r: Row) => r.phone },
        { header: R.col.academicYear, value: (r: Row) => pickName(lang, r.academicSession?.name, r.academicSession?.banglaName) },
        { header: R.col.program, value: (r: Row) => pickName(lang, r.program?.name, r.program?.banglaName) },
        { header: R.col.class, value: (r: Row) => pickName(lang, r.class?.name, r.class?.banglaName) },
        { header: R.col.group, value: (r: Row) => pickName(lang, r.group?.name, r.group?.banglaName) },
        { header: R.col.batch, value: (r: Row) => r.batches.map((b) => pickName(lang, b.name, b.banglaName)).join('; ') },
        { header: R.col.branch, value: (r: Row) => pickName(lang, r.branch?.name, r.branch?.banglaName) },
        { header: R.col.studentStatus, value: (r: Row) => r.status },
        { header: R.col.enrollmentStatus, value: (r: Row) => r.enrollmentStatus },
        { header: R.col.admissionDate, value: (r: Row) => (r.admissionDate ? r.admissionDate.toISOString().slice(0, 10) : '') },
      ],
    },
  };
};

// ------------------------------------------------------------------
// Enrollment
// ------------------------------------------------------------------

function enrollmentScopeWhere(scope: ReportScope, filters: ReportFilters): Prisma.StudentEnrollmentWhereInput {
  const and: Prisma.StudentEnrollmentWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  const enr = enrollmentFilter(filters);
  if (enr) and.push(enr);
  if (filters.status) and.push({ status: filters.status });
  if (filters.batchId) and.push({ student: { studentBatches: { some: { batchId: filters.batchId } } } });
  if (scope.teacher) {
    const ids = scope.teacher.batchIds.length ? scope.teacher.batchIds : [NO_MATCH_ID];
    and.push({ student: { studentBatches: { some: { batchId: { in: ids }, status: 'ACTIVE' } } } });
  }
  return { AND: and };
}

function enrollmentSqlWhere(scope: ReportScope, filters: ReportFilters, range: DhakaRange): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`e."coachingCenterId" = ${scope.coachingCenterId}`,
    Prisma.sql`e."admissionDate" >= ${range.start}`,
    Prisma.sql`e."admissionDate" < ${range.endExclusive}`,
  ];
  if (scope.branchId) parts.push(Prisma.sql`e."branchId" = ${scope.branchId}`);
  if (filters.academicSessionId) parts.push(Prisma.sql`e."academicSessionId" = ${filters.academicSessionId}`);
  if (filters.programId) parts.push(Prisma.sql`e."academicProgramId" = ${filters.programId}`);
  if (filters.classId) parts.push(Prisma.sql`e."academicClassId" = ${filters.classId}`);
  if (filters.groupId) parts.push(Prisma.sql`e."academicGroupId" = ${filters.groupId}`);
  if (filters.courseId) parts.push(Prisma.sql`e."courseId" = ${filters.courseId}`);
  if (filters.status) parts.push(Prisma.sql`e."status" = ${filters.status}`);
  if (filters.batchId) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "student_batches" sb WHERE sb."studentId" = e."studentId" AND sb."batchId" = ${filters.batchId})`);
  }
  if (scope.teacher) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "student_batches" sb WHERE sb."studentId" = e."studentId" AND sb."status" = 'ACTIVE' AND ${sqlIn(Prisma.sql`sb."batchId"`, scope.teacher.batchIds)})`
    );
  }
  return sqlAnd(parts);
}

export const studentEnrollment: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const enrollmentWhere = enrollmentScopeWhere(scope, filters);
  const studentWhere = studentScopeWhere(scope, { ...filters, status: undefined, search: undefined });
  const admissionsWhere: Prisma.StudentEnrollmentWhereInput = {
    AND: [enrollmentWhere, { admissionDate: { gte: range.start, lt: range.endExclusive } }],
  };

  const batchWhere: Prisma.StudentBatchWhereInput = {
    coachingCenterId: scope.coachingCenterId,
    ...(filters.batchId ? { batchId: filters.batchId } : {}),
    ...(scope.teacher ? { batchId: { in: scope.teacher.batchIds.length ? scope.teacher.batchIds : [NO_MATCH_ID] } } : {}),
    batch: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {}),
      ...(filters.programId ? { academicProgramId: filters.programId } : {}),
      ...(filters.classId ? { academicClassId: filters.classId } : {}),
      ...(filters.groupId ? { academicGroupId: filters.groupId } : {}),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
    },
  };

  const [studentStatus, newAdmissions, byBranch, byProgram, bySession, byBatch, trendRows, prevAdmissions] = await Promise.all([
    prisma.student.groupBy({ by: ['status'], where: studentWhere, _count: { _all: true } }),
    prisma.studentEnrollment.count({ where: admissionsWhere }),
    prisma.studentEnrollment.groupBy({ by: ['branchId'], where: enrollmentWhere, _count: { _all: true } }),
    prisma.studentEnrollment.groupBy({ by: ['academicProgramId'], where: enrollmentWhere, _count: { _all: true } }),
    prisma.studentEnrollment.groupBy({ by: ['academicSessionId'], where: enrollmentWhere, _count: { _all: true } }),
    prisma.studentBatch.groupBy({ by: ['batchId', 'status'], where: batchWhere, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT ${dhakaDateOf(Prisma.sql`e."admissionDate"`)} AS day, COUNT(*) AS count
      FROM "student_enrollments" e
      WHERE ${enrollmentSqlWhere(scope, filters, range)}
      GROUP BY 1`,
    filters.compare === 'previous'
      ? (() => {
          const prev = previousRange(range);
          return prisma.studentEnrollment.count({
            where: { AND: [enrollmentWhere, { admissionDate: { gte: prev.start, lt: prev.endExclusive } }] },
          });
        })()
      : Promise.resolve(null),
  ]);

  const branchIds = byBranch.map((b) => b.branchId).filter((v): v is string => !!v);
  const [branches, programs, sessions, batches] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds }, coachingCenterId: scope.coachingCenterId }, select: { id: true, name: true, banglaName: true } }),
    prisma.academicProgram.findMany({ where: { id: { in: byProgram.map((p) => p.academicProgramId) }, coachingCenterId: scope.coachingCenterId }, select: { id: true, name: true, banglaName: true } }),
    prisma.academicSession.findMany({ where: { id: { in: bySession.map((p) => p.academicSessionId) }, coachingCenterId: scope.coachingCenterId }, select: { id: true, name: true, banglaName: true, startDate: true } }),
    prisma.batch.findMany({ where: { id: { in: Array.from(new Set(byBatch.map((b) => b.batchId))) }, coachingCenterId: scope.coachingCenterId }, select: { id: true, name: true, banglaName: true, code: true } }),
  ]);

  const statusCounts = studentStatus.map((s) => ({ status: s.status, count: s._count._all })).sort((a, b) => b.count - a.count);
  const totalStudents = statusCounts.reduce((s, r) => s + r.count, 0);

  const batchMap = new Map<string, { active: number; total: number }>();
  for (const row of byBatch) {
    const cur = batchMap.get(row.batchId) || { active: 0, total: 0 };
    cur.total += row._count._all;
    if (row.status === 'ACTIVE') cur.active += row._count._all;
    batchMap.set(row.batchId, cur);
  }

  const granularity = filters.granularity === 'day' && range.days > 93 ? 'month' : filters.granularity;
  const trendMap = new Map<string, number>();
  for (const r of trendRows) {
    const k = bucketKey(r.day, granularity);
    trendMap.set(k, (trendMap.get(k) || 0) + int(r.count));
  }
  const trend = enumerateBuckets(range, granularity).map((k) => ({ bucket: k, count: trendMap.get(k) || 0 }));

  const byBranchRows = byBranch
    .map((b) => ({ id: b.branchId, branch: branches.find((x) => x.id === b.branchId) ?? null, count: b._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    data: {
      range: { from: range.from, to: range.to },
      granularity,
      totals: {
        totalStudents,
        active: statusCounts.find((s) => s.status === 'ACTIVE')?.count ?? 0,
        inactive: statusCounts.find((s) => s.status === 'INACTIVE')?.count ?? 0,
        newAdmissions,
      },
      comparison:
        prevAdmissions === null
          ? null
          : {
              previousRange: (() => {
                const p = previousRange(range);
                return { from: p.from, to: p.to };
              })(),
              previousAdmissions: prevAdmissions,
              difference: newAdmissions - prevAdmissions,
              changePct: prevAdmissions > 0 ? pct(newAdmissions - prevAdmissions, prevAdmissions) : null,
            },
      byBranch: byBranchRows,
      byProgram: byProgram
        .map((p) => ({ id: p.academicProgramId, program: programs.find((x) => x.id === p.academicProgramId) ?? null, count: p._count._all }))
        .sort((a, b) => b.count - a.count),
      bySession: bySession
        .map((p) => ({ id: p.academicSessionId, session: sessions.find((x) => x.id === p.academicSessionId) ?? null, count: p._count._all }))
        .sort((a, b) => (b.session?.startDate?.getTime() ?? 0) - (a.session?.startDate?.getTime() ?? 0)),
      byBatch: Array.from(batchMap.entries())
        .map(([id, c]) => ({ id, batch: batches.find((x) => x.id === id) ?? null, ...c }))
        .sort((a, b) => b.active - a.active),
      trend,
    },
  };
};

// ------------------------------------------------------------------
// Status distribution
// ------------------------------------------------------------------

export const studentStatus: ViewHandler = async ({ scope, filters }) => {
  const studentWhere = studentScopeWhere(scope, { ...filters, status: undefined, search: undefined });
  const enrollmentWhere = enrollmentScopeWhere(scope, { ...filters, status: undefined });
  const [students, enrollments, memberships] = await Promise.all([
    prisma.student.groupBy({ by: ['status'], where: studentWhere, _count: { _all: true } }),
    prisma.studentEnrollment.groupBy({ by: ['status'], where: enrollmentWhere, _count: { _all: true } }),
    prisma.studentBatch.groupBy({
      by: ['status'],
      where: {
        coachingCenterId: scope.coachingCenterId,
        ...(filters.batchId ? { batchId: filters.batchId } : {}),
        ...(scope.teacher ? { batchId: { in: scope.teacher.batchIds.length ? scope.teacher.batchIds : [NO_MATCH_ID] } } : {}),
        batch: {
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          ...(filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {}),
          ...(filters.programId ? { academicProgramId: filters.programId } : {}),
          ...(filters.classId ? { academicClassId: filters.classId } : {}),
        },
      },
      _count: { _all: true },
    }),
  ]);
  const shape = (rows: Array<{ status: string; _count: { _all: number } }>) => {
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    return {
      total,
      rows: rows
        .map((r) => ({ status: r.status, count: r._count._all, share: pct(r._count._all, total) }))
        .sort((a, b) => b.count - a.count),
    };
  };
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  const studentRows = shape(students);
  type Row = { status: string; count: number; share: number | null };
  return {
    data: { students: studentRows, enrollments: shape(enrollments), memberships: shape(memberships) },
    export: {
      rows: studentRows.rows,
      columns: [
        { header: R.col.studentStatus, value: (r: Row) => r.status },
        { header: R.col.students, value: (r: Row) => r.count },
        { header: R.col.sharePct, value: (r: Row) => r.share },
      ],
    },
  };
};
