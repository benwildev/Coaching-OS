import prisma from '@/lib/db';
import type { DayOfWeek, Prisma } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import { DAY_LABELS, WEEK_ORDER } from '@/lib/schedule';
import { NO_MATCH_ID, type ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { paginate, pickName, resolveOptionalRange, resolveRange, sortRows, type ViewHandler } from './report-utils';

/**
 * Teacher reports are factual listings only — assignments, schedule and
 * TeacherAttendance counts. There is deliberately no performance score and
 * no ranking. The system has no teacher-attendance percentage formula
 * (Phase 4 defines one only for students), so none is invented here.
 */

function teacherWhere(scope: ReportScope, filters: ReportFilters): Prisma.TeacherWhereInput {
  const and: Prisma.TeacherWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (scope.teacher) and.push({ id: scope.teacher.teacherId ?? NO_MATCH_ID });
  if (filters.teacherId) and.push({ id: filters.teacherId });
  if (filters.status) and.push({ status: filters.status });
  if (filters.subjectId) {
    and.push({ OR: [{ teacherSubjects: { some: { subjectId: filters.subjectId } } }, { batchTeacherAssignments: { some: { subjectId: filters.subjectId, status: 'ACTIVE' } } }] });
  }
  if (filters.batchId) and.push({ batchTeacherAssignments: { some: { batchId: filters.batchId, status: 'ACTIVE' } } });
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { banglaName: { contains: filters.search } },
        { teacherCode: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
}

export const teacherDirectory: ViewHandler = async ({ scope, filters, forExport }) => {
  const where = teacherWhere(scope, filters);
  const total = await prisma.teacher.count({ where });
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const dir = filters.dir || 'asc';
  const teachers = await prisma.teacher.findMany({
    where,
    orderBy: [filters.sort === 'teacherCode' ? { teacherCode: dir } : { name: dir }, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      teacherCode: true,
      name: true,
      banglaName: true,
      designation: true,
      status: true,
      branch: { select: { name: true, banglaName: true } },
      teacherSubjects: { select: { subject: { select: { name: true, banglaName: true } } } },
      batchTeacherAssignments: {
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          startDate: true,
          batch: { select: { id: true, name: true, banglaName: true } },
          subject: { select: { name: true, banglaName: true } },
          branch: { select: { name: true, banglaName: true } },
        },
      },
    },
  });
  const rows = teachers.map((t) => ({
    id: t.id,
    teacherCode: t.teacherCode,
    name: t.name,
    banglaName: t.banglaName,
    designation: t.designation,
    status: t.status,
    branch: t.branch,
    subjects: t.teacherSubjects.map((s) => s.subject),
    assignments: t.batchTeacherAssignments.map((a) => ({ id: a.id, startDate: a.startDate.toISOString(), batch: a.batch, subject: a.subject, branch: a.branch })),
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { rows, total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) },
    export: {
      rows,
      columns: [
        { header: R.col.teacherCode, value: (r: Row) => r.teacherCode },
        { header: R.col.teacher, value: (r: Row) => pickName(lang, r.name, r.banglaName) },
        { header: R.col.subject, value: (r: Row) => r.subjects.map((s) => pickName(lang, s.name, s.banglaName)).join('; ') },
        { header: R.col.activeAssignments, value: (r: Row) => r.assignments.map((a) => `${pickName(lang, a.batch.name, a.batch.banglaName)} — ${pickName(lang, a.subject.name, a.subject.banglaName)}`).join('; ') },
        { header: R.col.branch, value: (r: Row) => pickName(lang, r.branch?.name, r.branch?.banglaName) },
        { header: R.col.status, value: (r: Row) => r.status },
      ],
    },
  };
};

export const teacherSchedule: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveOptionalRange(filters);
  const and: Prisma.ClassScheduleWhereInput[] = [{ coachingCenterId: scope.coachingCenterId, status: 'ACTIVE' }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (scope.teacher) and.push({ teacherId: scope.teacher.teacherId ?? NO_MATCH_ID });
  if (filters.teacherId) and.push({ teacherId: filters.teacherId });
  if (filters.batchId) and.push({ batchId: filters.batchId });
  if (filters.subjectId) and.push({ subjectId: filters.subjectId });
  if (range) {
    // Slots whose effective window overlaps the selected range.
    and.push({ OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lt: range.endExclusive } }] });
    and.push({ OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: range.start } }] });
  }
  const slots = await prisma.classSchedule.findMany({
    where: { AND: and },
    take: EXPORT_ROW_LIMIT + 1,
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      effectiveStartDate: true,
      effectiveEndDate: true,
      teacher: { select: { id: true, name: true, banglaName: true } },
      batch: { select: { id: true, name: true, banglaName: true } },
      subject: { select: { name: true, banglaName: true } },
      room: { select: { name: true, code: true } },
      branch: { select: { name: true, banglaName: true } },
    },
  });
  if (forExport && slots.length > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const dayIndex = (d: DayOfWeek) => WEEK_ORDER.indexOf(d);
  const rows = [...slots]
    .sort((a, b) => dayIndex(a.dayOfWeek) - dayIndex(b.dayOfWeek) || a.startTime.localeCompare(b.startTime) || (a.teacher?.name || '').localeCompare(b.teacher?.name || ''))
    .map((s) => ({ ...s, effectiveStartDate: s.effectiveStartDate?.toISOString() ?? null, effectiveEndDate: s.effectiveEndDate?.toISOString() ?? null }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { ...paginate(rows, filters.page, filters.pageSize) },
    export: {
      rows,
      columns: [
        { header: R.col.teacher, value: (r: Row) => pickName(lang, r.teacher?.name, r.teacher?.banglaName) },
        { header: R.col.day, value: (r: Row) => (lang === 'bn' ? DAY_LABELS[r.dayOfWeek].bn : DAY_LABELS[r.dayOfWeek].en) },
        { header: R.col.batch, value: (r: Row) => pickName(lang, r.batch.name, r.batch.banglaName) },
        { header: R.col.subject, value: (r: Row) => pickName(lang, r.subject.name, r.subject.banglaName) },
        { header: R.col.room, value: (r: Row) => r.room?.code ?? '' },
        { header: R.col.startTime, value: (r: Row) => r.startTime },
        { header: R.col.endTime, value: (r: Row) => r.endTime },
      ],
    },
  };
};

export const teacherAttendance: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const teacherFilter = teacherWhere(scope, { ...filters, status: undefined, search: undefined, subjectId: undefined, batchId: undefined });
  const grouped = await prisma.teacherAttendance.groupBy({
    by: ['teacherId', 'status'],
    where: { coachingCenterId: scope.coachingCenterId, date: { gte: range.dateFrom, lte: range.dateTo }, teacher: teacherFilter },
    _count: { _all: true },
  });
  const ids = Array.from(new Set(grouped.map((g) => g.teacherId)));
  const teachers = await prisma.teacher.findMany({
    where: { id: { in: ids }, coachingCenterId: scope.coachingCenterId },
    select: { id: true, teacherCode: true, name: true, banglaName: true, branch: { select: { name: true, banglaName: true } } },
  });
  const rows = teachers.map((t) => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const g of grouped.filter((x) => x.teacherId === t.id)) {
      const key = g.status.toLowerCase() as keyof typeof c;
      c[key] += g._count._all;
    }
    return { teacher: t, ...c, days: c.present + c.absent + c.late + c.excused };
  });
  type Row = (typeof rows)[number];
  const sorted = sortRows(rows, (r: Row) => r.teacher.name, filters.dir || 'asc');
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  return {
    data: { range: { from: range.from, to: range.to }, ...paginate(sorted, filters.page, filters.pageSize) },
    export: {
      rows: sorted,
      columns: [
        { header: R.col.teacherCode, value: (r: Row) => r.teacher.teacherCode },
        { header: R.col.teacher, value: (r: Row) => pickName(lang, r.teacher.name, r.teacher.banglaName) },
        { header: R.col.present, value: (r: Row) => r.present },
        { header: R.col.late, value: (r: Row) => r.late },
        { header: R.col.absent, value: (r: Row) => r.absent },
        { header: R.col.excused, value: (r: Row) => r.excused },
        { header: R.col.recordedDays, value: (r: Row) => r.days },
      ],
    },
  };
};
