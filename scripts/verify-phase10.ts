import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { markStudentAttendance, completeAttendanceSession, getStudentAttendanceSummary, getAttendanceThreshold } from '../lib/services/attendance.service';
import { createInvoice } from '../lib/services/invoice.service';
import { createPayment, refundPayment } from '../lib/services/payment.service';
import { getFeeDashboard, getBatchFinancialSummary } from '../lib/services/financial-report.service';
import { bulkSaveSubjectResults, verifyAndPublishExam, getStudentResultHistory } from '../lib/services/exam-result.service';
import { runReport } from '../lib/reports/run-report';
import { reportFilterSchema } from '../lib/reports/filters';
import { getReportOptions } from '../lib/reports/options';
import { addDays, todayDhaka } from '../lib/reports/dates';
import { toDateOnly } from '../lib/schedule';
import type { ReportCategory } from '../lib/reports/access';
import type { SessionUser } from '../lib/auth/session';

/**
 * Phase 10 runtime verification (Reports & Analytics) against the configured
 * database. Builds throwaway tenants through the real Phase 4–6 services and
 * removes everything it created in `finally` (CoachingCenter cascade).
 */

const TAG = `P10VERIFY-${Date.now()}`;
const CODE_A = `P10A${Date.now().toString().slice(-7)}`;
const CODE_B = `P10B${Date.now().toString().slice(-7)}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function run(user: SessionUser, category: ReportCategory, f: Record<string, string>): Promise<any> {
  const out = await runReport(user, category, reportFilterSchema.parse(f));
  if (out.kind !== 'json') throw new Error('expected json');
  return out.data;
}
async function csv(user: SessionUser, category: ReportCategory, f: Record<string, string>) {
  const out = await runReport(user, category, reportFilterSchema.parse({ ...f, format: 'csv' }));
  if (out.kind !== 'csv') throw new Error('expected csv');
  return out;
}
async function expectCode(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.startsWith(code), `${label} (got: ${msg})`);
    ok(label);
    return;
  }
  throw new Error(`FAIL: ${label} (did not throw)`);
}

/** Parses the CSV this module writes (quoted cells, CRLF rows). */
function parseCsv(body: string): string[][] {
  const text = body.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  return rows;
}

async function setupTenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name,
    centerCode: code,
    centerPhone: '01700000000',
    centerCity: 'Dhaka',
    centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`,
    ownerEmail: `${code.toLowerCase()}-owner@verify.local`,
    ownerPhone: '01700000001',
    ownerPassword: 'VerifyPass123',
    branchName: 'Main Campus',
    branchCode: 'MAIN',
    sessionName: '2026',
    sessionStartDate: '2026-01-01',
    sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC'],
    primaryColor: '#063B78',
    accentColor: '#FFD200',
  } as any);
}

async function run10() {
  console.log('========================================================');
  console.log('PHASE 10 RUNTIME VERIFICATION — Reports & Analytics');
  console.log('========================================================');
  let centerA: string | null = null;
  let centerB: string | null = null;

  try {
    // =====================================================================
    // Fixtures
    // =====================================================================
    console.log('\n--- Fixtures (temporary tenant) ---');
    const setup = await setupTenant(CODE_A, `${TAG} Center`);
    centerA = setup.center.id;
    const cc = centerA;
    const main = setup.branch;
    const s2026 = setup.session;
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: cc, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: cc, academicProgramId: program.id } });
    const s2025 = await prisma.academicSession.create({ data: { coachingCenterId: cc, name: '2025', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') } });
    const branch2 = await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Branch 2`, code: 'B2' } });

    const mkUser = (role: 'ADMIN' | 'STAFF' | 'TEACHER', branchId: string | null, n: string) =>
      prisma.user.create({ data: { coachingCenterId: cc, branchId, email: `${n}-${CODE_A.toLowerCase()}@verify.local`, passwordHash: 'x', name: `${TAG} ${n}` } });
    const [adminU, staffU, staffB2U, teacherU, teacher2U] = await Promise.all([
      mkUser('ADMIN', null, 'admin'),
      mkUser('STAFF', main.id, 'staff'),
      mkUser('STAFF', branch2.id, 'staffb2'),
      mkUser('TEACHER', main.id, 'teacher'),
      mkUser('TEACHER', main.id, 'teacher2'),
    ]);
    const su = (u: { id: string; email: string; name: string }, role: SessionUser['role'], branchId: string | null): SessionUser => ({ userId: u.id, email: u.email, name: u.name, role, coachingCenterId: cc, branchId });
    const owner = su(setup.owner, 'OWNER', main.id);
    const admin = su(adminU, 'ADMIN', null);
    const staff = su(staffU, 'STAFF', main.id);
    const staffB2 = su(staffB2U, 'STAFF', branch2.id);
    const teacherUser = su(teacherU, 'TEACHER', main.id);
    const teacher2User = su(teacher2U, 'TEACHER', main.id);

    const S1 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Physics`, banglaName: 'পদার্থবিজ্ঞান', code: `${TAG}-PHY` } });
    const S2 = await prisma.subject.create({ data: { coachingCenterId: cc, academicClassId: klass.id, name: `${TAG} Chemistry`, code: `${TAG}-CHE` } });
    const T1 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: main.id, userId: teacherU.id, teacherCode: `${TAG}-T1`, name: `${TAG} Teacher One`, phone: '01711111111' } });
    const T2 = await prisma.teacher.create({ data: { coachingCenterId: cc, branchId: main.id, userId: teacher2U.id, teacherCode: `${TAG}-T2`, name: `${TAG} Teacher Two`, phone: '01722222222' } });

    const mkBatch = (branchId: string, sessionId: string, code: string) =>
      prisma.batch.create({ data: { coachingCenterId: cc, branchId, academicSessionId: sessionId, academicProgramId: program.id, academicClassId: klass.id, name: `${TAG} ${code}`, code: `${TAG}-${code}`, status: 'ACTIVE' } });
    const batchA = await mkBatch(main.id, s2026.id, 'A');
    const batchB = await mkBatch(branch2.id, s2026.id, 'B');
    const batchOld = await mkBatch(main.id, s2025.id, 'OLD');
    await prisma.batchTeacherAssignment.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, subjectId: S1.id, teacherId: T1.id, status: 'ACTIVE' } });
    await prisma.teacherSubject.create({ data: { teacherId: T1.id, subjectId: S1.id } });
    const schedS1 = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, subjectId: S1.id, teacherId: T1.id, dayOfWeek: 'MONDAY', startTime: '16:00', endTime: '17:00' } });
    const schedS2 = await prisma.classSchedule.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, subjectId: S2.id, teacherId: T2.id, dayOfWeek: 'TUESDAY', startTime: '16:00', endTime: '17:00' } });

    const today = todayDhaka();
    const rangeFrom = addDays(today, -30);
    const joined = new Date('2026-01-01T00:00:00Z');
    const mkStudent = async (code: string, name: string, branchId: string, bn?: string) =>
      prisma.student.create({ data: { coachingCenterId: cc, branchId, studentIdCode: `${TAG}-${code}`, name: `${TAG} ${name}`, banglaName: bn, phone: '0181111' + code.slice(-4).padStart(4, '0') } });
    const st1 = await mkStudent('S0001', 'Rahim', main.id, 'রহিম উদ্দিন');
    const st2 = await mkStudent('S0002', 'Karim', main.id);
    const st3 = await mkStudent('S0003', 'Nadia', main.id);
    const st4 = await mkStudent('S0004', 'Branch Two Student', branch2.id);
    const st5 = await mkStudent('S0005', 'Old Year Student', main.id);
    const st6 = await mkStudent('S0006', 'Transferred Student', main.id);
    for (const s of [st1, st2, st3]) await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: s.id, batchId: batchA.id, joinedAt: joined, status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: st4.id, batchId: batchB.id, joinedAt: joined, status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: st5.id, batchId: batchOld.id, joinedAt: new Date('2025-01-01T00:00:00Z'), status: 'ACTIVE' } });
    await prisma.studentBatch.create({ data: { coachingCenterId: cc, studentId: st6.id, batchId: batchA.id, joinedAt: joined, endDate: new Date('2026-02-01T00:00:00Z'), status: 'TRANSFERRED' } });

    const enr = (studentId: string, branchId: string, sessionId: string, admissionDate: Date) =>
      prisma.studentEnrollment.create({ data: { coachingCenterId: cc, studentId, branchId, academicSessionId: sessionId, academicProgramId: program.id, academicClassId: klass.id, admissionDate } });
    const recent = new Date(`${addDays(today, -10)}T06:00:00Z`);
    await enr(st1.id, main.id, s2026.id, recent);
    await enr(st2.id, main.id, s2026.id, recent);
    await enr(st3.id, main.id, s2026.id, new Date('2026-02-10T06:00:00Z'));
    await enr(st4.id, branch2.id, s2026.id, recent);
    await enr(st5.id, main.id, s2025.id, new Date('2025-02-10T06:00:00Z'));
    await enr(st6.id, main.id, s2026.id, new Date('2026-01-05T06:00:00Z'));
    ok('Tenant, branches, academic years, users (OWNER/ADMIN/STAFF/TEACHER), batches, students, enrollments created');

    // ---- Attendance via Phase 4 services: 10 S1 sessions (teacher T1) ----
    // st1: 7 P, 1 L, 2 A → (7+1)/(7+1+2) = 80%; st2: 5 P, 5 A → 50%; st3: 9 P + 1 EXCUSED → 100%.
    const plan: Record<string, string[]> = {
      [st1.id]: ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'ABSENT'],
      [st2.id]: ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
      [st3.id]: ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'EXCUSED'],
    };
    const sessionDates: string[] = [];
    for (let i = 0; i < 10; i++) {
      const day = addDays(today, -15 + i);
      sessionDates.push(day);
      const sess = await prisma.attendanceSession.create({
        data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, classScheduleId: schedS1.id, subjectId: S1.id, teacherId: T1.id, startTime: '16:00', endTime: '17:00', date: toDateOnly(day), status: 'OPEN' },
      });
      for (const [sid, marks] of Object.entries(plan)) await markStudentAttendance(cc, sess.id, sid, { status: marks[i] as any }, owner.userId);
      await completeAttendanceSession(cc, sess.id, true, owner.userId);
    }
    // One S2 session (teacher T2, NOT T1's subject): st1 absent.
    const sessS2 = await prisma.attendanceSession.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, classScheduleId: schedS2.id, subjectId: S2.id, teacherId: T2.id, date: toDateOnly(addDays(today, -4)), status: 'OPEN' } });
    await markStudentAttendance(cc, sessS2.id, st1.id, { status: 'ABSENT' }, owner.userId);
    await completeAttendanceSession(cc, sessS2.id, true, owner.userId);
    // An OPEN (not completed) session with a mark — must never be counted.
    const sessOpen = await prisma.attendanceSession.create({ data: { coachingCenterId: cc, branchId: main.id, batchId: batchA.id, subjectId: S1.id, teacherId: T1.id, date: toDateOnly(addDays(today, -2)), type: 'SPECIAL', status: 'OPEN' } });
    await markStudentAttendance(cc, sessOpen.id, st1.id, { status: 'ABSENT' }, owner.userId);
    // Branch 2 session: st4 present.
    const sessB = await prisma.attendanceSession.create({ data: { coachingCenterId: cc, branchId: branch2.id, batchId: batchB.id, date: toDateOnly(addDays(today, -5)), status: 'OPEN' } });
    await markStudentAttendance(cc, sessB.id, st4.id, { status: 'PRESENT' }, owner.userId);
    await completeAttendanceSession(cc, sessB.id, true, owner.userId);
    // Teacher attendance: T1 3 present, 1 absent, 1 late.
    for (const [i, status] of (['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LATE'] as const).entries()) {
      await prisma.teacherAttendance.create({ data: { coachingCenterId: cc, teacherId: T1.id, date: toDateOnly(addDays(today, -10 + i)), status } });
    }
    ok('Attendance recorded through Phase 4 markStudentAttendance/completeAttendanceSession');

    // ---- Finance via Phase 5 services ----
    const inv = (studentId: string, branchId: string, amount: number, extra: Record<string, unknown> = {}) =>
      createInvoice(cc, { studentId, branchId, invoiceDate: new Date().toISOString(), dueDate: null, items: [{ description: `${TAG} fee`, quantity: 1, unitAmount: amount, discountAmount: 0 }], discountAmount: 0, waiverAmount: 0, notes: null, issueNow: true, ...extra } as any, owner.userId);
    const I1 = await inv(st1.id, main.id, 1000, { discountAmount: 100 }); // total 900
    const I2 = await inv(st2.id, main.id, 600, { dueDate: new Date(Date.now() - 5 * 86400000).toISOString() }); // overdue
    const I3 = await inv(st4.id, branch2.id, 300);
    const I4 = await inv(st3.id, main.id, 250);
    await inv(st3.id, main.id, 999, { issueNow: false }); // DRAFT — excluded everywhere
    const P1 = await createPayment(cc, I1.id, { amount: 500, paymentMethod: 'BKASH', transactionId: 'TX1', paymentDate: new Date().toISOString() } as any, owner.userId);
    await createPayment(cc, I1.id, { amount: 200, paymentMethod: 'CASH', paymentDate: new Date().toISOString() } as any, owner.userId);
    await createPayment(cc, I3.id, { amount: 300, paymentMethod: 'CASH', paymentDate: new Date().toISOString() } as any, owner.userId);
    // Asia/Dhaka boundary: 00:30 local on D is 18:30 UTC on D-1.
    const boundaryDay = addDays(today, -3);
    await createPayment(cc, I4.id, { amount: 250, paymentMethod: 'NAGAD', paymentDate: `${boundaryDay}T00:30:00+06:00` } as any, owner.userId);
    await refundPayment(cc, P1.payment.id, { amount: 100, reason: `${TAG} refund` } as any, owner.userId);
    ok('Invoices, discount, payments (4 methods incl. Dhaka-midnight edge), refund created through Phase 5 services');

    // ---- Exams via Phase 6 services ----
    const exam = await prisma.exam.create({
      data: {
        coachingCenterId: cc, branchId: main.id, academicSessionId: s2026.id, academicProgramId: program.id, academicClassId: klass.id, batchId: batchA.id,
        title: `${TAG} Monthly`, examType: 'MONTHLY', status: 'ONGOING', startDate: new Date(`${addDays(today, -7)}T04:00:00Z`),
        examSubjects: { create: [{ subjectId: S1.id, totalMarks: 100, passMarks: 33 }, { subjectId: S2.id, totalMarks: 100, passMarks: 33 }] },
        examStudents: { create: [{ studentId: st1.id }, { studentId: st2.id }, { studentId: st3.id }] },
      },
      include: { examSubjects: true },
    });
    const esS1 = exam.examSubjects.find((e) => e.subjectId === S1.id)!;
    const esS2 = exam.examSubjects.find((e) => e.subjectId === S2.id)!;
    await bulkSaveSubjectResults(cc, exam.id, esS1.id, [
      { studentId: st1.id, status: 'PRESENT', marksObtained: 85 },
      { studentId: st2.id, status: 'PRESENT', marksObtained: 30 },
      { studentId: st3.id, status: 'PRESENT', marksObtained: 72 },
    ], owner);
    await bulkSaveSubjectResults(cc, exam.id, esS2.id, [
      { studentId: st1.id, status: 'PRESENT', marksObtained: 65 },
      { studentId: st2.id, status: 'ABSENT' },
      { studentId: st3.id, status: 'PRESENT', marksObtained: 50 },
    ], owner);
    await verifyAndPublishExam(cc, exam.id, owner.userId, true);
    const draftExam = await prisma.exam.create({
      data: {
        coachingCenterId: cc, branchId: main.id, academicSessionId: s2026.id, academicProgramId: program.id, academicClassId: klass.id, batchId: batchA.id,
        title: `${TAG} Weekly (unpublished)`, examType: 'WEEKLY', status: 'ONGOING', startDate: new Date(`${addDays(today, -2)}T04:00:00Z`),
        examSubjects: { create: [{ subjectId: S1.id, totalMarks: 50, passMarks: 17 }] },
        examStudents: { create: [{ studentId: st1.id }] },
      },
      include: { examSubjects: true },
    });
    await bulkSaveSubjectResults(cc, draftExam.id, draftExam.examSubjects[0].id, [{ studentId: st1.id, status: 'PRESENT', marksObtained: 45 }], owner);
    ok('Exam marks saved with Phase 6 bulkSaveSubjectResults; one exam published, one left unpublished');

    // ---- Communication (Phase 8 shapes) ----
    const log = (channel: 'SMS' | 'WHATSAPP' | 'EMAIL', status: string, branchId: string | null, event: string) =>
      prisma.communicationLog.create({ data: { coachingCenterId: cc, branchId, studentId: st1.id, channel, status, event, provider: status === 'SKIPPED' ? null : 'test', errorMessage: status === 'SKIPPED' ? 'PROVIDER_NOT_CONFIGURED' : null, message: `${TAG} message`, recipientPhone: '01800000000' } });
    await log('SMS', 'SENT', main.id, 'FEE_PAYMENT_RECEIVED');
    await log('SMS', 'SKIPPED', main.id, 'ATTENDANCE_ABSENT');
    await log('SMS', 'SKIPPED', main.id, 'ATTENDANCE_ABSENT');
    await log('WHATSAPP', 'FAILED', main.id, 'RESULT_PUBLISHED');
    await log('EMAIL', 'SENT', branch2.id, 'FEE_INVOICE_CREATED');
    await prisma.notice.create({ data: { coachingCenterId: cc, branchId: main.id, title: `${TAG} Notice`, content: 'x', targetAudience: 'BRANCH', status: 'PUBLISHED', isPublished: true, publishedAt: new Date() } });
    await prisma.notification.create({ data: { coachingCenterId: cc, userId: staffU.id, title: `${TAG} n1`, body: 'x', type: 'INFO', isRead: true, readAt: new Date() } });
    await prisma.notification.create({ data: { coachingCenterId: cc, studentId: st1.id, title: `${TAG} n2`, body: 'x', type: 'RESULT_PUBLISHED' } });
    ok('Communication logs (incl. SKIPPED/PROVIDER_NOT_CONFIGURED), notice, notifications created');

    // ---- Second tenant for isolation ----
    const setupB = await setupTenant(CODE_B, `${TAG} Other Center`);
    centerB = setupB.center.id;
    const otherStudent = await prisma.student.create({ data: { coachingCenterId: centerB, branchId: setupB.branch.id, studentIdCode: `${TAG}-OTHER`, name: `${TAG} Other Tenant Student` } });
    await createInvoice(centerB, { studentId: otherStudent.id, branchId: setupB.branch.id, invoiceDate: new Date().toISOString(), dueDate: null, items: [{ description: 'x', quantity: 1, unitAmount: 7777, discountAmount: 0 }], discountAmount: 0, waiverAmount: 0, notes: null, issueNow: true } as any, setupB.owner.id);
    ok('Second tenant with its own student + invoice created');

    const R = { dateFrom: rangeFrom, dateTo: today };

    // =====================================================================
    // 1-4. Role access
    // =====================================================================
    console.log('\n--- 1-4. Role access ---');
    for (const cat of ['students', 'attendance', 'finance', 'exams', 'teachers', 'batches', 'communications'] as ReportCategory[]) {
      const view = { students: 'directory', attendance: 'summary', finance: 'summary', exams: 'summary', teachers: 'directory', batches: 'list', communications: 'summary' }[cat];
      await run(owner, cat, { view, ...R });
    }
    await run(owner, 'finance', { view: 'branches', ...R });
    ok('1. OWNER can open every report category incl. branch comparison');
    await run(admin, 'finance', { view: 'branches', ...R });
    const adminStudents = await run(admin, 'students', { view: 'directory', search: TAG });
    eq(adminStudents.total, 6, 'ADMIN sees all 6 students across branches');
    ok('2. ADMIN center-wide access incl. branch comparison');
    await run(staff, 'finance', { view: 'summary', ...R });
    await expectCode(() => run(staff, 'finance', { view: 'branches', ...R }), 'FORBIDDEN_REPORT', '3a. STAFF cannot open cross-branch financial comparison');
    const staffStudents = await run(staff, 'students', { view: 'directory', search: TAG });
    eq(staffStudents.total, 5, 'branch-scoped STAFF sees only main-branch students');
    ok('3b. STAFF finance allowed per Phase 5 read permissions, pinned to own branch');
    await expectCode(() => run(teacherUser, 'finance', { view: 'summary', ...R }), 'FORBIDDEN_REPORT', '4a. TEACHER cannot open financial reports');
    await expectCode(() => run(teacherUser, 'finance', { view: 'due' }), 'FORBIDDEN_REPORT', '4b. TEACHER cannot open due report');
    await expectCode(() => run(teacherUser, 'communications', { view: 'logs', ...R }), 'FORBIDDEN_REPORT', '4c. TEACHER cannot open communication reports');
    await expectCode(() => run(teacherUser, 'batches', { view: 'fees', batchId: batchA.id }), 'FORBIDDEN_REPORT', '4d. TEACHER cannot open batch fees');
    await expectCode(() => run(teacherUser, 'attendance', { view: 'students', batchId: batchB.id, ...R }), 'FORBIDDEN_TEACHER_SCOPE', '4e. TEACHER cannot filter to an unassigned batch');
    await expectCode(() => run(teacherUser, 'attendance', { view: 'summary', subjectId: S2.id, ...R }), 'FORBIDDEN_TEACHER_SCOPE', '4f. TEACHER cannot filter to an unassigned subject');
    const tAtt = await run(teacherUser, 'attendance', { view: 'summary', ...R });
    eq({ p: tAtt.totals.present, l: tAtt.totals.late, a: tAtt.totals.absent, e: tAtt.totals.excused }, { p: 21, l: 1, a: 7, e: 1 }, 'TEACHER attendance = only own S1 sessions');
    const tBatches = await run(teacherUser, 'batches', { view: 'list', ...R });
    eq(tBatches.rows.map((r: any) => r.id), [batchA.id], 'TEACHER batch report lists only assigned batch');
    assert(tBatches.showFees === false && tBatches.rows[0].fees === null, 'TEACHER batch report carries no fee figures');
    const tExams = await run(teacherUser, 'exams', { view: 'summary', resultScope: 'internal' });
    eq(tExams.resultScope, 'published', 'TEACHER internal result request is coerced to published');
    eq(tExams.overall.results, 3, 'TEACHER exam report contains only own-subject (S1) results');
    const t2Att = await run(teacher2User, 'attendance', { view: 'summary', ...R });
    eq(t2Att.totals.marks, 1, 'second TEACHER sees only their own taught S2 session');
    const tTeachers = await run(teacherUser, 'teachers', { view: 'directory' });
    eq(tTeachers.rows.map((r: any) => r.id), [T1.id], 'TEACHER teacher report shows only self');
    const tOpts = await getReportOptions(teacherUser);
    eq({ b: tOpts.batches.map((b) => b.id), c: tOpts.permissions.categories.includes('finance') }, { b: [batchA.id], c: false }, 'TEACHER filter options narrowed');
    ok('4g. TEACHER scope limited to assigned batch/subject, self, published results, no finance');

    // =====================================================================
    // 5-6. Tenant & branch isolation
    // =====================================================================
    console.log('\n--- 5-6. Isolation ---');
    await expectCode(() => run(owner, 'students', { view: 'directory', branchId: setupB.branch.id }), 'FORBIDDEN_BRANCH', '5a. Foreign-tenant branchId is rejected');
    const allDir = await run(owner, 'students', { view: 'directory', search: 'Other Tenant' });
    eq(allDir.total, 0, 'other tenant student never appears');
    const finA = await run(owner, 'finance', { view: 'summary', ...R });
    assert(!finA.totals.invoiced.includes('7777') && finA.totals.invoiced === '2050.00', `tenant A invoiced excludes tenant B (got ${finA.totals.invoiced})`);
    ok('5b. Tenant isolation: tenant is taken from the session only; other tenant data excluded');
    await expectCode(() => run(staff, 'finance', { view: 'summary', branchId: branch2.id, ...R }), 'FORBIDDEN_BRANCH', '6a. Branch-scoped STAFF cannot request another branch');
    const staffFin = await run(staff, 'finance', { view: 'summary', ...R });
    eq({ inv: staffFin.totals.invoiced, col: staffFin.totals.collected }, { inv: '1750.00', col: '950.00' }, 'STAFF finance limited to main branch');
    const b2Fin = await run(staffB2, 'finance', { view: 'summary', ...R });
    eq({ inv: b2Fin.totals.invoiced, col: b2Fin.totals.collected }, { inv: '300.00', col: '300.00' }, 'Branch-2 STAFF finance limited to branch 2');
    const b2Comm = await run(staffB2, 'communications', { view: 'summary', ...R });
    eq(b2Comm.total, (await prisma.communicationLog.count({ where: { coachingCenterId: cc, branchId: branch2.id } })), 'Branch-2 STAFF communications limited to branch 2');
    ok('6b. Branch isolation across finance and communications');

    // =====================================================================
    // 7. Student reports
    // =====================================================================
    console.log('\n--- 7. Student reports ---');
    const dir = await run(owner, 'students', { view: 'directory', search: TAG, pageSize: '2', page: '2', sort: 'studentIdCode', dir: 'asc' });
    eq({ total: dir.total, pages: dir.totalPages, first: dir.rows[0].studentIdCode }, { total: 6, pages: 3, first: `${TAG}-S0003` }, 'directory paging + sort');
    const dirRow = (await run(owner, 'students', { view: 'directory', search: `${TAG}-S0001` })).rows[0];
    assert(dirRow.program?.name === program.name && dirRow.batches[0].id === batchA.id && dirRow.branch.name === 'Main Campus', 'directory row carries program/batch/branch');
    assert(!('nidBirthReg' in dirRow) && !('passwordHash' in dirRow), 'directory rows expose no NID/password fields');
    const enrl = await run(owner, 'students', { view: 'enrollment', ...R, compare: 'previous' });
    const allStudents = await prisma.student.count({ where: { coachingCenterId: cc } });
    eq(enrl.totals.totalStudents, allStudents, 'enrollment total = actual student count');
    eq(enrl.totals.newAdmissions, 3, 'new admissions in range by admissionDate');
    assert(enrl.comparison && enrl.comparison.previousAdmissions === 0 && enrl.comparison.changePct === null, 'no fabricated growth % when previous period is 0');
    const enrlNoCompare = await run(owner, 'students', { view: 'enrollment', ...R });
    assert(enrlNoCompare.comparison === null, 'no comparison unless explicitly requested');
    const statusRep = await run(owner, 'students', { view: 'status' });
    eq(statusRep.students.rows.map((r: any) => r.status), ['ACTIVE'], 'status distribution only contains statuses that exist');
    ok('7. Student directory / enrollment / status reports correct');

    // =====================================================================
    // 8-9. Attendance
    // =====================================================================
    console.log('\n--- 8-9. Attendance ---');
    const st1Rows = await run(owner, 'attendance', { view: 'students', subjectId: S1.id, ...R, search: `${TAG}-S0001` });
    const r1 = st1Rows.rows[0];
    eq({ p: r1.present, l: r1.late, a: r1.absent, pct: r1.percentage }, { p: 7, l: 1, a: 2, pct: 80 }, 'st1 S1: (7+1)/(7+1+2) = 80%');
    const phase4 = await getStudentAttendanceSummary(cc, st1.id, batchA.id);
    const st1All = (await run(owner, 'attendance', { view: 'students', dateFrom: '2026-01-01', dateTo: today, search: `${TAG}-S0001` })).rows[0];
    eq({ p: st1All.present, l: st1All.late, a: st1All.absent, pct: st1All.percentage }, { p: phase4.present, l: phase4.late, a: phase4.absent, pct: phase4.percentage }, 'report matches Phase 4 getStudentAttendanceSummary');
    const st3Row = (await run(owner, 'attendance', { view: 'students', ...R, search: `${TAG}-S0003` })).rows[0];
    eq({ excused: st3Row.excused, pct: st3Row.percentage }, { excused: 1, pct: 100 }, 'EXCUSED shown but excluded from ratio');
    const summ = await run(owner, 'attendance', { view: 'summary', ...R });
    eq(summ.totals.sessions, 12, 'completed sessions only (OPEN session excluded)');
    eq({ p: summ.totals.present, a: summ.totals.absent }, { p: 22, a: 8 }, 'summary counts exclude the OPEN session mark');
    assert(summ.byBranch.length === 2 && summ.bySubject.length === 3, 'branch/subject breakdowns present');
    const threshold = await getAttendanceThreshold(cc);
    const low = await run(owner, 'attendance', { view: 'low', ...R });
    const lowIds = low.rows.map((r: any) => r.student.id);
    eq(low.threshold, threshold, 'low attendance uses the configured threshold');
    assert(lowIds.includes(st2.id) && lowIds.includes(st1.id) && !lowIds.includes(st3.id), 'low attendance lists students below threshold only');
    assert(low.rows[0].percentage <= low.rows[low.rows.length - 1].percentage, 'low attendance sorted by % ascending');
    const detail = await run(owner, 'attendance', { view: 'student', studentId: st1.id, ...R });
    eq(detail.total, 11, 'student drill-down lists completed-session marks date-wise');
    assert(detail.rows.some((r: any) => r.teacher?.name === T1.name && r.subject?.name === S1.name), 'drill-down carries teacher + subject');
    const batchAtt = await run(owner, 'attendance', { view: 'batches', ...R });
    const bA = batchAtt.rows.find((r: any) => r.batch.id === batchA.id);
    eq(bA.students, 3, 'batch students in range excludes the member who left before the range');
    const batchAttJan = await run(owner, 'attendance', { view: 'batches', dateFrom: '2026-01-01', dateTo: today });
    eq(batchAttJan.rows.find((r: any) => r.batch.id === batchA.id).students, 4, 'historical member counted when the range covers their membership');
    ok('8-9. Attendance summary / student / low / drill-down / batch reports match Phase 4');

    // =====================================================================
    // 10-13. Finance
    // =====================================================================
    console.log('\n--- 10-13. Finance ---');
    const fin = finA.totals;
    eq(
      { inv: fin.invoiced, col: fin.collected, ref: fin.refunded, net: fin.netCollected, disc: fin.discounts, due: fin.due, overdue: fin.overdue },
      { inv: '2050.00', col: '1250.00', ref: '100.00', net: '1150.00', disc: '100.00', due: '900.00', overdue: '600.00' },
      'finance summary totals'
    );
    const dash = await getFeeDashboard(cc, {});
    eq({ due: fin.due, overdue: fin.overdue }, { due: dash.outstandingDue.toFixed(2), overdue: dash.overdueAmount.toFixed(2) }, 'due/overdue identical to Phase 5 getFeeDashboard');
    const invAgg = await prisma.feeInvoice.aggregate({ where: { coachingCenterId: cc, status: { notIn: ['DRAFT', 'CANCELLED'] } }, _sum: { totalAmount: true, paidAmount: true, dueAmount: true } });
    eq(fin.invoiced, invAgg._sum.totalAmount!.toFixed(2), 'invoiced = persisted FeeInvoice.totalAmount');
    eq(fin.netCollected, invAgg._sum.paidAmount!.toFixed(2), 'net collected = persisted FeeInvoice.paidAmount (Phase 5 nets refunds)');
    ok('10. Finance summary matches Phase 5 persisted financial truth');
    const methods = await run(owner, 'finance', { view: 'methods', ...R });
    const m = Object.fromEntries(methods.rows.map((r: any) => [r.method, `${r.count}:${r.amount}`]));
    eq(m, { CASH: '2:500.00', BKASH: '1:500.00', NAGAD: '1:250.00', BANK: '0:0.00', CARD: '0:0.00', OTHER: '0:0.00' }, 'payment method breakdown');
    eq(methods.rows.map((r: any) => r.method), ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER'], 'only schema payment methods');
    ok('11. Payment method report');
    const due = await run(owner, 'finance', { view: 'due' });
    eq(due.total, 2, 'two open invoices with due');
    const i2Row = due.rows.find((r: any) => r.id === I2.id);
    eq({ status: i2Row.status, total: i2Row.total, paid: i2Row.paid, due: i2Row.due }, { status: 'OVERDUE', total: '600.00', paid: '0.00', due: '600.00' }, 'overdue row via Phase 5 display status');
    eq((await prisma.feeInvoice.findUnique({ where: { id: I2.id } }))!.status, 'OVERDUE', 'Phase 5 lazy overdue reconciliation applied');
    const overdueOnly = await run(owner, 'finance', { view: 'due', overdueOnly: 'true' });
    eq(overdueOnly.rows.map((r: any) => r.id), [I2.id], 'overdue-only filter');
    ok('12. Due / overdue report');
    const refunds = await run(owner, 'finance', { view: 'refunds', ...R });
    eq({ n: refunds.total, amt: refunds.totalAmount, method: refunds.rows[0].method, inv: refunds.rows[0].invoice.id }, { n: 1, amt: '100.00', method: 'BKASH', inv: I1.id }, 'refund report');
    const discounts = await run(owner, 'finance', { view: 'discounts', ...R });
    eq({ n: discounts.total, amt: discounts.totalAmount, type: discounts.rows[0].type }, { n: 1, amt: '100.00', type: 'DISCOUNT' }, 'discount report from persisted FeeDiscount rows');
    const branches = await run(owner, 'finance', { view: 'branches', ...R });
    const bMain = branches.rows.find((r: any) => r.branchId === main.id);
    const bTwo = branches.rows.find((r: any) => r.branchId === branch2.id);
    eq({ mi: bMain.invoiced, mc: bMain.collected, mr: bMain.refunded, md: bMain.due, ti: bTwo.invoiced, tc: bTwo.collected }, { mi: '1750.00', mc: '950.00', mr: '100.00', md: '900.00', ti: '300.00', tc: '300.00' }, 'branch comparison totals');
    ok('13. Refund, discount and branch comparison reports');
    const trend = await run(owner, 'finance', { view: 'trend', dateFrom: addDays(today, -6), dateTo: today, granularity: 'day' });
    eq(trend.rows.length, 7, 'daily trend includes every day in range (true zero days)');
    const bRow = trend.rows.find((r: any) => r.bucket === boundaryDay);
    eq(bRow.collected, '250.00', 'Dhaka 00:30 payment lands on its Dhaka calendar day');
    const prevDay = trend.rows.find((r: any) => r.bucket === addDays(boundaryDay, -1));
    eq(prevDay.collected, '0.00', 'and not on the previous UTC day');
    const trendSum = trend.rows.reduce((s: number, r: any) => s + Math.round(Number(r.collected) * 100), 0);
    eq((trendSum / 100).toFixed(2), '1250.00', 'trend collected sums to summary collected');

    // =====================================================================
    // 14-16. Exams
    // =====================================================================
    console.log('\n--- 14-16. Exams ---');
    const ex = await run(owner, 'exams', { view: 'summary' });
    eq(ex.rows.map((r: any) => r.exam.id), [exam.id], 'published scope lists only the published exam');
    eq({ res: ex.rows[0].results, pass: ex.rows[0].passed, fail: ex.rows[0].failed, reg: ex.rows[0].registeredStudents }, { res: 6, pass: 4, fail: 2, reg: 3 }, 'exam summary counts');
    eq(ex.rows[0].averagePct, Math.round(((85 + 30 + 72 + 65 + 50) / 500) * 1000) / 10, 'average % over present results with marks');
    const exInternal = await run(owner, 'exams', { view: 'summary', resultScope: 'internal' });
    assert(exInternal.resultScope === 'internal' && exInternal.rows.some((r: any) => r.exam.id === draftExam.id), 'internal scope includes the unpublished exam for OWNER');
    const history = await getStudentResultHistory(cc, st1.id, true);
    assert(!history.some((h: any) => h.examId === draftExam.id), 'unpublished exam hidden in student-facing Phase 6 history');
    ok('14. Exam performance summary, published vs internal separation');
    const grades = await run(owner, 'exams', { view: 'grades' });
    const g = Object.fromEntries(grades.rows.filter((r: any) => r.count > 0).map((r: any) => [r.grade, r.count]));
    const persisted = await prisma.result.groupBy({ by: ['grade'], where: { examSubject: { examId: exam.id }, status: 'PRESENT' }, _count: { _all: true } });
    const sortObj = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    eq(sortObj(g), sortObj(Object.fromEntries(persisted.map((p) => [p.grade, p._count._all]))), 'grade distribution = persisted Phase 6 grades');
    eq(grades.absent, 1, 'absent result reported separately');
    eq(grades.rows.map((r: any) => r.grade), ['A+', 'A', 'A-', 'B', 'C', 'D', 'F'], 'grade order from configured grading scale');
    ok('15. Grade distribution');
    const subj = await run(owner, 'exams', { view: 'subjects' });
    const sS1 = subj.rows.find((r: any) => r.subject.id === S1.id);
    eq({ st: sS1.students, pass: sS1.passed, fail: sS1.failed, avg: sS1.averagePct, marks: sS1.averageMarks }, { st: 3, pass: 2, fail: 1, avg: 62.3, marks: 62.33 }, 'subject performance S1');
    const exDetail = await run(owner, 'exams', { view: 'exam', examId: exam.id });
    const d1 = exDetail.rows.find((r: any) => r.student.id === st1.id);
    const h1 = history.find((h: any) => h.examId === exam.id);
    eq({ total: d1.totalMarksObtained, gpa: d1.overallGpa, grade: d1.overallGrade, pass: d1.isPassed }, { total: h1.overall.totalMarksObtained, gpa: h1.overall.overallGpa, grade: h1.overall.overallGrade, pass: h1.overall.isPassed }, 'exam drill-down overall = Phase 6 calculateOverallExamResult');
    const stuRes = await run(owner, 'exams', { view: 'student', examId: exam.id, studentId: st1.id });
    eq(stuRes.subjects.map((s: any) => s.grade).sort(), ['A+', 'A-'], 'student drill-down subject grades');
    await expectCode(() => run(owner, 'exams', { view: 'exam', examId: draftExam.id }), 'EXAM_NOT_FOUND', '16a. unpublished exam not reachable in published scope');
    await expectCode(() => run(teacherUser, 'exams', { view: 'exam', examId: draftExam.id, resultScope: 'internal' }), 'EXAM_NOT_FOUND', '16b. TEACHER cannot reach unpublished exam even when asking for internal');
    const exBatches = await run(owner, 'exams', { view: 'batches' });
    eq(exBatches.rows[0].batch.id, batchA.id, 'batch performance row');
    ok('16. Subject performance, batch performance, exam/student drill-down');

    // =====================================================================
    // 17-19. Teacher, batch, communication
    // =====================================================================
    console.log('\n--- 17-19. Teacher / batch / communication ---');
    const tDir = await run(owner, 'teachers', { view: 'directory', search: TAG });
    const t1Row = tDir.rows.find((r: any) => r.id === T1.id);
    eq(t1Row.assignments.map((a: any) => a.batch.id), [batchA.id], 'teacher directory active assignments');
    const sched = await run(owner, 'teachers', { view: 'schedule', teacherId: T1.id });
    eq(sched.rows.map((r: any) => `${r.dayOfWeek} ${r.startTime}`), ['MONDAY 16:00'], 'teaching schedule');
    const tAttRep = await run(owner, 'teachers', { view: 'attendance', ...R });
    const ta = tAttRep.rows.find((r: any) => r.teacher.id === T1.id);
    eq({ p: ta.present, a: ta.absent, l: ta.late, days: ta.days }, { p: 3, a: 1, l: 1, days: 5 }, 'teacher attendance counts (no invented %)');
    assert(!('percentage' in ta), 'no teacher attendance percentage invented');
    ok('17. Teacher reports');
    const bl = await run(owner, 'batches', { view: 'list', ...R, search: TAG });
    const blA = bl.rows.find((r: any) => r.id === batchA.id);
    const phase5Batch = await getBatchFinancialSummary(cc, batchA.id);
    eq({ billed: blA.fees.billed, col: blA.fees.collected, due: blA.fees.due }, { billed: phase5Batch!.totals.totalBilled.toFixed(2), col: phase5Batch!.totals.totalCollected.toFixed(2), due: phase5Batch!.totals.totalDue.toFixed(2) }, 'batch fee totals = Phase 5 getBatchFinancialSummary');
    eq({ active: blA.activeStudents, inRange: blA.studentsInRange, slots: blA.scheduleSlots, pct: blA.attendancePct }, { active: 3, inRange: 3, slots: 2, pct: bA.percentage }, 'batch list strength / schedule / attendance');
    const bd = await run(owner, 'batches', { view: 'detail', batchId: batchA.id });
    eq(bd.batch.studentBatches.length, 4, 'batch drill-down includes membership history');
    await expectCode(() => run(staff, 'batches', { view: 'detail', batchId: batchB.id }), 'BATCH_NOT_FOUND', '18a. branch-scoped STAFF cannot open another branch batch');
    ok('18. Batch reports + drill-down');
    const comm = await run(owner, 'communications', { view: 'summary', ...R });
    const truth = await prisma.communicationLog.groupBy({ by: ['status'], where: { coachingCenterId: cc }, _count: { _all: true } });
    for (const t of truth) eq(comm.byStatus.find((s: any) => s.status === t.status)?.count, t._count._all, `communication status ${t.status} preserved`);
    const skipped = comm.byStatus.find((s: any) => s.status === 'SKIPPED').count;
    const sent = comm.byStatus.find((s: any) => s.status === 'SENT').count;
    const delivered = comm.byStatus.find((s: any) => s.status === 'DELIVERED').count;
    assert(skipped >= 2 && sent === truth.find((t) => t.status === 'SENT')!._count._all && delivered === 0, 'SKIPPED never counted as SENT/DELIVERED');
    eq(comm.byChannel.map((c: any) => c.key).sort(), ['EMAIL', 'SMS', 'WHATSAPP'], 'channels are schema channels only');
    const logs = await run(owner, 'communications', { view: 'logs', ...R, status: 'SKIPPED' });
    assert(logs.rows.every((r: any) => r.status === 'SKIPPED') && !('message' in logs.rows[0]), 'log rows keep SKIPPED status and expose no message body');
    const notices = await run(owner, 'communications', { view: 'notices', ...R });
    eq(notices.rows.map((r: any) => r.title), [`${TAG} Notice`], 'notice report');
    const notifs = await run(owner, 'communications', { view: 'notifications', ...R });
    const nTruth = await prisma.notification.count({ where: { coachingCenterId: cc } });
    eq(notifs.total, nTruth, 'notification count = persisted notifications');
    ok('19. Communication, notice and notification reports');

    // =====================================================================
    // 20-22. Date / academic year / empty
    // =====================================================================
    console.log('\n--- 20-22. Filters and empty state ---');
    const narrow = await run(owner, 'attendance', { view: 'summary', dateFrom: sessionDates[0], dateTo: sessionDates[1] });
    eq(narrow.totals.sessions, 2, 'inclusive two-day window');
    await expectCode(() => run(owner, 'attendance', { view: 'summary', dateFrom: today, dateTo: rangeFrom }), 'INVALID_DATE_RANGE', '20a. from > to rejected');
    await expectCode(() => run(owner, 'finance', { view: 'summary', dateFrom: '2020-01-01', dateTo: today }), 'INVALID_DATE_RANGE', '20b. over-long range rejected');
    await expectCode(() => run(owner, 'finance', { view: 'summary', dateFrom: '2026-02-30', dateTo: '2026-03-01' }), 'INVALID_DATE_RANGE', '20c. impossible calendar date rejected');
    assert(!reportFilterSchema.safeParse({ branchId: 'not-a-uuid' }).success, 'non-uuid id rejected by schema');
    ok('20. Date filtering + validation');
    const y2025 = await run(owner, 'students', { view: 'directory', academicSessionId: s2025.id });
    eq(y2025.rows.map((r: any) => r.id), [st5.id], 'academic year 2025 → only the 2025-enrolled student');
    const y2025Att = await run(owner, 'attendance', { view: 'summary', academicSessionId: s2025.id, ...R });
    eq(y2025Att.totals.marks, 0, 'no 2026 attendance leaks into 2025');
    ok('21. Academic year filtering uses enrollment history');
    const empty = await run(owner, 'attendance', { view: 'summary', dateFrom: '2026-03-01', dateTo: '2026-03-31' });
    eq({ marks: empty.totals.marks, pct: empty.totals.percentage }, { marks: 0, pct: null }, 'empty attendance → null %, never a fake 0%');
    const emptyFin = await run(owner, 'finance', { view: 'trend', dateFrom: '2026-03-01', dateTo: '2026-03-31', granularity: 'week' });
    eq(emptyFin.hasData, false, 'empty trend flagged hasData=false');
    const emptyEx = await run(owner, 'exams', { view: 'grades', dateFrom: '2026-03-01', dateTo: '2026-03-31' });
    eq(emptyEx.graded, 0, 'empty grade distribution');
    ok('22. Empty reports are honest');

    // =====================================================================
    // 23-24. Export
    // =====================================================================
    console.log('\n--- 23-24. CSV export ---');
    const dirCsv = await csv(owner, 'students', { view: 'directory', search: TAG, lang: 'bn' });
    assert(dirCsv.body.startsWith('﻿'), 'UTF-8 BOM present');
    const dirRows = parseCsv(dirCsv.body);
    eq(dirRows[0][0], 'শিক্ষার্থী আইডি', 'Bengali header');
    eq(dirRows.length - 1, 6, 'CSV row count = filtered total (not just one page)');
    assert(dirRows.some((r) => r[1] === 'রহিম উদ্দিন'), 'Bengali student name round-trips');
    const dueCsv = parseCsv((await csv(owner, 'finance', { view: 'due', lang: 'en' })).body);
    eq(dueCsv[0][4], 'Invoice Total (BDT)', 'money header carries currency');
    assert(dueCsv.slice(1).some((r) => r[6] === '600.00' && r[7] === 'OVERDUE'), 'BDT values exact fixed-2 decimals');
    const staffCsv = parseCsv((await csv(staff, 'students', { view: 'directory', search: TAG, lang: 'en' })).body);
    eq(staffCsv.length - 1, 5, 'export respects branch scope');
    const tCsv = parseCsv((await csv(teacherUser, 'attendance', { view: 'students', ...R, lang: 'en' })).body);
    eq(tCsv.length - 1, 3, 'teacher export limited to own batch students');
    await expectCode(() => csv(teacherUser, 'finance', { view: 'due' }), 'FORBIDDEN_REPORT', '23a. teacher cannot export finance');
    const inj = await prisma.student.update({ where: { id: st2.id }, data: { banglaName: '=HYPERLINK("x")' } });
    const injCsv = (await csv(owner, 'students', { view: 'directory', search: `${TAG}-S0002`, lang: 'bn' })).body;
    assert(injCsv.includes(`"'=HYPERLINK(""x"")"`), 'formula injection neutralised and quotes escaped');
    void inj;
    const audit = await prisma.auditLog.findFirst({ where: { coachingCenterId: cc, action: 'REPORT_EXPORTED', entityId: 'finance:due' }, orderBy: { createdAt: 'desc' } });
    assert(audit, 'export audit log recorded');
    const details = typeof audit!.details === 'string' ? JSON.parse(audit!.details) : audit!.details;
    assert(details.rowCount === 2 && !JSON.stringify(details).includes('600.00'), 'audit log has row count, no row data');
    ok('23-24. CSV export: headers, row count, UTF-8 BOM, Bengali, BDT decimals, scope, audit');
  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of [centerA, centerB]) {
      if (id) await prisma.coachingCenter.deleteMany({ where: { id } });
    }
    const leftovers = await Promise.all([
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
      prisma.student.count({ where: { studentIdCode: { startsWith: TAG } } }),
      prisma.communicationLog.count({ where: { message: { startsWith: TAG } } }),
      prisma.user.count({ where: { name: { startsWith: TAG } } }),
    ]);
    if (leftovers.some((n) => n > 0)) console.error('✘ Leftover test data:', leftovers);
    else console.log('✔ All temporary test data removed');
  }
  console.log(`\n${passed} checks passed.`);
}

run10()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
