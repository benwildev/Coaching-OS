import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { createCompensation } from '../lib/services/compensation.service';
import { generateSalary, recordSalaryPayment, monthBounds } from '../lib/services/salary.service';
import { openCashSession, computeExpectedCash, getCashBoxDashboard, closeCashSession } from '../lib/services/cash-session.service';
import { getFinanceOverview, resolveFinanceScope } from '../lib/services/finance-overview.service';
import { getFinanceReports } from '../lib/services/finance-reports.service';
import { createPayment, refundPayment } from '../lib/services/payment.service';
import { createExpense, cancelExpense } from '../lib/services/expense.service';
import { getDashboardData } from '../lib/services/dashboard.service';
import { getCurrentDhakaDateString, toDateOnly } from '../lib/schedule';
import { can, defaultPermissionsFor } from '../lib/auth/permissions';
import { filterNavigation } from '../lib/navigation';
import { canAccessRoute } from '../lib/route-access';
import type { SessionUser } from '../lib/auth/session';

/**
 * Phase 15.2 — Finance Overview verification.
 * Throwaway tenants; every expected figure below is computed BY HAND from the fixture,
 * independent of the service's SQL.
 */
const TAG = `P152-${Date.now()}`;
let passed = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`✔ ${label}`);
};
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}
const eq = (a: number | null, b: number | null, label: string) => assert(a === b || (a !== null && b !== null && Math.abs(a - b) < 0.005), `${label} — expected ${b}, got ${a}`);
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
/** A Dhaka wall-clock instant: ymd + Dhaka hh:mm → UTC Date. */
const dhaka = (ymd: string, hhmmss = '12:00:00') => new Date(new Date(`${ymd}T${hhmmss}.000Z`).getTime() - 6 * 3600 * 1000);

async function main() {
  console.log('\n==================================================');
  console.log('Phase 15.2 — Finance Overview Verification');
  console.log('==================================================\n');
  let tenantAId = '';
  let tenantBId = '';
  try {
    const stamp = Date.now().toString().slice(-5);
    const mkSetup = (letter: string, phonePrefix: string) =>
      completeInitialSetup({
        centerName: `Center ${letter} ${TAG}`, centerCode: `T152${letter}${stamp}`, centerPhone: '01711000001', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
        ownerName: `Owner ${letter}`, ownerEmail: `owner-t152${letter}${stamp}@test.local`.toLowerCase(), ownerPhone: `${phonePrefix}${Date.now().toString().slice(-8)}`,
        ownerPassword: 'Password123!', branchName: 'Main Campus', branchCode: 'MAIN', sessionName: '2026', sessionStartDate: '2026-01-01', sessionEndDate: '2026-12-31',
        selectedPrograms: [], primaryColor: '#063B78', accentColor: '#FFD200',
      } as any);
    const setupA = await mkSetup('A', '017');
    const setupB = await mkSetup('B', '018');
    tenantAId = setupA.center.id;
    tenantBId = setupB.center.id;
    const b1 = setupA.branch;
    const b2 = await prisma.branch.create({ data: { coachingCenterId: tenantAId, name: 'Dhanmondi', code: 'DHAN' } });

    const mkUser = (label: string, branchId: string | null) =>
      prisma.user.create({ data: { coachingCenterId: tenantAId, branchId, email: `${label}-${stamp}@test.local`, phone: `0161${Date.now().toString().slice(-7)}${label.length}`, name: label, passwordHash: 'x', status: 'ACTIVE' } });
    const staffRow = await mkUser('staff1', b1.id);
    const sessionUser = (role: 'OWNER' | 'ADMIN' | 'STAFF' | 'TEACHER', userId: string, branchId: string | null, cc = tenantAId): SessionUser =>
      ({ userId, coachingCenterId: cc, email: `${role}@t.local`, name: role, phone: null, banglaName: null, role, branchId, sessionVersion: 1, permissions: defaultPermissionsFor(role) }) as any;
    const owner = sessionUser('OWNER', setupA.owner.id, null);
    const ownerB = sessionUser('OWNER', setupB.owner.id, null, tenantBId);
    const admin1 = sessionUser('ADMIN', owner.userId, b1.id); // branch-locked admin
    const admin2 = sessionUser('ADMIN', owner.userId, b2.id);
    const centerAdmin = sessionUser('ADMIN', owner.userId, null);
    const staff1 = sessionUser('STAFF', staffRow.id, b1.id);
    const teacher = sessionUser('TEACHER', staffRow.id, b1.id);

    // ---- Fixture -----------------------------------------------------------
    const stu = (n: number, branchId: string) => prisma.student.create({ data: { coachingCenterId: tenantAId, branchId, studentIdCode: `${TAG}-S${n}`, name: `Student ${n}`, email: `${TAG.toLowerCase()}-s${n}@verify.local` } });
    const s1 = await stu(1, b1.id);
    const s2 = await stu(2, b2.id);
    const inv1 = await prisma.feeInvoice.create({ data: { coachingCenterId: tenantAId, branchId: b1.id, studentId: s1.id, invoiceNumber: `${TAG}-I1` } });
    const inv2 = await prisma.feeInvoice.create({ data: { coachingCenterId: tenantAId, branchId: b2.id, studentId: s2.id, invoiceNumber: `${TAG}-I2` } });
    let rn = 0;
    const pay = (branch: 'b1' | 'b2', method: string, amount: number, paymentDate: Date, status = 'COMPLETED') =>
      prisma.payment.create({
        data: {
          coachingCenterId: tenantAId, branchId: branch === 'b1' ? b1.id : b2.id, studentId: branch === 'b1' ? s1.id : s2.id, invoiceId: branch === 'b1' ? inv1.id : inv2.id,
          receiptNumber: `${TAG}-R${++rn}`, amount, paymentMethod: method as any, paymentDate, status: status as any,
        },
      });
    const refund = (paymentId: string, amount: number, refundDate: Date) => prisma.paymentRefund.create({ data: { coachingCenterId: tenantAId, paymentId, amount, reason: 'verify', refundDate } });

    // Window W = 2026-03-10 .. 2026-03-12 (Dhaka days). Previous period = 2026-03-07 .. 2026-03-09.
    const p1 = await pay('b1', 'CASH', 1000, dhaka('2026-03-10'));
    await pay('b1', 'BKASH', 2000, dhaka('2026-03-10'));
    await pay('b1', 'NAGAD', 500, dhaka('2026-03-11'));
    const p4 = await pay('b2', 'BANK', 3000, dhaka('2026-03-11'));
    await pay('b2', 'CARD', 700, dhaka('2026-03-12'));
    await pay('b1', 'OTHER', 300, dhaka('2026-03-12'));
    const voided = await pay('b1', 'CASH', 400, dhaka('2026-03-11'), 'VOIDED'); // excluded
    await pay('b1', 'CASH', 900, dhaka('2026-03-10', '00:00:00')); // 00:00 Dhaka on the first day → INCLUDED
    await pay('b1', 'CASH', 800, dhaka('2026-03-13', '00:00:00')); // 00:00 Dhaka the day after → excluded
    await pay('b1', 'BKASH', 100, dhaka('2026-03-09', '23:59:59')); // 23:59:59 Dhaka the day before → previous period
    await pay('b2', 'CASH', 600, dhaka('2026-03-08')); // previous period
    const pOut = await pay('b1', 'BKASH', 50, dhaka('2026-03-11'));
    await refund(p1.id, 200, dhaka('2026-03-11')); // CASH, B1, in window
    await refund(p4.id, 1000, dhaka('2026-03-12')); // BANK, B2, in window
    await refund(voided.id, 50, dhaka('2026-03-11')); // refund of a VOIDED payment → excluded
    await refund(pOut.id, 25, dhaka('2026-03-13')); // refund dated outside the window → excluded
    // pOut (BKASH 50 on 03-11) is a real in-window payment: gross grows by 50, so adjust expectations below.

    const mkCat = (cc: string, name: string, code?: string) => prisma.expenseCategory.create({ data: { coachingCenterId: cc, name, banglaName: `${name}-bn`, code } });
    const rent = await mkCat(tenantAId, 'Rent');
    const util = await mkCat(tenantAId, 'Utilities');
    const mkt = await mkCat(tenantAId, 'Marketing');
    const exp = (branchId: string, categoryId: string, amount: number, method: string, ymd: string, status = 'ACTIVE', cc = tenantAId) =>
      prisma.expense.create({
        data: { coachingCenterId: cc, branchId, categoryId, amount, paymentMethod: method as any, date: toDateOnly(ymd), status, createdById: owner.userId, paidTo: 'Vendor', ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: 'verify' } : {}) },
      });
    await exp(b1.id, rent.id, 5000, 'CASH', '2026-03-10');
    await exp(b2.id, util.id, 1000, 'BANK', '2026-03-11');
    await exp(b1.id, mkt.id, 700, 'BKASH', '2026-03-12', 'CANCELLED'); // excluded
    await exp(b1.id, rent.id, 300, 'CASH', '2026-03-12');
    await exp(b1.id, rent.id, 200, 'CASH', '2026-03-08'); // previous period

    // Real salary flow (Phase 13): two payments → two linked Expense rows.
    const teacherRow = await prisma.teacher.create({ data: { coachingCenterId: tenantAId, branchId: b1.id, teacherCode: '1', name: 'Tanvir Ahmed', phone: '01910000001' } });
    const t = getCurrentDhakaDateString();
    const lm = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 2, 1));
    const P = { year: lm.getUTCFullYear(), month: lm.getUTCMonth() + 1 };
    await createCompensation(tenantAId, owner, teacherRow.id, { type: 'MONTHLY_FIXED', amount: 22000, effectiveFrom: monthBounds(P.year, P.month).start, effectiveTo: null });
    await generateSalary(tenantAId, owner, { ...P, branchId: b1.id });
    const payable = await prisma.salaryPayable.findFirstOrThrow({ where: { coachingCenterId: tenantAId, teacherId: teacherRow.id } });
    const sp1 = await recordSalaryPayment(tenantAId, owner, payable.id, { amount: 4000, paymentMethod: 'BANK', paymentDate: '2026-03-11' } as any);
    const sp2 = await recordSalaryPayment(tenantAId, owner, payable.id, { amount: 1500, paymentMethod: 'CASH', paymentDate: '2026-03-12' } as any);
    assert(sp1.payment.expenseId && sp2.payment.expenseId, 'each salary payment owns an expense');

    // Tenant B: its own data must never leak into A.
    const catB = await mkCat(tenantBId, 'Rent B');
    await exp(setupB.branch.id, catB.id, 777, 'CASH', '2026-03-11', 'ACTIVE', tenantBId);

    // ---- Expected (hand computed) -------------------------------------------
    // Gross  = 1000+2000+500+3000+700+300+900+50 = 8450      Refunds = 200+1000 = 1200      Net = 7250
    // Expenses = 5000+1000+300 (manual ACTIVE) + 4000+1500 (salary) = 11800     Profit = 7250-11800 = -4550
    const W = { from: '2026-03-10', to: '2026-03-12' };
    const all = await resolveFinanceScope(tenantAId, owner, undefined);
    const ov = await getFinanceOverview(all, { ...W, comparison: true });

    console.log('--- Totals');
    eq(ov.collection.gross, 8450, 'Test 1: gross collection (VOIDED + out-of-window excluded, 00:00 Dhaka boundary included)');
    ok('Test 1: gross collection');
    eq(ov.collection.refunds, 1200, 'refunds');
    ok('Test 2: refunds (voided-payment refund and out-of-window refund excluded)');
    eq(ov.collection.net, 7250, 'net');
    assert(Math.abs(ov.collection.net - (ov.collection.gross - ov.collection.refunds)) < 0.005, 'net = gross − refunds');
    ok('Test 3: net collection = gross − refunds');
    eq(ov.expenses.total, 11800, 'expenses');
    ok('Test 4/5: ACTIVE expenses only (cancelled 700 excluded)');
    eq(ov.profit.netProfit, -4550, 'profit');
    assert(Math.abs(ov.profit.netProfit - (ov.collection.net - ov.expenses.total)) < 0.005, 'profit = net − expenses');
    ok('Test 8: net profit = net collection − active expenses');
    eq(ov.profit.margin, -62.8, 'margin');
    ok('Test 9: net margin (-4550/7250 = -62.8%)');

    console.log('--- Salary exactly once');
    const salaryExpenses = await prisma.expense.findMany({ where: { coachingCenterId: tenantAId, status: 'ACTIVE', salaryPayment: { isNot: null } } });
    const salarySum = salaryExpenses.reduce((a, e) => a + Number(e.amount), 0);
    const salaryPayments = await prisma.salaryPayment.aggregate({ where: { coachingCenterId: tenantAId }, _sum: { amount: true } });
    eq(salarySum, 5500, 'salary expenses');
    eq(Number(salaryPayments._sum.amount), 5500, 'salary payments');
    ok('Test 6/7: salary expenses == SalaryPayment-linked expenses, 5 500 counted once (not 11 000)');
    const salaryCat = ov.expenseCategories.find((c) => c.code === 'TEACHER_SALARY');
    assert(salaryCat, 'salary category present');
    eq(salaryCat.amount, 5500, 'salary category amount');
    assert(ov.topExpenses.filter((e) => e.isSalary).every((e) => e.paidTo === null), 'salary rows do not expose the teacher name');
    ok('Test 7b: salary appears once in categories; teacher name not exposed in top expenses');

    console.log('--- Reconciliation');
    eq(ov.paymentMethods.reduce((a, m) => a + m.net, 0), ov.collection.net, 'methods');
    ok('Test 10: Σ payment-method net == net collection');
    const m = Object.fromEntries(ov.paymentMethods.map((x) => [x.method, x.net]));
    eq(m.CASH, 1700, 'cash net'); eq(m.BKASH, 2050, 'bkash net'); eq(m.NAGAD, 500, 'nagad'); eq(m.BANK, 2000, 'bank net'); eq(m.CARD, 700, 'card'); eq(m.OTHER, 300, 'other');
    ok('Test 10b: per-method net (refunds attributed to the original payment method)');
    eq(ov.expenseCategories.reduce((a, c) => a + c.amount, 0), ov.expenses.total, 'categories');
    ok('Test 11: Σ expense categories == total expenses');
    const pctSum = ov.expenseCategories.reduce((a, c) => a + (c.percent ?? 0), 0);
    assert(Math.abs(pctSum - 100) < 0.2, 'category percentages ≈ 100');
    eq(ov.trend.reduce((a, x) => a + x.income, 0), ov.collection.net, 'trend income');
    eq(ov.trend.reduce((a, x) => a + x.expenses, 0), ov.expenses.total, 'trend expenses');
    eq(ov.trend.reduce((a, x) => a + x.profit, 0), ov.profit.netProfit, 'trend profit');
    ok('Test 11b: trend totals == headline totals');

    console.log('--- Dates / Asia/Dhaka');
    assert(ov.trend.length === 3 && ov.period.granularity === 'day', 'three day buckets');
    const d12 = ov.trend.find((x) => x.bucket === '2026-03-12')!;
    const d10 = ov.trend.find((x) => x.bucket === '2026-03-10')!;
    eq(d10.gross, 3900, '03-10 gross includes the 00:00 Dhaka payment');
    eq(d12.refunds, 1000, '03-12 refunds');
    ok('Test 12/13: day boundaries are Asia/Dhaka (00:00 Dhaka included on its own day; 23:59:59 the day before is not)');
    const oneDay = await getFinanceOverview(all, { from: '2026-03-09', to: '2026-03-09' });
    eq(oneDay.collection.gross, 100, 'single-day 23:59:59 Dhaka');
    ok('Test 13b: 23:59:59 Dhaka belongs to its own day');
    await expectError(() => getFinanceOverview(all, { from: '2026-03-12', to: '2026-03-10' }), 'INVALID_DATE_RANGE', 'Test 12b: inverted range rejected');

    console.log('--- Branch isolation');
    const only1 = await getFinanceOverview(await resolveFinanceScope(tenantAId, owner, b1.id), W);
    const only2 = await getFinanceOverview(await resolveFinanceScope(tenantAId, owner, b2.id), W);
    eq(only1.collection.net, 4550, 'B1 net'); eq(only1.expenses.total, 10800, 'B1 expenses'); eq(only1.profit.netProfit, -6250, 'B1 profit');
    eq(only2.collection.net, 2700, 'B2 net'); eq(only2.expenses.total, 1000, 'B2 expenses'); eq(only2.profit.netProfit, 1700, 'B2 profit');
    eq(only1.collection.net + only2.collection.net, ov.collection.net, 'branch sum net');
    eq(only1.expenses.total + only2.expenses.total, ov.expenses.total, 'branch sum expenses');
    ok('Test 14/15: owner All-branches == B1 + B2; each branch filters payments, refunds AND expenses consistently');
    const a1 = await getFinanceOverview(await resolveFinanceScope(tenantAId, admin1, b2.id), W);
    eq(a1.collection.net, only1.collection.net, 'admin1 pinned net');
    eq(a1.expenses.total, only1.expenses.total, 'admin1 pinned expenses');
    assert(a1.branch.locked && a1.branch.options.length === 1, 'locked admin sees only their branch option');
    ok('Test 16: branch-locked ADMIN asking for another branch is pinned to their own (server-side)');
    const ca = await getFinanceOverview(await resolveFinanceScope(tenantAId, centerAdmin, undefined), W);
    eq(ca.collection.net, ov.collection.net, 'center admin all');
    ok('Test 16b: centre-wide ADMIN sees all branches');
    await expectError(() => resolveFinanceScope(tenantAId, owner, setupB.branch.id), 'BRANCH_NOT_FOUND', 'Test 14b: another tenant\'s branch id is rejected');
    const ovB = await getFinanceOverview(await resolveFinanceScope(tenantBId, ownerB, undefined), W);
    eq(ovB.expenses.total, 777, 'tenant B expenses'); eq(ovB.collection.gross, 0, 'tenant B gross');
    ok('Test 14c: tenant isolation (A totals unchanged by B data; B sees only its own)');

    console.log('--- Permissions');
    assert(can(owner, 'finance.dashboard.read') && can(admin1, 'finance.dashboard.read'), 'owner and admin hold finance.dashboard.read');
    assert(!can(staff1, 'finance.dashboard.read'), 'STAFF does not hold it by default');
    assert(!can(teacher, 'finance.dashboard.read'), 'TEACHER does not hold it');
    assert(can({ role: 'STAFF', permissions: ['finance.dashboard.read'] }, 'finance.dashboard.read'), 'STAFF with an explicit grant can');
    ok('Test 17/18: permission matrix (Owner/Admin yes, Staff only if granted, Teacher no)');
    assert(canAccessRoute(owner as any, '/finance') && !canAccessRoute(teacher as any, '/finance') && !canAccessRoute(staff1 as any, '/finance'), 'route guard');
    assert(filterNavigation(owner as any, null).some((i) => i.id === 'finance') && !filterNavigation(teacher as any, null).some((i) => i.id === 'finance'), 'nav entry');
    ok('Test 18b: /finance route guard and nav entry follow the permission');

    console.log('--- Zero handling / comparison');
    const empty = await getFinanceOverview(all, { from: '2000-01-01', to: '2000-01-01', comparison: true });
    assert(empty.collection.net === 0 && empty.profit.margin === null, 'zero income → margin is null');
    ok('Test 19: zero income gives margin "—" (null), no division by zero');
    assert(empty.comparison && empty.comparison.hasPrevious === false && empty.comparison.netCollection.changePct === null, 'zero previous');
    ok('Test 20: zero previous period → no percentage (no Infinity)');
    // Previous = 2026-03-07..09: gross 100+600 = 700, expenses 200, net 700, profit 500.
    const c = ov.comparison!;
    assert(c.hasPrevious, 'has previous');
    eq(c.netCollection.previous, 700, 'prev net'); eq(c.expenses.previous, 200, 'prev expenses'); eq(c.netProfit.previous, 500, 'prev profit');
    eq(c.netCollection.changePct, 935.7, 'net change %'); eq(c.expenses.changePct, 5800, 'expense change %'); eq(c.netProfit.changePct, -1010, 'profit change %');
    ok('Test 21: previous-period comparison computed from real equal-length prior period');

    console.log('--- Cash consistency');
    const today = getCurrentDhakaDateString();
    const sess = await openCashSession(tenantAId, owner, b1.id, 1000);
    await exp(b1.id, rent.id, 250, 'CASH', today); // ACTIVE → leaves the drawer
    await exp(b1.id, rent.id, 999, 'CASH', today, 'CANCELLED'); // CANCELLED → must not
    const ovToday = await getFinanceOverview(await resolveFinanceScope(tenantAId, owner, b1.id), { from: today, to: today });
    const row = ovToday.cash.sessions.find((s) => s.id === (sess as any).id);
    assert(row && row.status === 'OPEN', 'open session shown');
    const direct = await computeExpectedCash(tenantAId, b1.id, toDateOnly(today), 1000);
    eq(row.expectedCash, direct, 'overview expected cash == cash-session formula');
    eq(direct, 750, 'expected = 1000 opening − 250 active cash expense (cancelled 999 ignored)');
    ok('Test 22: cash position uses the existing CashSession formula; cancelled expenses never leave the drawer');
    eq(ov.cash.movement.collected, 1900, 'cash collected'); eq(ov.cash.movement.refunded, 200, 'cash refunded'); eq(ov.cash.movement.expenses, 6800, 'cash expenses');
    eq(ov.cash.movement.net, -5100, 'cash net');
    ok('Test 22b: cash movement (cash payments − cash refunds − cash expenses incl. salary once)');

    console.log('--- Main dashboard branch scope (Phase 15.0 finding)');
    const now = new Date();
    await prisma.payment.create({ data: { coachingCenterId: tenantAId, branchId: b1.id, studentId: s1.id, invoiceId: inv1.id, receiptNumber: `${TAG}-D1`, amount: 77, paymentMethod: 'CASH', paymentDate: now, status: 'COMPLETED' } });
    await prisma.payment.create({ data: { coachingCenterId: tenantAId, branchId: b2.id, studentId: s2.id, invoiceId: inv2.id, receiptNumber: `${TAG}-D2`, amount: 123, paymentMethod: 'CASH', paymentDate: now, status: 'COMPLETED' } });
    const dOwner = await getDashboardData(tenantAId, { range: 3 }, owner as any);
    const dA1 = await getDashboardData(tenantAId, { range: 3 }, admin1 as any);
    const dA2 = await getDashboardData(tenantAId, { range: 3 }, admin2 as any);
    eq(dOwner.kpis.collected.value, 200, 'owner dashboard collected');
    eq(dA1.kpis.collected.value, 77, 'branch-1 admin dashboard collected');
    eq(dA2.kpis.collected.value, 123, 'branch-2 admin dashboard collected');
    assert(!(dA1 as any).recentPayments?.some?.((p: any) => p.student?.name === 'Student 2'), 'no other-branch recent payment');
    ok('Test 14d: /dashboard finance is branch-scoped server-side for branch-locked ADMIN/STAFF');

    console.log('--- DB integrity');
    await expectError(() => exp(b1.id, rent.id, 0, 'CASH', '2026-03-10'), 'expenses_amount_positive', 'Test: CHECK amount > 0');
    await expectError(() => exp(b1.id, rent.id, 10, 'CASH', '2026-03-10', 'VOIDED'), 'expenses_status_valid', 'Test: CHECK status in (ACTIVE, CANCELLED)');

    console.log('--- Phase 15.2: Detailed Finance Reports');
    const rep = await getFinanceReports(all, { from: '2026-03-10', to: '2026-03-12', comparison: true });
    eq(rep.summary.grossCollection, 8450, 'Reports gross collection');
    eq(rep.summary.refunds, 1200, 'Reports refunds');
    eq(rep.summary.netCollection, 7250, 'Reports net collection');
    eq(rep.summary.totalExpenses, 11800, 'Reports total expenses');
    eq(rep.summary.netProfit, -4550, 'Reports net profit');
    eq(rep.summary.salaryExpenses, 5500, 'Reports salary expenses counted once');
    eq(rep.summary.salaryExpensesCount, 2, 'Reports 2 salary expense records');
    ok('Test 23: Detailed Finance Reports headline summaries match hand-calculated expectations');

    // Income breakdown checks
    eq(rep.income.byDate.reduce((a, r) => a + r.net, 0), 7250, 'Income by date sum');
    eq(rep.income.byBranch.reduce((a, r) => a + r.net, 0), 7250, 'Income by branch sum');
    eq(rep.income.byMethod.reduce((a, r) => a + r.net, 0), 7250, 'Income by method sum');
    ok('Test 24: Income breakdowns (date, branch, method) all reconcile to net collection');

    // Expense breakdown checks
    eq(rep.expenses.byCategory.reduce((a, r) => a + r.amount, 0), 11800, 'Expenses by category sum');
    eq(rep.expenses.byBranch.reduce((a, r) => a + r.amount, 0), 11800, 'Expenses by branch sum');
    eq(rep.expenses.byMethod.reduce((a, r) => a + r.amount, 0), 11800, 'Expenses by method sum');
    ok('Test 25: Expense breakdowns (category, branch, method) all reconcile to total expenses');

    // Reports filtering
    const repCashOnly = await getFinanceReports(all, { from: '2026-03-10', to: '2026-03-12', paymentMethod: 'CASH' });
    eq(repCashOnly.summary.netCollection, 1700, 'Reports payment method filter CASH');
    const repRentOnly = await getFinanceReports(all, { from: '2026-03-10', to: '2026-03-12', categoryId: rent.id });
    eq(repRentOnly.summary.totalExpenses, 5300, 'Reports category filter Rent');
    ok('Test 26: Finance Reports server-side filtering by payment method and category');

    console.log('--- Phase 15.2: Cash Box Dashboard');
    const cashBoxOwner = await getCashBoxDashboard(tenantAId, owner, b1.id, today);
    assert(cashBoxOwner.session !== null, 'Cash Box has today session for B1');
    assert(cashBoxOwner.session?.status === 'OPEN', 'Cash Box today session is OPEN');
    eq(cashBoxOwner.session?.expectedCash, 827, 'Cash Box expected cash is 827 (1000 open + 77 collected - 250 expense)');
    assert(!cashBoxOwner.branch.locked, 'Owner is not branch locked');
    ok('Test 27: Cash Box dashboard returns live expected cash and drawer status');

    const cashBoxAdminLocked = await getCashBoxDashboard(tenantAId, admin1, b2.id, today);
    assert(cashBoxAdminLocked.branch.locked, 'Admin is branch locked');
    assert(cashBoxAdminLocked.branch.id === b1.id, 'Admin locked to b1 even when requesting b2');
    ok('Test 28: Cash Box enforces branch scoping for branch-locked administrators');

    console.log('--- Phase 15.2: Cash Session Closing & Discrepancy Reconciliation');
    // Discrepancy without note must fail
    await expectError(
      () => closeCashSession(tenantAId, owner, sess.id, { countedCash: 700, note: '' }),
      'CASH_SESSION_NOTE_REQUIRED',
      'Test 29: Closing with discrepancy requires a non-empty note'
    );
    await expectError(
      () => closeCashSession(tenantAId, owner, sess.id, { countedCash: 700, note: '   ' }),
      'CASH_SESSION_NOTE_REQUIRED',
      'Test 29b: Closing with discrepancy rejects whitespace-only note'
    );

    // Closing with valid note succeeds
    const closed = await closeCashSession(tenantAId, owner, sess.id, { countedCash: 700, note: 'Shortage 127 tk in drawer' });
    assert(closed.status === 'CLOSED', 'Session is now CLOSED');
    eq(Number(closed.countedCash), 700, 'Counted cash is 700');
    eq(Number(closed.expectedCash), 827, 'Expected cash is 827');
    eq(Number(closed.difference), -127, 'Difference is -127 (Shortage)');
    assert(closed.note === 'Shortage 127 tk in drawer', 'Discrepancy note saved');
    ok('Test 30: Cash session closed with discrepancy and explanatory note');

    // Duplicate close must fail
    await expectError(
      () => closeCashSession(tenantAId, owner, sess.id, { countedCash: 700, note: 'Again' }),
      'CASH_SESSION_ALREADY_CLOSED',
      'Test 31: Duplicate closure attempt is rejected'
    );

    console.log('--- Phase 15.2: Closed Session Immutability across Payments, Refunds & Expenses');
    // 1. Payment creation with CASH on closed session date -> rejected
    const invoiceForCash = await prisma.feeInvoice.create({
      data: { coachingCenterId: tenantAId, branchId: b1.id, studentId: s1.id, invoiceNumber: `${TAG}-ICLOSED`, totalAmount: 1000, dueAmount: 1000, paidAmount: 0, status: 'ISSUED' },
    });
    await expectError(
      () => createPayment(tenantAId, invoiceForCash.id, { amount: 100, paymentMethod: 'CASH', paymentDate: today }, owner.userId),
      'CASH_SESSION_CLOSED',
      'Test 32: CASH payment creation rejected when session is closed'
    );

    // 2. Payment creation with non-cash (BKASH) on the same date -> succeeds
    const bkashPayment = await createPayment(tenantAId, invoiceForCash.id, { amount: 100, paymentMethod: 'BKASH', paymentDate: today }, owner.userId);
    assert(bkashPayment.payment.id, 'BKASH payment created successfully');
    ok('Test 33: Non-cash payment succeeds on a closed cash session date');

    // 3. Cash refund on closed session date -> rejected
    // Create a cash payment in B1 on a previous date where session wasn't closed
    const oldCashPayment = await pay('b1', 'CASH', 200, dhaka('2026-03-01'));
    await expectError(
      () => refundPayment(tenantAId, oldCashPayment.id, { amount: 50, reason: 'Test refund on closed drawer' }, owner.userId),
      'CASH_SESSION_CLOSED',
      'Test 34: CASH refund rejected because today\'s drawer is closed'
    );

    // 4. Expense creation with CASH on closed session date -> rejected
    await expectError(
      () => createExpense(tenantAId, owner, { branchId: b1.id, categoryId: rent.id, amount: 100, paymentMethod: 'CASH', date: today, paidTo: 'Landlord' }),
      'CASH_SESSION_CLOSED',
      'Test 35: CASH expense creation rejected when session is closed'
    );

    // 5. Expense creation with BANK on the same date -> succeeds
    const bankExp = await createExpense(tenantAId, owner, { branchId: b1.id, categoryId: rent.id, amount: 100, paymentMethod: 'BANK', date: today, paidTo: 'Landlord' });
    assert(bankExp.expense.id, 'BANK expense created successfully');
    ok('Test 36: Non-cash expense succeeds on a closed cash session date');

    // 6. Expense cancellation for a CASH expense on that closed date -> rejected
    const activeTodayCashExp = await prisma.expense.findFirstOrThrow({
      where: { coachingCenterId: tenantAId, branchId: b1.id, paymentMethod: 'CASH', date: toDateOnly(today), status: 'ACTIVE' },
    });
    await expectError(
      () => cancelExpense(tenantAId, owner, activeTodayCashExp.id, { reason: 'Try cancelling cash expense after session closed' }),
      'CASH_SESSION_CLOSED',
      'Test 37: CASH expense cancellation rejected when cash session is closed'
    );

    // 7. Cash operations for branch b2 (which has no closed session) -> succeeds
    const b2CashExp = await createExpense(tenantAId, owner, { branchId: b2.id, categoryId: util.id, amount: 50, paymentMethod: 'CASH', date: today, paidTo: 'Electrician' });
    assert(b2CashExp.expense.id, 'B2 CASH expense created');
    ok('Test 38: Cash operations for other branches without closed sessions remain unaffected');

    console.log(`\n${passed} checks passed.`);
  } finally {
    if (tenantAId) await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch((e) => console.error('cleanup A failed', e?.message));
    if (tenantBId) await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch((e) => console.error('cleanup B failed', e?.message));
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
