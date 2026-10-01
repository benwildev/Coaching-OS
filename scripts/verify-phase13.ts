import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import {
  createCompensation,
  updateCompensation,
  endCompensation,
  listTeacherCompensation,
  rangesOverlap,
  scopeKey,
} from '../lib/services/compensation.service';
import {
  generateSalary,
  getSalaryOverview,
  getSalaryPayableDetail,
  recordSalaryPayment,
  cancelSalaryPayable,
  finalizeSalaryPeriod,
  listTeacherSalaryHistory,
  calculateSalaryLines,
  monthBounds,
} from '../lib/services/salary.service';
import { openCashSession, closeCashSession } from '../lib/services/cash-session.service';
import { getCurrentDhakaDateString, toDateOnly } from '../lib/schedule';
import { DICTIONARY } from '../lib/i18n';
import type { SessionUser } from '../lib/auth/session';

const TAG = `P13VERIFY-${Date.now()}`;
let passed = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`✔ ${label}`);
};
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
async function expectError(fn: () => Promise<unknown>, expected: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(expected), `${label} — expected "${expected}", got "${msg}"`);
    ok(label);
    return;
  }
  throw new Error(`FAIL: ${label} (expected "${expected}", but it succeeded)`);
}

/** Month `offset` months from the current Dhaka month. */
function monthOffset(offset: number) {
  const t = getCurrentDhakaDateString();
  const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 + offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
const first = (m: { year: number; month: number }) => monthBounds(m.year, m.month).start;
const last = (m: { year: number; month: number }) => monthBounds(m.year, m.month).end;
const asDate = (ymdStr: string, hour = 0) => new Date(`${ymdStr}T0${hour}:00:00.000Z`);

async function main() {
  console.log('\n==================================================');
  console.log('Phase 13 — Teacher Compensation & Salary Verification');
  console.log('==================================================\n');

  let tenantAId = '';
  let tenantBId = '';

  try {
    const stamp = Date.now().toString().slice(-5);
    const mkSetup = (letter: string, phonePrefix: string) =>
      completeInitialSetup({
        centerName: `Center ${letter} ${TAG}`,
        centerCode: `T13${letter}${stamp}`,
        centerPhone: '01711000001',
        centerCity: 'Dhaka',
        centerDistrict: 'Dhaka',
        ownerName: `Owner ${letter}`,
        ownerEmail: `owner-t13${letter}${stamp}@test.local`.toLowerCase(),
        ownerPhone: `${phonePrefix}${Date.now().toString().slice(-8)}`,
        ownerPassword: 'Password123!',
        branchName: 'Main Campus',
        branchCode: 'MAIN',
        sessionName: '2026',
        sessionStartDate: '2026-01-01',
        sessionEndDate: '2026-12-31',
        selectedPrograms: [],
        primaryColor: '#063B78',
        accentColor: '#FFD200',
      } as any);

    const setupA = await mkSetup('A', '017');
    const setupB = await mkSetup('B', '018');
    tenantAId = setupA.center.id;
    tenantBId = setupB.center.id;
    const branch1 = setupA.branch;
    const branch2 = await prisma.branch.create({ data: { coachingCenterId: tenantAId, name: 'Dhanmondi', code: 'DHAN' } });

    const program = await prisma.academicProgram.create({ data: { coachingCenterId: tenantAId, name: 'HSC', code: 'HSC' } });
    const klass = await prisma.academicClass.create({
      data: { coachingCenterId: tenantAId, academicProgramId: program.id, name: 'Class 12', code: 'C12' },
    });
    const mkSubject = (name: string, code: string) =>
      prisma.subject.create({ data: { coachingCenterId: tenantAId, academicClassId: klass.id, name, code } });
    const math = await mkSubject('Mathematics', 'MATH');
    const physics = await mkSubject('Physics', 'PHY');
    const course = await prisma.course.create({
      data: { coachingCenterId: tenantAId, academicProgramId: program.id, academicClassId: klass.id, name: 'HSC Science 2026', code: 'HSC-SCI', status: 'ACTIVE' },
    });
    const mkBatch = (name: string, code: string, branchId: string) =>
      prisma.batch.create({
        data: {
          coachingCenterId: tenantAId,
          branchId,
          academicSessionId: setupA.session.id,
          academicProgramId: program.id,
          academicClassId: klass.id,
          courseId: course.id,
          name,
          code,
          status: 'ACTIVE',
        },
      });
    const batchM = await mkBatch('Morning Batch A', 'MORN', branch1.id);
    const batchD = await mkBatch('Dhanmondi Batch', 'DHAN', branch2.id);

    const mkTeacher = (name: string, code: string, branchId: string | null, userId?: string) =>
      prisma.teacher.create({ data: { coachingCenterId: tenantAId, branchId, teacherCode: code, name, phone: `0191${code.padStart(7, '0')}`, userId } });

    // Real User rows are required wherever a user id lands in an FK column (Expense.createdBy).
    const mkUser = async (label: string, branchId: string | null) =>
      prisma.user.create({
        data: { coachingCenterId: tenantAId, branchId, email: `${label}-${stamp}@test.local`, phone: `0161${Date.now().toString().slice(-7)}${label.length}`, name: label, passwordHash: 'x', status: 'ACTIVE' },
      });
    const staffRow = await mkUser('staff1', branch1.id);
    const teacherUserRow = await mkUser('teacheruser', branch1.id);
    const teacher2UserRow = await mkUser('teacher2user', branch1.id);

    const t1 = await mkTeacher('Tanvir Ahmed', '1', branch1.id, teacherUserRow.id);
    const t2 = await mkTeacher('Branch Two Teacher', '2', branch2.id);
    const t3 = await mkTeacher('Floating Teacher', '3', null);
    const t4 = await mkTeacher('Other Teacher', '4', branch1.id, teacher2UserRow.id);
    const t5 = await mkTeacher('Nobody Teacher', '5', branch1.id);

    const mkAssign = (teacherId: string, batchId: string, subjectId: string, branchId: string, extra: Record<string, unknown> = {}) =>
      prisma.batchTeacherAssignment.create({
        data: { coachingCenterId: tenantAId, branchId, batchId, subjectId, teacherId, startDate: asDate('2026-01-01'), ...extra },
      });
    const aMath = await mkAssign(t1.id, batchM.id, math.id, branch1.id);
    const aPhy = await mkAssign(t1.id, batchM.id, physics.id, branch1.id);
    const aT2 = await mkAssign(t2.id, batchD.id, math.id, branch2.id);
    const aT4 = await mkAssign(t4.id, batchM.id, math.id, branch1.id);
    const aEnded = await mkAssign(t4.id, batchM.id, physics.id, branch1.id, { status: 'ENDED', endDate: asDate('2026-02-01') });

    const owner: SessionUser = {
      userId: setupA.owner.id, coachingCenterId: tenantAId, email: setupA.owner.email, name: 'Owner', phone: null, banglaName: null,
      role: 'OWNER', branchId: null, sessionVersion: 1,
    } as any;
    const mk = (role: 'ADMIN' | 'STAFF' | 'TEACHER', userId: string, branchId: string | null): SessionUser =>
      ({ userId, coachingCenterId: tenantAId, email: `${role}@t.local`, name: role, phone: null, banglaName: null, role, branchId, sessionVersion: 1 }) as any;
    const admin1 = mk('ADMIN', owner.userId, branch1.id); // branch-locked admin (uses a real id for FK-safe audit)
    const admin2 = mk('ADMIN', owner.userId, branch2.id);
    const centerAdmin = mk('ADMIN', owner.userId, null);
    const staff1 = mk('STAFF', staffRow.id, branch1.id);
    const teacher1User = mk('TEACHER', teacherUserRow.id, branch1.id);
    const teacher4User = mk('TEACHER', teacher2UserRow.id, branch1.id);
    const ownerB: SessionUser = {
      userId: setupB.owner.id, coachingCenterId: tenantBId, email: setupB.owner.email, name: 'OwnerB', phone: null, banglaName: null,
      role: 'OWNER', branchId: null, sessionVersion: 1,
    } as any;

    // Timeline: P = last month, P1 = month before, P2 = two before.
    const P = monthOffset(-1);
    const P1 = monthOffset(-2);
    const P2 = monthOffset(-3);
    const CUR = monthOffset(0);
    const FUT = monthOffset(2);
    const today = getCurrentDhakaDateString();

    // ------------------------------------------------------------------
    console.log('--- Pure rules');
    assert(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-30', null), 'inclusive overlap');
    assert(!rangesOverlap('2026-01-01', '2026-06-30', '2026-07-01', null), 'adjacent ranges do not overlap');
    assert(scopeKey('PER_BATCH', 'x') === scopeKey('PER_CLASS', 'x'), 'batch + class on one assignment share a scope');
    assert(scopeKey('MONTHLY_FIXED', null) !== scopeKey('CUSTOM', null), 'fixed and custom are separate scopes');
    ok('Test 1: overlap / scope helpers');

    const sampleRule = (over: Record<string, unknown>) => ({ id: 'r', type: 'MONTHLY_FIXED' as const, amountCents: 100000, assignmentId: null, from: '2026-01-01', to: null, ...over });
    const lines = calculateSalaryLines(
      [
        sampleRule({ id: 'a', from: '2026-01-01', to: '2026-07-14', amountCents: 1800000 }),
        sampleRule({ id: 'b', from: '2026-07-15', to: null, amountCents: 2200000 }),
      ] as any,
      [],
      '2026-07-01',
      '2026-07-31'
    );
    assert(lines.length === 1 && lines[0].compensationId === 'b' && lines[0].amount === 22000, 'mid-month change: latest-starting rule wins, no proration');
    const none = calculateSalaryLines([sampleRule({ from: '2026-08-01' })] as any, [], '2026-07-01', '2026-07-31');
    assert(none.length === 0, 'future rule is not applicable');
    const expired = calculateSalaryLines([sampleRule({ to: '2026-06-30' })] as any, [], '2026-07-01', '2026-07-31');
    assert(expired.length === 0, 'expired rule is not applicable');
    ok('Test 2: calculateSalaryLines — future/expired/mid-month change');

    // ------------------------------------------------------------------
    console.log('--- Compensation CRUD, validation & authorization');
    const fixedOld = await createCompensation(tenantAId, owner, t1.id, { type: 'MONTHLY_FIXED', amount: 18000, effectiveFrom: first(P2), effectiveTo: last(P1) });
    assert(fixedOld.amount === 18000 && fixedOld.branchId === branch1.id, 'fixed rule created in teacher branch');
    ok('Test 3: compensation creation (MONTHLY_FIXED)');

    await expectError(
      () => createCompensation(tenantAId, owner, t1.id, { type: 'MONTHLY_FIXED', amount: 19000, effectiveFrom: first(P1), effectiveTo: null }),
      'COMPENSATION_OVERLAP',
      'Test 4: overlapping rule in same scope rejected'
    );

    const fixedNew = await createCompensation(tenantAId, owner, t1.id, { type: 'MONTHLY_FIXED', amount: 22000, effectiveFrom: first(P), effectiveTo: null });
    ok('Test 5: adjacent rule (rate change) accepted');

    await expectError(
      () => createCompensation(tenantAId, owner, t1.id, { type: 'PER_BATCH', amount: 8000, assignmentId: aT4.id, effectiveFrom: first(P) }),
      'ASSIGNMENT_NOT_FOUND',
      'Test 6: assignment of ANOTHER teacher rejected'
    );
    await expectError(
      () => createCompensation(tenantAId, owner, t1.id, { type: 'PER_BATCH', amount: 8000, assignmentId: 'does-not-exist', effectiveFrom: first(P) }),
      'ASSIGNMENT_NOT_FOUND',
      'Test 7: arbitrary assignment id rejected'
    );
    await expectError(
      () => createCompensation(tenantAId, owner, t4.id, { type: 'PER_CLASS', amount: 500, assignmentId: aEnded.id, effectiveFrom: first(P) }),
      'ASSIGNMENT_NOT_ACTIVE',
      'Test 8: ended assignment rejected'
    );
    await expectError(
      () => createCompensation(tenantBId, ownerB, t1.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(P) }),
      'TEACHER_NOT_FOUND',
      'Test 9: tenant isolation — tenant B cannot touch tenant A teacher'
    );
    await expectError(
      () => createCompensation(tenantAId, admin2, t1.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(CUR) }),
      'FORBIDDEN_BRANCH',
      'Test 10: branch isolation — branch-2 admin cannot manage branch-1 teacher'
    );
    await expectError(
      () => createCompensation(tenantAId, staff1, t1.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(CUR) }),
      'COMPENSATION_ACCESS_DENIED',
      'Test 11: STAFF cannot create compensation'
    );
    await expectError(
      () => createCompensation(tenantAId, teacher1User, t1.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(CUR) }),
      'COMPENSATION_ACCESS_DENIED',
      'Test 12: TEACHER cannot create compensation'
    );
    await expectError(
      () => createCompensation(tenantAId, owner, t3.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(P) }),
      'BRANCH_REQUIRED',
      'Test 13: branch-less teacher needs an explicit branch'
    );
    const t3Rule = await createCompensation(tenantAId, owner, t3.id, { type: 'CUSTOM', amount: 5000, branchId: branch1.id, effectiveFrom: first(P), notes: 'Guest lecture fee' });
    assert(t3Rule.branchId === branch1.id, 'custom rule paid by chosen branch');
    ok('Test 14: CUSTOM compensation for a branch-less teacher');

    const own = await listTeacherCompensation(tenantAId, teacher1User, t1.id);
    assert(own.current.length === 1 && own.history.length === 1, 'teacher sees own current + history');
    await expectError(() => listTeacherCompensation(tenantAId, teacher4User, t1.id), 'FORBIDDEN_TEACHER_SCOPE', 'Test 15: teacher cannot read another teacher\'s compensation');
    await expectError(() => listTeacherCompensation(tenantAId, staff1, t1.id), 'COMPENSATION_ACCESS_DENIED', 'Test 16: STAFF cannot read compensation rules');
    const emptyList = await listTeacherCompensation(tenantAId, owner, t5.id);
    assert(emptyList.current.length + emptyList.history.length + emptyList.upcoming.length === 0, 'teacher with no compensation');
    ok('Test 17: teacher with no compensation lists empty');

    // Per-batch / per-class
    const pbMath = await createCompensation(tenantAId, owner, t1.id, { type: 'PER_BATCH', amount: 8000, assignmentId: aMath.id, effectiveFrom: first(P) });
    assert(pbMath.assignment?.course?.name === 'HSC Science 2026' && pbMath.assignment.batch.name === 'Morning Batch A' && pbMath.assignment.subject.name === 'Mathematics', 'course > batch > subject labels');
    await expectError(
      () => createCompensation(tenantAId, owner, t1.id, { type: 'PER_CLASS', amount: 500, assignmentId: aMath.id, effectiveFrom: first(P) }),
      'COMPENSATION_OVERLAP',
      'Test 18: one pay model per assignment (batch + class cannot both pay it)'
    );
    const pcPhy = await createCompensation(tenantAId, owner, t1.id, { type: 'PER_CLASS', amount: 500, assignmentId: aPhy.id, effectiveFrom: first(P) });
    ok('Test 19: PER_BATCH and PER_CLASS created from the teacher\'s own assignments');

    // Sessions for per-class (Physics): 3 completed CLASS in P, 1 OPEN, 1 completed EXAM, 1 completed CLASS in P1, other teacher's.
    const mkSession = (date: string, over: Record<string, unknown> = {}) =>
      prisma.attendanceSession.create({
        data: { coachingCenterId: tenantAId, branchId: branch1.id, batchId: batchM.id, subjectId: physics.id, teacherId: t1.id, date: toDateOnly(date), type: 'CLASS', status: 'COMPLETED', ...over },
      });
    const pStart = first(P);
    await mkSession(pStart);
    await mkSession(`${pStart.slice(0, 8)}05`);
    await mkSession(`${pStart.slice(0, 8)}10`);
    await mkSession(`${pStart.slice(0, 8)}11`, { status: 'OPEN' });
    await mkSession(`${pStart.slice(0, 8)}12`, { type: 'EXAM' });
    await mkSession(`${first(P1).slice(0, 8)}20`);
    await mkSession(`${pStart.slice(0, 8)}13`, { teacherId: t4.id });
    await mkSession(`${pStart.slice(0, 8)}14`, { subjectId: math.id });
    ok('Test 20: session fixtures created');

    // ------------------------------------------------------------------
    console.log('--- Generation');
    await expectError(() => generateSalary(tenantAId, owner, { ...FUT, branchId: branch1.id }), 'SALARY_PERIOD_IN_FUTURE', 'Test 21: future month rejected');
    await expectError(() => generateSalary(tenantAId, staff1, { ...P, branchId: branch1.id }), 'SALARY_ACCESS_DENIED', 'Test 22: STAFF cannot generate');
    // A branch-locked caller's requested branch is ignored (resolveEffectiveBranchId): they can only ever act on their own.
    const lockedGen = await generateSalary(tenantAId, admin2, { ...P, branchId: branch1.id });
    const lockedPeriod = await prisma.salaryPeriod.findUniqueOrThrow({ where: { id: lockedGen.periodId } });
    assert(lockedPeriod.branchId === branch2.id, 'branch-2 admin is pinned to branch 2');
    assert((await prisma.salaryPeriod.count({ where: { coachingCenterId: tenantAId, branchId: branch1.id } })) === 0, 'no branch-1 period was created by the branch-2 admin');
    ok('Test 23: branch isolation — branch-2 admin is pinned to their own branch');
    await expectError(() => generateSalary(tenantAId, centerAdmin, { ...P }), 'BRANCH_REQUIRED', 'Test 24: center-wide admin must pick a branch');
    await expectError(() => generateSalary(tenantBId, ownerB, { ...P, branchId: branch1.id }), 'BRANCH_NOT_FOUND', 'Test 25: tenant B cannot generate against tenant A branch');

    const gen = await generateSalary(tenantAId, owner, { ...P, branchId: branch1.id });
    // t1 (fixed 22000 + batch 8000 + class 3x500) and t3 (custom 5000)
    assert(gen.created === 2 && gen.skipped.length === 0, `created 2 payables (got ${JSON.stringify(gen)})`);
    const ov = await getSalaryOverview(tenantAId, owner, { ...P, branchId: branch1.id });
    const row1 = ov.payables.find((p) => p.teacher.id === t1.id)!;
    assert(row1.netAmount === 22000 + 8000 + 1500, `t1 net = 31500 (got ${row1.netAmount})`);
    ok('Test 26: salary generated — fixed + per-batch + per-class combined');
    const detail = await getSalaryPayableDetail(tenantAId, owner, row1.id);
    const classLine = detail.lines.find((l) => l.type === 'PER_CLASS')!;
    assert(classLine.quantity === 3 && classLine.rate === 500 && classLine.amount === 1500, 'per-class: 3 completed CLASS sessions x 500 (OPEN/EXAM/other-teacher/other-subject/other-month excluded)');
    assert(detail.lines.find((l) => l.type === 'PER_BATCH')?.batchName === 'Morning Batch A', 'batch line carries course/batch/subject snapshot');
    assert(detail.lines.find((l) => l.type === 'MONTHLY_FIXED')?.amount === 22000, 'fixed line uses the rate in force for the month');
    ok('Test 27: calculation transparency (quantity x rate = amount, labels snapshotted)');
    const t3Row = ov.payables.find((p) => p.teacher.id === t3.id)!;
    assert(t3Row.netAmount === 5000 && t3Row.types.includes('CUSTOM'), 'custom amount');
    ok('Test 28: CUSTOM salary');

    const again = await generateSalary(tenantAId, owner, { ...P, branchId: branch1.id });
    assert(again.created === 0 && again.alreadyGenerated === 2, 'second generate creates nothing');
    ok('Test 29: duplicate generation is a no-op');

    // Historical month uses the OLD rate; concurrent generation yields no duplicates.
    const concurrent = await Promise.all([1, 2, 3].map(() => generateSalary(tenantAId, owner, { ...P1, branchId: branch1.id })));
    assert(concurrent.reduce((s, r) => s + r.created, 0) === 1, 'exactly one payable across 3 concurrent generates (t1 fixed 18000)');
    const ovP1 = await getSalaryOverview(tenantAId, owner, { ...P1, branchId: branch1.id });
    assert(ovP1.payables.length === 1 && ovP1.payables[0].netAmount === 18000, 'older month uses the older rate');
    assert((await prisma.salaryPeriod.count({ where: { coachingCenterId: tenantAId, branchId: branch1.id, year: P1.year, month: P1.month } })) === 1, 'one period row');
    ok('Test 30: effective-date selection + concurrent generation safe');

    const noRulesMonth = await generateSalary(tenantAId, owner, { ...P2, branchId: branch1.id });
    assert(noRulesMonth.created === 1, 'P2 has the old fixed rule only');
    const ovBranch2 = await generateSalary(tenantAId, owner, { ...P, branchId: branch2.id });
    assert(ovBranch2.created === 0 && ovBranch2.skipped.length === 0, 'branch 2 has no rules, so nothing is generated for it');
    ok('Test 31: branch scoping of generation');

    // ------------------------------------------------------------------
    console.log('--- Rule immutability once used');
    await expectError(() => updateCompensation(tenantAId, owner, t1.id, fixedNew.id, { amount: 99999 }), 'COMPENSATION_IN_USE', 'Test 32: amount of a used rule cannot be rewritten');
    await expectError(() => updateCompensation(tenantAId, owner, t1.id, fixedOld.id, { effectiveTo: last(P2) }), 'COMPENSATION_IN_USE', 'Test 33: cannot end a used rule before its last generated month');
    const upd = await updateCompensation(tenantAId, owner, t1.id, fixedNew.id, { notes: 'Annual review' });
    assert(upd.notes === 'Annual review', 'notes editable');
    ok('Test 34: notes remain editable on a used rule');
    const unusedUpd = await updateCompensation(tenantAId, owner, t3.id, t3Rule.id, { amount: 5000 });
    ok('Test 35: no-op update accepted');
    void unusedUpd;

    const futureRule = await createCompensation(tenantAId, owner, t5.id, { type: 'MONTHLY_FIXED', amount: 1000, effectiveFrom: first(FUT) });
    const wd = await endCompensation(tenantAId, owner, t5.id, futureRule.id);
    assert(wd.withdrawn === true, 'future unused rule withdrawn');
    ok('Test 36: a not-yet-started unused rule is withdrawn');
    const e = await endCompensation(tenantAId, owner, t1.id, fixedNew.id, last(CUR));
    assert(!e.withdrawn && e.compensation?.effectiveTo === last(CUR) && e.compensation.status === 'ENDED', 'used rule is ended, not deleted');
    await expectError(() => endCompensation(tenantAId, owner, t1.id, fixedOld.id), 'COMPENSATION_ALREADY_ENDED', 'Test 37: an already-ended rule cannot be re-extended');
    await expectError(() => endCompensation(tenantAId, staff1, t1.id, fixedNew.id), 'COMPENSATION_ACCESS_DENIED', 'Test 38: STAFF cannot end a rule');

    // ------------------------------------------------------------------
    console.log('--- Payments, expense link, cash reconciliation');
    const payable = row1; // net 31500, period P, branch1
    const sess = await openCashSession(tenantAId, owner, branch1.id, 20000);
    ok('Test 39: cash session opened (opening 20000)');

    await expectError(() => recordSalaryPayment(tenantAId, teacher1User, payable.id, { amount: 100, paymentMethod: 'CASH' }), 'SALARY_ACCESS_DENIED', 'Test 40: TEACHER cannot pay salary');
    await expectError(() => recordSalaryPayment(tenantAId, admin2, payable.id, { amount: 100, paymentMethod: 'CASH' }), 'FORBIDDEN_BRANCH', 'Test 41: other-branch admin cannot pay');
    await expectError(() => recordSalaryPayment(tenantBId, ownerB, payable.id, { amount: 100, paymentMethod: 'CASH' }), 'SALARY_PAYABLE_NOT_FOUND', 'Test 42: tenant isolation on payment');
    await expectError(() => recordSalaryPayment(tenantAId, owner, payable.id, { amount: 31500.01, paymentMethod: 'CASH' }), 'SALARY_OVERPAYMENT', 'Test 43: overpayment rejected');
    await expectError(() => recordSalaryPayment(tenantAId, owner, payable.id, { amount: 100, paymentMethod: 'CASH', paymentDate: first(FUT) }), 'INVALID_PAYMENT_DATE', 'Test 44: future payment date rejected');

    const p1 = await recordSalaryPayment(tenantAId, staff1, payable.id, { amount: 10000, paymentMethod: 'CASH', idempotencyKey: `${TAG}-k1` });
    assert(!p1.idempotentReplay && p1.payment.expenseId, 'partial payment created with an expense');
    const replay = await recordSalaryPayment(tenantAId, staff1, payable.id, { amount: 10000, paymentMethod: 'CASH', idempotencyKey: `${TAG}-k1` });
    assert(replay.idempotentReplay && replay.payment.id === p1.payment.id, 'idempotent replay returns the same payment');
    assert((await prisma.expense.count({ where: { coachingCenterId: tenantAId } })) === 1, 'no duplicate expense on retry');
    ok('Test 45: partial payment (STAFF allowed) + idempotent retry creates one expense');

    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: p1.payment.expenseId! }, include: { category: true } });
    assert(Number(exp.amount) === 10000 && exp.paymentMethod === 'CASH' && exp.branchId === branch1.id && exp.category.code === 'TEACHER_SALARY', 'expense mirrors the payment');
    ok('Test 46: salary payment → Expense linkage (category, branch, method, amount)');

    // Concurrency: remaining is 21500; two simultaneous 15000 payments → exactly one wins.
    const race = await Promise.allSettled([
      recordSalaryPayment(tenantAId, owner, payable.id, { amount: 15000, paymentMethod: 'BKASH', transactionId: 'TX-RACE-1' }),
      recordSalaryPayment(tenantAId, owner, payable.id, { amount: 15000, paymentMethod: 'BKASH', transactionId: 'TX-RACE-2' }),
    ]);
    assert(race.filter((r) => r.status === 'fulfilled').length === 1, 'exactly one of two racing payments succeeds');
    const afterRace = await prisma.salaryPayable.findUniqueOrThrow({ where: { id: payable.id } });
    assert(Number(afterRace.paidAmount) === 25000 && Number(afterRace.remainingAmount) === 6500 && afterRace.status === 'PARTIAL', 'paid never exceeds net');
    assert((await prisma.expense.count({ where: { coachingCenterId: tenantAId } })) === 2, 'losing request left no expense behind');
    ok('Test 47: concurrent payments cannot overpay and leave no orphan expense');

    await expectError(() => cancelSalaryPayable(tenantAId, owner, payable.id, 'mistake'), 'SALARY_CANNOT_CANCEL', 'Test 48: salary with payments cannot be cancelled');

    const final = await recordSalaryPayment(tenantAId, owner, payable.id, { amount: 6500, paymentMethod: 'BANK', referenceNumber: 'CHQ-77' });
    const paid = await prisma.salaryPayable.findUniqueOrThrow({ where: { id: payable.id } });
    assert(paid.status === 'PAID' && Number(paid.remainingAmount) === 0, 'fully paid');
    await expectError(() => recordSalaryPayment(tenantAId, owner, payable.id, { amount: 1, paymentMethod: 'CASH' }), 'SALARY_ALREADY_PAID', 'Test 49: already-paid salary rejects payment');
    void final;

    const history = await getSalaryPayableDetail(tenantAId, owner, payable.id);
    assert(history.payments.length === 3 && history.payments.every((x) => x.expenseId), 'payment history lists 3 payments, each linked to an expense');
    ok('Test 50: full payment, history, and status transitions');

    // Cash reconciliation: only the 10000 CASH payment (BKASH/BANK are not drawer cash).
    const closed = await closeCashSession(tenantAId, owner, sess.id, { countedCash: 10000 });
    assert(Number(closed.expectedCash) === 20000 - 10000, `expected cash = opening 20000 - cash salary 10000 (got ${closed.expectedCash})`);
    ok('Test 51: cash reconciliation subtracts CASH salary expenses (and ignores BKASH/BANK)');

    await expectError(
      () => recordSalaryPayment(tenantAId, owner, t3Row.id, { amount: 100, paymentMethod: 'CASH' }),
      'SALARY_CASH_SESSION_CLOSED',
      'Test 52: CASH cannot be recorded into an already-closed cash session'
    );
    const nonCash = await recordSalaryPayment(tenantAId, owner, t3Row.id, { amount: 5000, paymentMethod: 'NAGAD', transactionId: 'NG-1' });
    assert(nonCash.payment.id, 'non-cash payment still fine');

    // Period auto-PAID once finalized + everything paid
    const periodRow = await prisma.salaryPeriod.findFirstOrThrow({ where: { coachingCenterId: tenantAId, branchId: branch1.id, year: P.year, month: P.month } });
    assert(periodRow.status === 'OPEN', 'period stays OPEN until finalized');
    await expectError(() => finalizeSalaryPeriod(tenantAId, staff1, periodRow.id), 'SALARY_ACCESS_DENIED', 'Test 53: STAFF cannot finalize');
    const fin = await finalizeSalaryPeriod(tenantAId, owner, periodRow.id);
    assert(fin.status === 'PAID', 'finalizing a fully paid period settles it to PAID');
    await expectError(() => generateSalary(tenantAId, owner, { ...P, branchId: branch1.id }), 'SALARY_PERIOD_LOCKED', 'Test 54: finalized period cannot be regenerated');
    await expectError(() => finalizeSalaryPeriod(tenantAId, owner, periodRow.id), 'SALARY_PERIOD_LOCKED', 'Test 55: double finalize rejected');

    // Cancel path on another period
    const p1Row = ovP1.payables[0];
    await expectError(() => cancelSalaryPayable(tenantAId, teacher1User, p1Row.id, 'no'), 'SALARY_ACCESS_DENIED', 'Test 56: TEACHER cannot cancel');
    await cancelSalaryPayable(tenantAId, owner, p1Row.id, 'Teacher left before month start');
    await expectError(() => recordSalaryPayment(tenantAId, owner, p1Row.id, { amount: 100, paymentMethod: 'CASH' }), 'SALARY_CANCELLED', 'Test 57: cancelled salary cannot be paid');
    const ovP1b = await getSalaryOverview(tenantAId, owner, { ...P1, branchId: branch1.id });
    assert(ovP1b.totals.payable === 0, 'cancelled salary excluded from totals');
    ok('Test 58: cancellation and totals');

    // ------------------------------------------------------------------
    console.log('--- Read access');
    await expectError(() => getSalaryOverview(tenantAId, teacher1User, { ...P, branchId: branch1.id }), 'SALARY_ACCESS_DENIED', 'Test 59: TEACHER cannot open the salary overview');
    await expectError(() => getSalaryPayableDetail(tenantAId, admin2, payable.id), 'FORBIDDEN_BRANCH', 'Test 60: other-branch admin cannot read detail');
    await expectError(() => getSalaryPayableDetail(tenantBId, ownerB, payable.id), 'SALARY_PAYABLE_NOT_FOUND', 'Test 61: tenant B cannot read tenant A detail');
    const mine = await listTeacherSalaryHistory(tenantAId, teacher1User, t1.id);
    assert(mine.length >= 1 && mine.every((m) => m.id !== p1Row.id), 'teacher sees own non-cancelled history');
    await expectError(() => listTeacherSalaryHistory(tenantAId, teacher4User, t1.id), 'FORBIDDEN_TEACHER_SCOPE', 'Test 62: teacher cannot read another teacher\'s salary');
    const noneHist = await listTeacherSalaryHistory(tenantAId, teacher4User, t4.id);
    assert(noneHist.length === 0, 'teacher with no salary has an empty history');
    ok('Test 63: read-only self history');

    // ------------------------------------------------------------------
    console.log('--- Audit, DB guards, localization');
    const actions = (await prisma.auditLog.findMany({ where: { coachingCenterId: tenantAId, action: { startsWith: 'TEACHER_COMPENSATION' } } })).map((a) => a.action);
    for (const a of ['TEACHER_COMPENSATION_CREATED', 'TEACHER_COMPENSATION_ENDED']) assert(actions.includes(a), `audit ${a}`);
    const salaryActions = (await prisma.auditLog.findMany({ where: { coachingCenterId: tenantAId, action: { startsWith: 'SALARY_' } } })).map((a) => a.action);
    for (const a of ['SALARY_PERIOD_CREATED', 'SALARY_GENERATED', 'SALARY_FINALIZED', 'SALARY_CANCELLED', 'SALARY_PAYMENT_CREATED']) assert(salaryActions.includes(a), `audit ${a}`);
    const allDetails = JSON.stringify((await prisma.auditLog.findMany({ where: { coachingCenterId: tenantAId, action: { startsWith: 'SALARY_' } } })).map((a) => a.details));
    assert(!/password|secret|token|apiKey/i.test(allDetails), 'audit details carry no secrets');
    ok('Test 64: audit events recorded, no secrets');

    await expectError(
      () => prisma.$executeRawUnsafe(`UPDATE salary_payables SET "paidAmount" = "netAmount" + 1, "remainingAmount" = -1 WHERE id = '${payable.id}'`),
      'salary_payables',
      'Test 65: DB CHECK constraint blocks paid > net even bypassing the service'
    );
    const dupPayable = prisma.salaryPayable.create({
      data: { coachingCenterId: tenantAId, branchId: branch1.id, salaryPeriodId: periodRow.id, teacherId: t1.id, baseAmount: 1, netAmount: 1, remainingAmount: 1, breakdown: [] },
    });
    await expectError(() => dupPayable, 'Unique constraint', 'Test 66: DB unique (period, teacher) blocks duplicate payables');

    const en = DICTIONARY.en as any;
    const bn = DICTIONARY.bn as any;
    assert(en.salary && bn.salary && en.compensation && bn.compensation, 'salary + compensation dictionaries exist in both languages');
    const sameShape = (e: any, b: any, path: string) => {
      for (const k of Object.keys(e)) {
        if (typeof e[k] === 'object') sameShape(e[k], b[k] ?? {}, path + '.' + k);
        else assert(typeof b[k] === 'string' && b[k] !== '', 'bn.' + path + '.' + k);
      }
    };
    sameShape(en.salary, bn.salary, 'salary');
    sameShape(en.compensation, bn.compensation, 'compensation');
    assert(/[ঀ-৿]/.test(bn.salary.title) && /[ঀ-৿]/.test(bn.compensation.title), 'Bengali strings are actually Bengali');
    ok('Test 67: Bengali localization complete');

    void today;
    console.log('\n==================================================');
    console.log(`Phase 13 Verification Complete: ${passed} checks passed!`);
    console.log('==================================================\n');
  } finally {
    console.log('Cleaning up test tenants...');
    if (tenantAId) await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch((e) => console.error('cleanup A failed', e?.message));
    if (tenantBId) await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch((e) => console.error('cleanup B failed', e?.message));
    console.log('Cleanup complete.');
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
