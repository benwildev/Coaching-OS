import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { computePercentage } from '@/lib/services/attendance.service';
import { getBatchFinancialSummary } from '@/lib/services/financial-report.service';
import { canViewFinance, NO_MATCH_ID, type ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { attendanceByBatch, batchMembershipCounts } from './attendance-reports';
import { sqlIn } from './sql';
import { money, pickName, resolveRange, type ViewHandler } from './report-utils';

/**
 * Batch reports. Fee totals use the Phase 5 batch semantics of
 * getBatchFinancialSummary (all non-DRAFT/CANCELLED invoices of the batch's
 * currently ACTIVE students) — aggregated in SQL for the list, and the
 * existing service itself for the drill-down. A student in two batches is
 * therefore counted in both, exactly as the Batch → Financial tab shows.
 */

function batchWhere(scope: ReportScope, filters: ReportFilters): Prisma.BatchWhereInput {
  const and: Prisma.BatchWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (scope.teacher) and.push({ id: { in: scope.teacher.batchIds.length ? scope.teacher.batchIds : [NO_MATCH_ID] } });
  if (filters.batchId) and.push({ id: filters.batchId });
  if (filters.academicSessionId) and.push({ academicSessionId: filters.academicSessionId });
  if (filters.programId) and.push({ academicProgramId: filters.programId });
  if (filters.classId) and.push({ academicClassId: filters.classId });
  if (filters.groupId) and.push({ academicGroupId: filters.groupId });
  if (filters.courseId) and.push({ courseId: filters.courseId });
  if (filters.status) and.push({ status: filters.status });
  if (filters.search) and.push({ OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { code: { contains: filters.search, mode: 'insensitive' } }] });
  return { AND: and };
}

async function batchFeeTotals(coachingCenterId: string, batchIds: string[]) {
  if (batchIds.length === 0) return new Map<string, { billed: string; collected: string; due: string }>();
  const rows = await prisma.$queryRaw<Array<{ batchId: string; billed: Prisma.Decimal | null; paid: Prisma.Decimal | null; due: Prisma.Decimal | null }>>`
    SELECT sb."batchId" AS "batchId", SUM(i."totalAmount") AS billed, SUM(i."paidAmount") AS paid, SUM(i."dueAmount") AS due
    FROM "student_batches" sb
    JOIN "fee_invoices" i ON i."studentId" = sb."studentId" AND i."coachingCenterId" = ${coachingCenterId}
    WHERE sb."coachingCenterId" = ${coachingCenterId} AND sb."status" = 'ACTIVE'
      AND ${sqlIn(Prisma.sql`sb."batchId"`, batchIds)}
      AND i."status"::text NOT IN ('DRAFT', 'CANCELLED')
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.batchId, { billed: money(r.billed), collected: money(r.paid), due: money(r.due) }]));
}

export const batchList: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const where = batchWhere(scope, filters);
  const total = await prisma.batch.count({ where });
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const dir = filters.dir || 'asc';
  const batches = await prisma.batch.findMany({
    where,
    orderBy: [filters.sort === 'code' ? { code: dir } : filters.sort === 'status' ? { status: dir } : { name: dir }, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      name: true,
      banglaName: true,
      code: true,
      status: true,
      capacity: true,
      course: { select: { name: true, banglaName: true } },
      branch: { select: { name: true, banglaName: true } },
      academicSession: { select: { name: true, banglaName: true } },
      batchTeacherAssignments: {
        where: { status: 'ACTIVE' },
        select: { teacher: { select: { name: true, banglaName: true } }, subject: { select: { name: true, banglaName: true } } },
      },
      _count: { select: { classSchedules: { where: { status: 'ACTIVE' } }, studentBatches: { where: { status: 'ACTIVE' } } } },
    },
  });
  const ids = batches.map((b) => b.id);
  const showFees = canViewFinance(scope.user);
  const [members, attendance, fees] = await Promise.all([
    batchMembershipCounts(scope.coachingCenterId, ids, range),
    // One grouped query for the listed batches, same Phase 4 rules as the attendance report.
    // Batch-level filters were already applied by batchWhere, so only the range/teacher scope is reused.
    attendanceByBatch(scope, { ...filters, status: undefined, subjectId: undefined, teacherId: undefined }, range, ids),
    showFees ? batchFeeTotals(scope.coachingCenterId, ids) : Promise.resolve(null),
  ]);
  const rows = batches.map((b) => {
    const a = attendance.get(b.id);
    const counted = a ? a.counts.present + a.counts.late + a.counts.absent : 0;
    return {
      id: b.id,
      name: b.name,
      banglaName: b.banglaName,
      code: b.code,
      status: b.status,
      capacity: b.capacity,
      course: b.course,
      branch: b.branch,
      academicSession: b.academicSession,
      teachers: b.batchTeacherAssignments.map((x) => ({ teacher: x.teacher, subject: x.subject })),
      scheduleSlots: b._count.classSchedules,
      activeStudents: b._count.studentBatches,
      studentsInRange: members.get(b.id) ?? 0,
      sessions: a?.sessions ?? 0,
      attendancePct: a && counted > 0 ? computePercentage(a.counts) : null,
      fees: fees ? fees.get(b.id) ?? { billed: '0.00', collected: '0.00', due: '0.00' } : null,
    };
  });
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  const columns = [
    { header: R.col.batch, value: (r: Row) => pickName(lang, r.name, r.banglaName) },
    { header: R.col.batchCode, value: (r: Row) => r.code },
    { header: R.col.course, value: (r: Row) => pickName(lang, r.course?.name, r.course?.banglaName) },
    { header: R.col.branch, value: (r: Row) => pickName(lang, r.branch.name, r.branch.banglaName) },
    { header: R.col.teachers, value: (r: Row) => r.teachers.map((t) => `${pickName(lang, t.teacher.name, t.teacher.banglaName)} (${pickName(lang, t.subject.name, t.subject.banglaName)})`).join('; ') },
    { header: R.col.activeStudents, value: (r: Row) => r.activeStudents },
    { header: R.col.studentsInRange, value: (r: Row) => r.studentsInRange },
    { header: R.col.scheduleSlots, value: (r: Row) => r.scheduleSlots },
    { header: R.col.sessions, value: (r: Row) => r.sessions },
    { header: R.col.attendancePct, value: (r: Row) => r.attendancePct },
    ...(showFees
      ? [
          { header: `${R.col.invoiced} (BDT)`, value: (r: Row) => r.fees?.billed },
          { header: `${R.col.collectedNet} (BDT)`, value: (r: Row) => r.fees?.collected },
          { header: `${R.col.due} (BDT)`, value: (r: Row) => r.fees?.due },
        ]
      : []),
  ];
  return {
    data: { range: { from: range.from, to: range.to }, showFees, rows, total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) },
    export: { rows, columns },
  };
};

export const batchDetail: ViewHandler = async ({ scope, filters }) => {
  if (!filters.batchId) throw new Error('INVALID_FILTER: batchId is required');
  const batch = await prisma.batch.findFirst({
    where: batchWhere(scope, { ...filters, status: undefined, search: undefined }),
    select: {
      id: true,
      name: true,
      banglaName: true,
      code: true,
      status: true,
      capacity: true,
      startDate: true,
      endDate: true,
      course: { select: { name: true, banglaName: true } },
      branch: { select: { name: true, banglaName: true } },
      academicSession: { select: { name: true, banglaName: true } },
      academicClass: { select: { name: true, banglaName: true } },
      batchTeacherAssignments: {
        where: { status: 'ACTIVE' },
        select: { startDate: true, teacher: { select: { id: true, name: true, banglaName: true } }, subject: { select: { name: true, banglaName: true } } },
      },
      classSchedules: {
        where: { status: 'ACTIVE' },
        select: { id: true, dayOfWeek: true, startTime: true, endTime: true, subject: { select: { name: true, banglaName: true } }, teacher: { select: { name: true, banglaName: true } }, room: { select: { code: true } } },
      },
      studentBatches: {
        orderBy: [{ status: 'asc' }, { joinedAt: 'asc' }],
        select: { id: true, status: true, joinedAt: true, endDate: true, student: { select: { id: true, studentIdCode: true, name: true, banglaName: true } } },
      },
    },
  });
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  return {
    data: {
      showFees: canViewFinance(scope.user),
      batch: {
        ...batch,
        startDate: batch.startDate?.toISOString() ?? null,
        endDate: batch.endDate?.toISOString() ?? null,
        studentBatches: batch.studentBatches.map((sb) => ({ ...sb, joinedAt: sb.joinedAt.toISOString(), endDate: sb.endDate?.toISOString() ?? null })),
      },
    },
  };
};

/** Drill-down fees: the existing Phase 5 service, unchanged. */
export const batchFees: ViewHandler = async ({ scope, filters }) => {
  if (!canViewFinance(scope.user)) throw new Error('FORBIDDEN_REPORT');
  if (!filters.batchId) throw new Error('INVALID_FILTER: batchId is required');
  const visible = await prisma.batch.count({ where: batchWhere(scope, { ...filters, status: undefined, search: undefined }) });
  if (!visible) throw new Error('BATCH_NOT_FOUND');
  const summary = await getBatchFinancialSummary(scope.coachingCenterId, filters.batchId);
  if (!summary) throw new Error('BATCH_NOT_FOUND');
  return { data: { students: summary.students, totals: summary.totals } };
};
