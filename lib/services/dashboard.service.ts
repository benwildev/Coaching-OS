import prisma from '@/lib/db';
import type { Prisma, AttendanceStatus } from '@prisma/client';
import {
  getCurrentDhakaDateOnly,
  getCurrentDhakaDayOfWeek,
  isScheduleActiveOnDate,
  parseTimeToMinutes,
} from '@/lib/schedule';
import { getSystemSettings } from './settings.service';
import { getAttendanceThreshold, getTodaysClasses } from './attendance.service';

// Every figure on the owner dashboard is derived from real tenant rows. When a
// module has no data yet the section renders an empty state — nothing here is
// fabricated, interpolated or forecast.

const DAY_MS = 24 * 60 * 60 * 1000;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka has no DST

// Configurable via SystemSetting; these are only the fallbacks.
const DEFAULT_WEEKLY_CLASS_TARGET = 20;
const DEFAULT_LOW_SCORE_THRESHOLD = 65;

export const DASHBOARD_RANGES = [1, 3, 6, 12] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardParams {
  classId?: string;
  range?: DashboardRange;
}

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function dhakaNow(date: Date = new Date()) {
  const x = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), min: x.getUTCMinutes() };
}

/** Instant of 00:00 Asia/Dhaka on the 1st of month `m` (may be negative/overflow). */
function dhakaMonthStart(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS);
}

/** Index of the month bucket (0 = oldest) an instant falls into, or -1 if outside [starts[0], end). */
function monthIndex(at: Date, starts: Date[], end: Date): number {
  const t = at.getTime();
  if (t >= end.getTime()) return -1;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (t >= starts[i].getTime()) return i;
  }
  return -1;
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const isAttended = (s: AttendanceStatus) => s === 'PRESENT' || s === 'LATE';
const countsForRate = (s: AttendanceStatus) => s !== 'EXCUSED';

function rate(present: number, total: number): number | null {
  return total > 0 ? Math.round((present / total) * 1000) / 10 : null;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getDashboardData(coachingCenterId: string, params: DashboardParams = {}) {
  const cc = coachingCenterId;
  const range: DashboardRange = params.range && DASHBOARD_RANGES.includes(params.range) ? params.range : 3;
  const classId = params.classId && params.classId !== 'all' ? params.classId : undefined;

  const now = new Date();
  const dn = dhakaNow(now);
  const today = getCurrentDhakaDateOnly(now); // UTC-midnight date-only value
  const todayKey = dateKey(today);
  const todayStart = new Date(today.getTime() - DHAKA_OFFSET_MS); // 00:00 Dhaka as an instant
  const nowMinutes = dn.h * 60 + dn.min;

  // Month buckets: enough history for the chart (≥6) and for range-vs-previous-range deltas.
  const chartMonths = Math.max(6, range);
  const bucketCount = Math.max(chartMonths, range * 2);
  const monthStarts = Array.from({ length: bucketCount }, (_, i) => dhakaMonthStart(dn.y, dn.m - (bucketCount - 1 - i)));
  const historyStart = monthStarts[0];
  const thisMonthStart = monthStarts[bucketCount - 1];
  const nextMonthStart = dhakaMonthStart(dn.y, dn.m + 1);

  const [settings, attendanceThreshold, classes] = await Promise.all([
    getSystemSettings(cc),
    getAttendanceThreshold(cc),
    prisma.academicClass.findMany({
      where: { coachingCenterId: cc },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const weeklyTarget = Number(settings['teacher_weekly_class_target']) > 0 ? Number(settings['teacher_weekly_class_target']) : DEFAULT_WEEKLY_CLASS_TARGET;
  const lowScore = Number(settings['low_score_threshold']) > 0 ? Number(settings['low_score_threshold']) : DEFAULT_LOW_SCORE_THRESHOLD;

  // ---------- Class scope ----------
  let scopedStudentIds: string[] | undefined;
  let scopedBatchIds: string[] | undefined;
  if (classId) {
    const [classBatches, classEnrollments] = await Promise.all([
      prisma.batch.findMany({ where: { coachingCenterId: cc, academicClassId: classId }, select: { id: true } }),
      prisma.studentEnrollment.findMany({ where: { coachingCenterId: cc, academicClassId: classId }, select: { studentId: true } }),
    ]);
    scopedBatchIds = classBatches.map((b) => b.id);
    const members = await prisma.studentBatch.findMany({
      where: { coachingCenterId: cc, batchId: { in: scopedBatchIds } },
      select: { studentId: true },
    });
    scopedStudentIds = Array.from(new Set([...members.map((m) => m.studentId), ...classEnrollments.map((e) => e.studentId)]));
  }
  const studentScope = scopedStudentIds ? { studentId: { in: scopedStudentIds } } : {};
  const batchScope = scopedBatchIds ? { batchId: { in: scopedBatchIds } } : {};

  const attendanceWindowStart = new Date(today.getTime() - 35 * DAY_MS);
  const resultsWindowStart = new Date(today.getTime() - 120 * DAY_MS);

  const [
    center,
    students,
    enrollments,
    batches,
    teachers,
    schedules,
    marks,
    invoicesInWindow,
    outstandingInvoices,
    payments,
    recentPayments,
    exams,
    results,
    recentSessions,
    recentComms,
    todaysClassesRaw,
    examSubjectsToday,
  ] = await Promise.all([
    prisma.coachingCenter.findUnique({ where: { id: cc }, select: { name: true, district: true, branches: { select: { name: true }, take: 1 } } }),
    prisma.student.findMany({
      where: { coachingCenterId: cc, ...(scopedStudentIds ? { id: { in: scopedStudentIds } } : {}) },
      select: { id: true, name: true, status: true, createdAt: true },
    }),
    prisma.studentEnrollment.findMany({
      where: { coachingCenterId: cc, ...studentScope },
      select: { studentId: true, admissionDate: true, academicClass: { select: { name: true } } },
    }),
    prisma.batch.findMany({
      where: { coachingCenterId: cc, status: 'ACTIVE', ...(classId ? { academicClassId: classId } : {}) },
      select: {
        id: true,
        name: true,
        capacity: true,
        startDate: true,
        createdAt: true,
        academicClass: { select: { name: true } },
        academicGroup: { select: { name: true } },
        batchTeacherAssignments: { where: { status: 'ACTIVE' }, select: { teacher: { select: { name: true } } }, take: 1 },
        studentBatches: {
          where: { status: 'ACTIVE', OR: [{ endDate: null }, { endDate: { gte: today } }] },
          select: { studentId: true },
        },
      },
    }),
    prisma.teacher.findMany({ where: { coachingCenterId: cc, status: 'ACTIVE' }, select: { id: true, name: true, createdAt: true } }),
    prisma.classSchedule.findMany({
      where: { coachingCenterId: cc, status: 'ACTIVE', batch: { status: 'ACTIVE', ...(classId ? { academicClassId: classId } : {}) } },
      select: {
        teacherId: true,
        dayOfWeek: true,
        effectiveStartDate: true,
        effectiveEndDate: true,
        subject: { select: { name: true } },
        batch: { select: { academicClass: { select: { name: true } } } },
      },
    }),
    prisma.studentAttendance.findMany({
      where: { attendanceSession: { coachingCenterId: cc, date: { gte: attendanceWindowStart, lte: today }, ...batchScope } },
      select: { status: true, studentId: true, attendanceSession: { select: { date: true, batchId: true } } },
    }),
    prisma.feeInvoice.findMany({
      where: { coachingCenterId: cc, status: { notIn: ['DRAFT', 'CANCELLED'] }, invoiceDate: { gte: historyStart }, ...studentScope },
      select: { invoiceDate: true, totalAmount: true },
    }),
    prisma.feeInvoice.findMany({
      where: { coachingCenterId: cc, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] }, dueAmount: { gt: 0 }, ...studentScope },
      select: { studentId: true, dueAmount: true, dueDate: true, invoiceDate: true },
    }),
    prisma.payment.findMany({
      where: { coachingCenterId: cc, status: { not: 'VOIDED' }, paymentDate: { gte: historyStart }, ...studentScope },
      select: { amount: true, paymentDate: true },
    }),
    prisma.payment.findMany({
      where: { coachingCenterId: cc, status: { not: 'VOIDED' }, ...studentScope },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        createdAt: true,
        student: { select: { name: true, studentBatches: { where: { status: 'ACTIVE' }, select: { batch: { select: { name: true } } }, take: 1 } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.exam.findMany({
      where: { coachingCenterId: cc, startDate: { gte: historyStart }, ...(classId ? { academicClassId: classId } : {}) },
      select: {
        id: true,
        title: true,
        startDate: true,
        batch: { select: { name: true } },
        academicClass: { select: { name: true } },
        _count: { select: { examStudents: true } },
      },
      orderBy: { startDate: 'asc' },
    }),
    prisma.result.findMany({
      where: { examSubject: { exam: { coachingCenterId: cc, startDate: { gte: resultsWindowStart } } }, ...studentScope },
      select: {
        studentId: true,
        marksObtained: true,
        createdAt: true,
        student: { select: { name: true } },
        examSubject: { select: { totalMarks: true, exam: { select: { id: true, title: true, startDate: true, batch: { select: { name: true } }, academicClass: { select: { name: true } } } } } },
      },
    }),
    prisma.attendanceSession.findMany({
      where: { coachingCenterId: cc, status: 'COMPLETED', completedAt: { not: null }, ...batchScope },
      select: {
        id: true,
        completedAt: true,
        batch: { select: { name: true } },
        teacher: { select: { name: true } },
        subject: { select: { name: true } },
        studentAttendances: { select: { status: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
    }),
    prisma.communicationLog.findMany({
      where: { coachingCenterId: cc },
      select: { id: true, channel: true, message: true, sentAt: true, status: true },
      orderBy: { sentAt: 'desc' },
      take: 4,
    }),
    getTodaysClasses(cc),
    prisma.examSubject.findMany({
      where: {
        examDate: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) },
        exam: { coachingCenterId: cc, ...(classId ? { academicClassId: classId } : {}) },
      },
      select: {
        id: true,
        startTime: true,
        durationMinutes: true,
        subject: { select: { name: true } },
        exam: { select: { title: true, batch: { select: { name: true } }, academicClass: { select: { name: true } }, _count: { select: { examStudents: true } } } },
      },
    }),
  ]);

  // ---------- Students & admissions ----------
  const activeStudents = students.filter((s) => s.status === 'ACTIVE');
  const admissionAt = new Map<string, Date>();
  for (const s of students) admissionAt.set(s.id, s.createdAt);
  for (const e of enrollments) {
    const prev = admissionAt.get(e.studentId);
    if (!prev || e.admissionDate < prev) admissionAt.set(e.studentId, e.admissionDate);
  }
  const admissionsByMonth = new Array(bucketCount).fill(0);
  for (const at of admissionAt.values()) {
    const i = monthIndex(at, monthStarts, nextMonthStart);
    if (i >= 0) admissionsByMonth[i]++;
  }
  const studentsAtMonthEnd = monthStarts.map((start, i) => {
    const end = i + 1 < bucketCount ? monthStarts[i + 1] : now;
    return activeStudents.filter((s) => (admissionAt.get(s.id) || s.createdAt) < end).length;
  });
  const activeBeforeThisMonth = activeStudents.filter((s) => (admissionAt.get(s.id) || s.createdAt) < thisMonthStart).length;

  const sumLast = (arr: number[], k: number) => arr.slice(bucketCount - k).reduce((a, b) => a + b, 0);
  const sumPrev = (arr: number[], k: number) => arr.slice(bucketCount - 2 * k, bucketCount - k).reduce((a, b) => a + b, 0);

  // ---------- Fees ----------
  const billedByMonth = new Array(bucketCount).fill(0);
  for (const inv of invoicesInWindow) {
    const i = monthIndex(inv.invoiceDate, monthStarts, nextMonthStart);
    if (i >= 0) billedByMonth[i] += n(inv.totalAmount);
  }
  const collectedByMonth = new Array(bucketCount).fill(0);
  for (const p of payments) {
    const i = monthIndex(p.paymentDate, monthStarts, nextMonthStart);
    if (i >= 0) collectedByMonth[i] += n(p.amount);
  }

  const aging = [
    { label: '0–30 days', min: -Infinity, max: 30, amount: 0 },
    { label: '31–60 days', min: 31, max: 60, amount: 0 },
    { label: '61–90 days', min: 61, max: 90, amount: 0 },
    { label: '90+ days', min: 91, max: Infinity, amount: 0 },
  ];
  const lateStudents = new Set<string>();
  const overdueByStudent = new Map<string, { amount: number; invoices: number }>();
  let outstandingTotal = 0;
  let late30Amount = 0;
  for (const inv of outstandingInvoices) {
    const due = n(inv.dueAmount);
    outstandingTotal += due;
    const ref = inv.dueDate || inv.invoiceDate;
    const daysLate = Math.floor((todayStart.getTime() - ref.getTime()) / DAY_MS);
    const bucket = aging.find((b) => daysLate <= b.max && daysLate >= b.min) || aging[0];
    bucket.amount += due;
    if (daysLate > 30) {
      late30Amount += due;
      lateStudents.add(inv.studentId);
    }
    if (daysLate > 0) {
      const o = overdueByStudent.get(inv.studentId) || { amount: 0, invoices: 0 };
      o.amount += due;
      o.invoices++;
      overdueByStudent.set(inv.studentId, o);
    }
  }

  // ---------- Attendance ----------
  const byDay = new Map<string, { p: number; t: number }>();
  const byBatch30 = new Map<string, { p: number; t: number }>();
  const byStudent30 = new Map<string, { p: number; t: number }>();
  const thirtyAgo = new Date(today.getTime() - 30 * DAY_MS);
  for (const m of marks) {
    if (!countsForRate(m.status)) continue;
    const hit = isAttended(m.status) ? 1 : 0;
    const d = m.attendanceSession.date;
    const k = dateKey(d);
    const day = byDay.get(k) || { p: 0, t: 0 };
    day.p += hit;
    day.t++;
    byDay.set(k, day);
    if (d >= thirtyAgo) {
      const b = byBatch30.get(m.attendanceSession.batchId) || { p: 0, t: 0 };
      b.p += hit;
      b.t++;
      byBatch30.set(m.attendanceSession.batchId, b);
      const s = byStudent30.get(m.studentId) || { p: 0, t: 0 };
      s.p += hit;
      s.t++;
      byStudent30.set(m.studentId, s);
    }
  }
  const todayAtt = byDay.get(todayKey);
  const todayRate = todayAtt ? rate(todayAtt.p, todayAtt.t) : null;
  let p30 = 0;
  let t30 = 0;
  for (const [k, v] of byDay) {
    if (k !== todayKey && new Date(k) >= thirtyAgo) {
      p30 += v.p;
      t30 += v.t;
    }
  }
  const avg30 = rate(p30, t30);
  const dailyRates = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => (v.p / v.t) * 100);

  // Heatmap: 5 weeks, Saturday → Thursday (Friday is the weekly holiday).
  const todayDow = today.getUTCDay(); // 0 = Sun … 6 = Sat
  const lastSaturday = new Date(today.getTime() - ((todayDow + 1) % 7) * DAY_MS);
  const heatmap = Array.from({ length: 5 }, (_, w) => {
    const weekStart = new Date(lastSaturday.getTime() - (4 - w) * 7 * DAY_MS);
    return {
      label: `${weekStart.getUTCDate()} ${weekStart.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`,
      days: Array.from({ length: 6 }, (_, i) => {
        const d = new Date(weekStart.getTime() + i * DAY_MS);
        const v = byDay.get(dateKey(d));
        return { date: dateKey(d), future: d > today, value: v ? rate(v.p, v.t) : null };
      }),
    };
  });

  // ---------- Results ----------
  const pctOf = (r: (typeof results)[number]) => {
    const total = n(r.examSubject.totalMarks);
    return total > 0 ? (n(r.marksObtained) / total) * 100 : 0;
  };
  const studentScores = new Map<string, { name: string; scores: { pct: number; at: Date }[] }>();
  for (const r of results) {
    const entry = studentScores.get(r.studentId) || { name: r.student.name, scores: [] };
    entry.scores.push({ pct: pctOf(r), at: r.examSubject.exam.startDate });
    studentScores.set(r.studentId, entry);
  }
  const avgScore = (id: string) => {
    const s = studentScores.get(id);
    return s && s.scores.length ? s.scores.reduce((a, b) => a + b.pct, 0) / s.scores.length : null;
  };

  // Student -> active batch (first) for labels, and batch -> students for aggregates.
  const studentBatch = new Map<string, string>();
  for (const b of batches) for (const sb of b.studentBatches) if (!studentBatch.has(sb.studentId)) studentBatch.set(sb.studentId, b.name);

  const topPerformers = Array.from(studentScores.entries())
    .map(([id, s]) => {
      const sorted = [...s.scores].sort((a, b) => a.at.getTime() - b.at.getTime());
      const avg = sorted.reduce((a, b) => a + b.pct, 0) / sorted.length;
      let delta: number | null = null;
      if (sorted.length >= 2) {
        const prior = sorted.slice(0, -1);
        delta = sorted[sorted.length - 1].pct - prior.reduce((a, b) => a + b.pct, 0) / prior.length;
      }
      return { id, name: s.name, batch: studentBatch.get(id) || '', avg, delta, exams: sorted.length };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);

  // ---------- Batches ----------
  const batchPerformance = batches
    .map((b) => {
      const ids = b.studentBatches.map((s) => s.studentId);
      const scores = ids.map(avgScore).filter((v): v is number => v != null);
      const att = byBatch30.get(b.id);
      return {
        id: b.id,
        name: b.name,
        group: b.academicGroup?.name || 'General',
        students: ids.length,
        score: scores.length ? Math.round((scores.reduce((a, c) => a + c, 0) / scores.length) * 10) / 10 : null,
        attendance: att ? rate(att.p, att.t) : null,
      };
    })
    .filter((b) => b.score != null || b.attendance != null)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const occupancy = batches
    .map((b) => ({
      id: b.id,
      name: b.name,
      teacher: b.batchTeacherAssignments[0]?.teacher.name || null,
      enrolled: b.studentBatches.length,
      capacity: b.capacity,
    }))
    .sort((a, b) => b.enrolled / (b.capacity || 1) - a.enrolled / (a.capacity || 1));

  const batchesOpenedThisMonth = batches.filter((b) => (b.startDate || b.createdAt) >= thisMonthStart).length;

  // ---------- Teachers ----------
  const todayDay = getCurrentDhakaDayOfWeek(now);
  const liveSchedules = schedules.filter((s) => isScheduleActiveOnDate(s, today));
  const workloadMap = new Map<string, { count: number; subjects: Set<string>; classes: Set<string> }>();
  for (const s of liveSchedules) {
    if (!s.teacherId) continue;
    const w = workloadMap.get(s.teacherId) || { count: 0, subjects: new Set(), classes: new Set() };
    w.count++;
    w.subjects.add(s.subject.name);
    w.classes.add(s.batch.academicClass.name);
    workloadMap.set(s.teacherId, w);
  }
  const scopedTeachers = classId ? teachers.filter((t) => workloadMap.has(t.id)) : teachers;
  const teacherWorkload = scopedTeachers
    .filter((t) => workloadMap.has(t.id))
    .map((t) => {
      const w = workloadMap.get(t.id)!;
      return { id: t.id, name: t.name, perWeek: w.count, subjects: Array.from(w.subjects), classes: Array.from(w.classes) };
    })
    .sort((a, b) => b.perWeek - a.perWeek)
    .slice(0, 8);
  const classesTodayCount = liveSchedules.filter((s) => s.dayOfWeek === todayDay).length;

  // ---------- Exams ----------
  const in14 = new Date(todayStart.getTime() + 14 * DAY_MS);
  const in7 = new Date(todayStart.getTime() + 7 * DAY_MS);
  const upcomingExams = exams.filter((e) => e.startDate >= todayStart && e.startDate < in14);
  const examsByMonth = new Array(bucketCount).fill(0);
  for (const e of exams) {
    const i = monthIndex(e.startDate, monthStarts, nextMonthStart);
    if (i >= 0) examsByMonth[i]++;
  }

  // ---------- Today's schedule ----------
  const scopedToday = scopedBatchIds ? todaysClassesRaw.filter((c) => scopedBatchIds!.includes(c.schedule.batchId)) : todaysClassesRaw;
  const statusFor = (start: string, end: string, done: boolean) => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (done || nowMinutes >= e) return 'done' as const;
    if (nowMinutes >= s) return 'live' as const;
    return 'next' as const;
  };
  const todaysAgenda = [
    ...scopedToday.map((c) => ({
      id: c.schedule.id,
      time: c.schedule.startTime,
      title: `${c.schedule.batch.name} · ${c.schedule.subject.name}`,
      sub: [c.schedule.teacher?.name, c.schedule.room?.name, `${c.eligibleStudentCount} students`].filter(Boolean).join(' · '),
      kind: 'class' as const,
      status: statusFor(c.schedule.startTime, c.schedule.endTime, c.session?.status === 'COMPLETED'),
      href: '/attendance',
    })),
    ...examSubjectsToday.map((x) => {
      const start = x.startTime || '00:00';
      const endMin = parseTimeToMinutes(start) + x.durationMinutes;
      const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      return {
        id: x.id,
        time: start,
        title: `${x.exam.title} · ${x.subject.name}`,
        sub: [x.exam.batch?.name || x.exam.academicClass.name, `${x.exam._count.examStudents} students`].join(' · '),
        kind: 'exam' as const,
        status: statusFor(start, end, false),
        href: '/exams',
      };
    }),
  ].sort((a, b) => a.time.localeCompare(b.time));

  // ---------- Needs attention ----------
  const flagged = activeStudents
    .map((s) => {
      const att = byStudent30.get(s.id);
      const attRate = att && att.t >= 3 ? rate(att.p, att.t) : null;
      const score = avgScore(s.id);
      const overdue = overdueByStudent.get(s.id);
      const flags = {
        attendance: attRate != null && attRate < attendanceThreshold,
        score: score != null && score < lowScore,
        fees: !!overdue,
      };
      const count = Number(flags.attendance) + Number(flags.score) + Number(flags.fees);
      let reason = '';
      if (flags.attendance && att) reason = `Missed ${att.t - att.p} of the last ${att.t} classes`;
      else if (flags.fees && overdue) reason = `${overdue.invoices} overdue invoice${overdue.invoices > 1 ? 's' : ''}`;
      else if (flags.score) reason = `Average ${Math.round(score!)}% across ${studentScores.get(s.id)!.scores.length} results`;
      return { id: s.id, name: s.name, batch: studentBatch.get(s.id) || '', attRate, score, due: overdue?.amount || 0, flags, count, reason };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || (a.attRate ?? 100) - (b.attRate ?? 100))
    .slice(0, 5);

  // ---------- Activity feed ----------
  const examResults = new Map<string, { title: string; where: string; at: Date; sum: number; count: number }>();
  for (const r of results) {
    const e = r.examSubject.exam;
    const entry = examResults.get(e.id) || { title: e.title, where: e.batch?.name || e.academicClass.name, at: r.createdAt, sum: 0, count: 0 };
    entry.sum += pctOf(r);
    entry.count++;
    if (r.createdAt > entry.at) entry.at = r.createdAt;
    examResults.set(e.id, entry);
  }
  const METHOD_LABEL: Record<string, string> = { CASH: 'cash', BKASH: 'bKash', NAGAD: 'Nagad', BANK: 'bank transfer', CARD: 'card', OTHER: 'other' };
  const newest = [...students].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 4);
  const classByStudent = new Map(enrollments.map((e) => [e.studentId, e.academicClass.name]));

  const activity = [
    ...recentPayments.map((p) => ({
      id: `pay-${p.id}`,
      kind: 'payment' as const,
      amount: n(p.amount),
      title: `received via ${METHOD_LABEL[p.paymentMethod] || p.paymentMethod}`,
      sub: [p.student.name, p.student.studentBatches[0]?.batch.name].filter(Boolean).join(' · '),
      at: p.createdAt,
    })),
    ...newest.map((s) => ({
      id: `adm-${s.id}`,
      kind: 'admission' as const,
      amount: null,
      title: 'New admission',
      sub: [s.name, studentBatch.get(s.id) || classByStudent.get(s.id)].filter(Boolean).join(' · '),
      at: s.createdAt,
    })),
    ...recentSessions.map((s) => {
      const counted = s.studentAttendances.filter((a) => countsForRate(a.status));
      return {
        id: `att-${s.id}`,
        kind: 'attendance' as const,
        amount: null,
        title: `Attendance marked: ${counted.filter((a) => isAttended(a.status)).length} of ${counted.length} present`,
        sub: [s.batch.name, s.subject?.name, s.teacher?.name].filter(Boolean).join(' · '),
        at: s.completedAt!,
      };
    }),
    ...Array.from(examResults.entries()).map(([id, e]) => ({
      id: `res-${id}`,
      kind: 'result' as const,
      amount: null,
      title: `Results published: ${e.title}`,
      sub: `${e.where} · average ${Math.round(e.sum / e.count)}%`,
      at: e.at,
    })),
    ...recentComms.map((c) => ({
      id: `com-${c.id}`,
      kind: 'message' as const,
      amount: null,
      title: `${c.channel === 'EMAIL' ? 'Email' : c.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'} ${c.status.toLowerCase()}`,
      sub: c.message.length > 70 ? c.message.slice(0, 70) + '…' : c.message,
      at: c.sentAt,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 7);

  // ---------- KPIs ----------
  const chartSlice = (arr: number[]) => arr.slice(bucketCount - chartMonths);
  const admissionsNow = sumLast(admissionsByMonth, range);
  const admissionsPrev = sumPrev(admissionsByMonth, range);
  const collectedNow = sumLast(collectedByMonth, range);
  const collectedPrev = sumPrev(collectedByMonth, range);
  const billedNow = sumLast(billedByMonth, range);

  return {
    center: {
      name: center?.name || '',
      branch: center?.branches[0]?.name || center?.district || '',
    },
    filters: { classId: classId || 'all', range, classes },
    generatedAt: now,
    kpis: {
      students: { value: activeStudents.length, delta: pctChange(activeStudents.length, activeBeforeThisMonth), spark: chartSlice(studentsAtMonthEnd) },
      admissions: { value: admissionsNow, delta: pctChange(admissionsNow, admissionsPrev), spark: chartSlice(admissionsByMonth) },
      batches: { value: batches.length, opened: batchesOpenedThisMonth, spark: chartSlice(monthStarts.map((s, i) => batches.filter((b) => (b.startDate || b.createdAt) < (monthStarts[i + 1] || now)).length)) },
      attendance: { value: todayRate, avg30, spark: dailyRates.slice(-12) },
      collected: { value: collectedNow, delta: pctChange(collectedNow, collectedPrev), billed: billedNow, spark: chartSlice(collectedByMonth) },
      outstanding: { value: outstandingTotal, lateStudents: lateStudents.size, spark: chartSlice(billedByMonth.map((b, i) => Math.max(0, b - collectedByMonth[i]))) },
      exams: { value: upcomingExams.length, thisWeek: upcomingExams.filter((e) => e.startDate < in7).length, spark: chartSlice(examsByMonth) },
      teachers: { value: scopedTeachers.length, classesToday: classesTodayCount, spark: chartSlice(monthStarts.map((s, i) => scopedTeachers.filter((t) => t.createdAt < (monthStarts[i + 1] || now)).length)) },
    },
    feeChart: chartSlice(monthStarts.map((s, i) => i)).map((i) => ({
      label: new Date(monthStarts[i].getTime() + DHAKA_OFFSET_MS).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      billed: billedByMonth[i],
      collected: collectedByMonth[i],
      current: i === bucketCount - 1,
    })),
    outstanding: { total: outstandingTotal, invoices: outstandingInvoices.length, aging: aging.map(({ label, amount }) => ({ label, amount })), late30Amount, lateStudents: lateStudents.size },
    heatmap,
    activity,
    todaysAgenda,
    upcomingExams: upcomingExams.slice(0, 5).map((e) => ({
      id: e.id,
      title: e.title,
      date: e.startDate,
      where: e.batch?.name || e.academicClass.name,
      students: e._count.examStudents,
    })),
    batchPerformance,
    lowScore,
    topPerformers,
    teacherWorkload,
    weeklyTarget,
    needsAttention: flagged,
    attendanceThreshold,
    occupancy,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
