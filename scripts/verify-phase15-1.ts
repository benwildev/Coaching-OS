import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import {
  createExpense,
  updateExpense,
  cancelExpense,
  listExpenses,
  getExpenseDetail,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
} from '../lib/services/expense.service';
import { recordSalaryPayment, generateSalary } from '../lib/services/salary.service';
import { createCompensation } from '../lib/services/compensation.service';
import { openCashSession, computeExpectedCash, getCashExpensesForDate, closeCashSession } from '../lib/services/cash-session.service';
import { getFinanceOverview, resolveFinanceScope } from '../lib/services/finance-overview.service';
import { getCurrentDhakaDateString, toDateOnly } from '../lib/schedule';
import { defaultPermissionsFor } from '../lib/auth/permissions';
import type { SessionUser } from '../lib/auth/session';

const TAG = `P151-${Date.now()}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ [${passed.toString().padStart(2, '0')}] ${label}`);
}

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
  throw new Error(`FAIL: ${label} (expected error "${expected}", but call succeeded)`);
}

async function main() {
  console.log('\n==================================================');
  console.log('Phase 15.1 — Expense Management Verification');
  console.log('==================================================\n');

  let tenantAId = '';
  let tenantBId = '';

  try {
    const stamp = Date.now().toString().slice(-5);
    const mkSetup = (letter: string, phonePrefix: string) =>
      completeInitialSetup({
        centerName: `Center ${letter} ${TAG}`,
        centerCode: `T151${letter}${stamp}`,
        centerPhone: '01711000001',
        centerCity: 'Dhaka',
        centerDistrict: 'Dhaka',
        ownerName: `Owner ${letter}`,
        ownerEmail: `owner-t151${letter}${stamp}@test.local`.toLowerCase(),
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

    const b1 = setupA.branch;
    const b2 = await prisma.branch.create({
      data: { coachingCenterId: tenantAId, name: 'Dhanmondi Branch', code: 'DHAN' },
    });

    const mkUser = (label: string, branchId: string | null, role: 'OWNER' | 'ADMIN' | 'STAFF' | 'TEACHER', cc = tenantAId) =>
      prisma.user.create({
        data: {
          coachingCenterId: cc,
          branchId,
          email: `${label}-${stamp}@test.local`,
          phone: `0161${Date.now().toString().slice(-7)}${label.length}`,
          name: label,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      });

    const staffRow = await mkUser('staff1', b1.id, 'STAFF');
    const teacherRow = await mkUser('teacher1', b1.id, 'TEACHER');

    const sessionUser = (
      role: 'OWNER' | 'ADMIN' | 'STAFF' | 'TEACHER',
      userId: string,
      branchId: string | null,
      cc = tenantAId
    ): SessionUser =>
      ({
        userId,
        coachingCenterId: cc,
        email: `${role}@t.local`,
        name: role,
        phone: null,
        banglaName: null,
        role,
        branchId,
        sessionVersion: 1,
        permissions: defaultPermissionsFor(role),
      } as any);

    const owner = sessionUser('OWNER', setupA.owner.id, null);
    const ownerB = sessionUser('OWNER', setupB.owner.id, null, tenantBId);
    const admin1 = sessionUser('ADMIN', owner.userId, b1.id); // locked to branch 1
    const admin2 = sessionUser('ADMIN', owner.userId, b2.id); // locked to branch 2
    const staff1 = sessionUser('STAFF', staffRow.id, b1.id);
    const teacher = sessionUser('TEACHER', teacherRow.id, b1.id);

    const today = getCurrentDhakaDateString();

    // Setup categories
    const catOffice = await createExpenseCategory(tenantAId, owner, {
      name: 'Office Rent',
      banglaName: 'অফিস ভাড়া',
    });
    const catUtility = await createExpenseCategory(tenantAId, owner, {
      name: 'Electricity & Utility',
      banglaName: 'বিদ্যুৎ বিল',
    });
    const catStationery = await createExpenseCategory(tenantAId, owner, {
      name: 'Stationery',
      banglaName: 'স্টেশনারি',
    });

    // -------------------------------------------------------------
    // Test 1: Create manual expense
    // -------------------------------------------------------------
    const created1 = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catOffice.id,
      amount: 12000,
      paymentMethod: 'BANK',
      date: today,
      paidTo: 'Landlord Mr. Kabir',
      invoiceNo: 'RENT-OCT-2026',
      notes: 'Monthly office rent for Main branch',
    });
    assert(created1.expense.id, 'Created expense must have an ID');
    assert(created1.expense.amount === 12000, 'Amount must match 12000');
    assert(created1.expense.status === 'ACTIVE', 'New expense must be ACTIVE');
    ok('1. Create manual expense');

    // -------------------------------------------------------------
    // Test 2: Edit manual expense
    // -------------------------------------------------------------
    const edited1 = await updateExpense(tenantAId, owner, created1.expense.id, {
      amount: 12500,
      notes: 'Rent + maintenance charge',
    });
    assert(edited1.amount === 12500, 'Edited amount must be 12500');
    assert(edited1.notes === 'Rent + maintenance charge', 'Edited notes must match');
    ok('2. Edit manual expense');

    // -------------------------------------------------------------
    // Test 3: Cancel manual expense
    // -------------------------------------------------------------
    const expToCancel = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catUtility.id,
      amount: 3500,
      paymentMethod: 'BKASH',
      date: today,
      paidTo: 'DESCO',
    });
    const cancelRes = await cancelExpense(tenantAId, owner, expToCancel.expense.id, {
      reason: 'Wrong billing account number entered',
    });
    assert(cancelRes.success === true, 'Cancel must succeed');
    const cancelledDetail = await getExpenseDetail(tenantAId, owner, expToCancel.expense.id);
    assert(cancelledDetail.status === 'CANCELLED', 'Status must be CANCELLED');
    assert(cancelledDetail.cancelReason === 'Wrong billing account number entered', 'Cancel reason must be stored');
    assert(cancelledDetail.cancelledAt !== null, 'CancelledAt must be set');
    ok('3. Cancel manual expense');

    // -------------------------------------------------------------
    // Test 4: Cancel requires reason (min 3 chars)
    // -------------------------------------------------------------
    const expToCancel2 = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catStationery.id,
      amount: 500,
      paymentMethod: 'CASH',
      date: today,
    });
    await expectError(
      () => cancelExpense(tenantAId, owner, expToCancel2.expense.id, { reason: '  ' }),
      'INVALID_CANCEL_REASON',
      '4. Cancel requires reason (empty rejected)'
    );

    // -------------------------------------------------------------
    // Test 5: Cancelled expense excluded from totals
    // -------------------------------------------------------------
    const expActive = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catStationery.id,
      amount: 1500,
      paymentMethod: 'CASH',
      date: today,
    });
    const listRes = await listExpenses(tenantAId, owner, {
      branchId: b1.id,
      dateFrom: today,
      dateTo: today,
    });
    // Expected active total on branch 1 for today: 12500 (rent) + 500 (expToCancel2) + 1500 (stationery) = 14500
    // The cancelled utility 3500 MUST be excluded!
    assert(
      listRes.summary.totalExpenses === 14500,
      `Operational total must exclude cancelled expense (expected 14500, got ${listRes.summary.totalExpenses})`
    );
    ok('5. Cancelled expense excluded from totals');

    // -------------------------------------------------------------
    // Test 6: Cancelled expense excluded from cash
    // -------------------------------------------------------------
    // Cancel the 500 cash expense
    await cancelExpense(tenantAId, owner, expToCancel2.expense.id, {
      reason: 'Duplicate voucher entered',
    });
    const cashExpensesToday = await getCashExpensesForDate(tenantAId, b1.id, toDateOnly(today));
    // Only expActive (1500) remains active cash expense
    assert(cashExpensesToday === 1500, `Expected 1500 cash expense, got ${cashExpensesToday}`);
    ok('6. Cancelled expense excluded from cash');

    // -------------------------------------------------------------
    // Test 7: Salary expense counted once
    // -------------------------------------------------------------
    // Create teacher, compensation, period, payable, and pay via salary workflow
    const teacherProfile = await prisma.teacher.create({
      data: {
        coachingCenterId: tenantAId,
        branchId: b1.id,
        teacherCode: `${TAG}-T1`,
        name: 'Master Teacher Rahman',
        phone: `01799${Date.now().toString().slice(-6)}`,
        status: 'ACTIVE',
      },
    });
    const t = getCurrentDhakaDateString();
    const lm = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, 1));
    const P = { year: lm.getUTCFullYear(), month: lm.getUTCMonth() + 1 };
    await createCompensation(tenantAId, owner, teacherProfile.id, {
      type: 'MONTHLY_FIXED',
      amount: 25000,
      effectiveFrom: '2026-01-01',
    });
    await generateSalary(tenantAId, owner, { ...P, branchId: b1.id });
    const payable = await prisma.salaryPayable.findFirstOrThrow({
      where: { coachingCenterId: tenantAId, teacherId: teacherProfile.id },
    });
    const salaryPayResult = await recordSalaryPayment(tenantAId, owner, payable.id, {
      amount: 20000,
      paymentMethod: 'BANK',
      paymentDate: today,
    });
    assert(salaryPayResult.payment.expenseId, 'Salary payment must have linked expenseId');

    // Verify linked expense exists and has salaryPayment relation
    const salaryExp = await prisma.expense.findUniqueOrThrow({
      where: { id: salaryPayResult.payment.expenseId! },
      include: { salaryPayment: true, category: true },
    });
    assert(salaryExp.salaryPayment !== null, 'Salary expense must link to salaryPayment');
    assert(salaryExp.status === 'ACTIVE', 'Salary expense must be ACTIVE');
    assert(salaryExp.category.code === 'TEACHER_SALARY', 'Category must be TEACHER_SALARY');

    // Verify listExpenses counts it properly and identifies as salary
    const expListWithSalary = await listExpenses(tenantAId, owner, {
      branchId: b1.id,
      dateFrom: today,
      dateTo: today,
    });
    const foundSalary = expListWithSalary.items.find((item) => item.id === salaryExp.id);
    assert(foundSalary !== undefined, 'Salary expense must appear in expenses list');
    assert(foundSalary.isSalary === true, 'Salary expense must be tagged isSalary=true');
    // Operational total must include 12500 + 1500 + 20000 = 34000
    assert(
      expListWithSalary.summary.totalExpenses === 34000,
      `Total must be 34000 including salary once, got ${expListWithSalary.summary.totalExpenses}`
    );
    ok('7. Salary expense counted once');

    // -------------------------------------------------------------
    // Test 8: Salary expense cannot be manually cancelled or edited
    // -------------------------------------------------------------
    await expectError(
      () => cancelExpense(tenantAId, owner, salaryExp.id, { reason: 'Accidental salary' }),
      'SALARY_LINKED_IMMUTABLE',
      '8a. Salary expense cannot be manually cancelled'
    );
    await expectError(
      () => updateExpense(tenantAId, owner, salaryExp.id, { amount: 15000 }),
      'SALARY_LINKED_IMMUTABLE',
      '8b. Salary expense cannot be manually edited'
    );

    // -------------------------------------------------------------
    // Test 9: Branch isolation
    // -------------------------------------------------------------
    // admin1 is locked to b1; cannot create an expense for b2
    await expectError(
      () =>
        createExpense(tenantAId, admin1, {
          branchId: b2.id,
          categoryId: catOffice.id,
          amount: 5000,
          paymentMethod: 'CASH',
          date: today,
        }),
      'FORBIDDEN_BRANCH',
      '9a. Branch-locked admin cannot create expense in other branch'
    );
    // Create an expense in b2 by owner
    const b2Exp = await createExpense(tenantAId, owner, {
      branchId: b2.id,
      categoryId: catOffice.id,
      amount: 7000,
      paymentMethod: 'BANK',
      date: today,
    });
    // admin1 cannot access b2's expense details
    await expectError(
      () => getExpenseDetail(tenantAId, admin1, b2Exp.expense.id),
      'FORBIDDEN_BRANCH',
      '9b. Branch-locked admin cannot view other branch expense'
    );
    // admin1 cannot cancel b2's expense
    await expectError(
      () => cancelExpense(tenantAId, admin1, b2Exp.expense.id, { reason: 'Testing cross branch' }),
      'FORBIDDEN_BRANCH',
      '9c. Branch-locked admin cannot cancel other branch expense'
    );

    // -------------------------------------------------------------
    // Test 10: Tenant isolation
    // -------------------------------------------------------------
    await expectError(
      () => getExpenseDetail(tenantAId, ownerB, created1.expense.id),
      'EXPENSE_NOT_FOUND',
      '10a. Tenant B cannot view Tenant A expense'
    );
    await expectError(
      () => cancelExpense(tenantAId, ownerB, created1.expense.id, { reason: 'Cross tenant attack' }),
      'EXPENSE_NOT_FOUND',
      '10b. Tenant B cannot cancel Tenant A expense'
    );

    // -------------------------------------------------------------
    // Test 11: Permission enforcement (TEACHER has no expense access)
    // -------------------------------------------------------------
    await expectError(
      () => listExpenses(tenantAId, teacher, {}),
      'EXPENSE_ACCESS_DENIED',
      '11a. Teacher cannot list expenses'
    );
    await expectError(
      () =>
        createExpense(tenantAId, teacher, {
          branchId: b1.id,
          categoryId: catOffice.id,
          amount: 100,
          paymentMethod: 'CASH',
          date: today,
        }),
      'EXPENSE_ACCESS_DENIED',
      '11b. Teacher cannot create expense'
    );

    // -------------------------------------------------------------
    // Test 12: Category isolation
    // -------------------------------------------------------------
    const catTenantB = await createExpenseCategory(tenantBId, ownerB, {
      name: 'Tenant B Exclusive Category',
    });
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catTenantB.id,
          amount: 2000,
          paymentMethod: 'CASH',
          date: today,
        }),
      'CATEGORY_NOT_FOUND',
      '12. Cross-tenant category usage rejected'
    );

    // -------------------------------------------------------------
    // Test 13: Inactive category rejected
    // -------------------------------------------------------------
    const catToDeactivate = await createExpenseCategory(tenantAId, owner, {
      name: 'Old Event Promo',
    });
    await updateExpenseCategory(tenantAId, owner, catToDeactivate.id, {
      isActive: false,
    });
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catToDeactivate.id,
          amount: 1000,
          paymentMethod: 'CASH',
          date: today,
        }),
      'CATEGORY_INACTIVE',
      '13. Inactive category rejected on creation'
    );

    // -------------------------------------------------------------
    // Test 14: Future date rejected
    // -------------------------------------------------------------
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    const tomorrow = d.toISOString().slice(0, 10);
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catOffice.id,
          amount: 1000,
          paymentMethod: 'CASH',
          date: tomorrow,
        }),
      'INVALID_EXPENSE_DATE',
      '14. Future date rejected'
    );

    // -------------------------------------------------------------
    // Test 15: Amount > 0
    // -------------------------------------------------------------
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catOffice.id,
          amount: 0,
          paymentMethod: 'CASH',
          date: today,
        }),
      'INVALID_AMOUNT',
      '15a. Zero amount rejected'
    );
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catOffice.id,
          amount: -500,
          paymentMethod: 'CASH',
          date: today,
        }),
      'INVALID_AMOUNT',
      '15b. Negative amount rejected'
    );

    // -------------------------------------------------------------
    // Test 16: Duplicate submission / idempotency
    // -------------------------------------------------------------
    const idemKey = `test_idem_${Date.now()}`;
    const firstSubmit = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catOffice.id,
      amount: 4200,
      paymentMethod: 'BKASH',
      date: today,
      idempotencyKey: idemKey,
    });
    assert(firstSubmit.idempotentReplay === false, 'First submission must not be replay');

    // Immediate second submission with identical key
    const secondSubmit = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catOffice.id,
      amount: 4200,
      paymentMethod: 'BKASH',
      date: today,
      idempotencyKey: idemKey,
    });
    assert(secondSubmit.idempotentReplay === true, 'Duplicate submission must be replay');
    assert(secondSubmit.expense.id === firstSubmit.expense.id, 'Duplicate submission must return original expense ID');

    // Confirm DB only has 1 record
    const countWithIdem = await prisma.expense.count({
      where: { coachingCenterId: tenantAId, idempotencyKey: idemKey },
    });
    assert(countWithIdem === 1, 'Only one record must exist in DB for idempotency key');
    ok('16. Duplicate submission / idempotency protection');

    // -------------------------------------------------------------
    // Test 17: Audit created
    // -------------------------------------------------------------
    const auditEvents = await prisma.auditLog.findMany({
      where: { coachingCenterId: tenantAId, entity: 'Expense' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const actions = auditEvents.map((a) => a.action);
    assert(actions.includes('EXPENSE_CREATED'), 'EXPENSE_CREATED audit log must exist');
    assert(actions.includes('EXPENSE_UPDATED'), 'EXPENSE_UPDATED audit log must exist');
    assert(actions.includes('EXPENSE_CANCELLED'), 'EXPENSE_CANCELLED audit log must exist');
    ok('17. Audit logs recorded for create, update, and cancel');

    // -------------------------------------------------------------
    // Test 18: Audit rollback when transaction fails
    // -------------------------------------------------------------
    const initialAuditCount = await prisma.auditLog.count({
      where: { coachingCenterId: tenantAId },
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            coachingCenterId: tenantAId,
            action: 'EXPENSE_TEST_FAIL',
            entity: 'Expense',
          },
        });
        // Intentionally throw inside transaction
        throw new Error('INTENTIONAL_TX_ROLLBACK');
      });
    } catch {
      // expected
    }
    const postRollbackCount = await prisma.auditLog.count({
      where: { coachingCenterId: tenantAId },
    });
    assert(postRollbackCount === initialAuditCount, 'Audit record must roll back if transaction fails');
    ok('18. Audit rollback when transaction fails');

    // -------------------------------------------------------------
    // Test 19: Finance Overview reflects new expense
    // -------------------------------------------------------------
    const scope1 = await resolveFinanceScope(tenantAId, owner, b1.id);
    const overviewBefore = await getFinanceOverview(scope1, {
      from: today,
      to: today,
    });
    const expForOverview = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catOffice.id,
      amount: 3300,
      paymentMethod: 'CASH',
      date: today,
    });
    const overviewAfter = await getFinanceOverview(scope1, {
      from: today,
      to: today,
    });
    const diff = overviewAfter.expenses.total - overviewBefore.expenses.total;
    assert(
      Math.abs(diff - 3300) < 0.01,
      `Finance Overview expenses must increase by exactly 3300 (diff: ${diff})`
    );
    ok('19. Finance Overview reflects new expense');

    // -------------------------------------------------------------
    // Test 20: Cash payment affects expected cash correctly
    // -------------------------------------------------------------
    // Open cash session for b1 today with 5000 opening cash
    await openCashSession(tenantAId, owner, b1.id, 5000);
    const expectedCash1 = await computeExpectedCash(tenantAId, b1.id, toDateOnly(today), 5000);

    // Record 2000 cash expense
    const cashExp = await createExpense(tenantAId, owner, {
      branchId: b1.id,
      categoryId: catStationery.id,
      amount: 2000,
      paymentMethod: 'CASH',
      date: today,
    });
    const expectedCash2 = await computeExpectedCash(tenantAId, b1.id, toDateOnly(today), 5000);
    assert(
      expectedCash1 - expectedCash2 === 2000,
      `Expected cash must decrease by 2000 (was ${expectedCash1}, now ${expectedCash2})`
    );

    // Cancel the cash expense
    await cancelExpense(tenantAId, owner, cashExp.expense.id, {
      reason: 'Cancelled cash stationery expense',
    });
    const expectedCash3 = await computeExpectedCash(tenantAId, b1.id, toDateOnly(today), 5000);
    assert(
      expectedCash3 === expectedCash1,
      `Expected cash must restore after cancellation (was ${expectedCash3}, expected ${expectedCash1})`
    );
    ok('20. Cash payment affects expected cash and cancellation restores it');

    // -------------------------------------------------------------
    // Test 21: Category Safety (Delete blocked when expenses exist)
    // -------------------------------------------------------------
    await expectError(
      () => deleteExpenseCategory(tenantAId, owner, catOffice.id),
      'CATEGORY_IN_USE',
      '21. Category with existing expenses cannot be deleted'
    );

    // Category with zero expenses can be safely deleted
    const catEmpty = await createExpenseCategory(tenantAId, owner, {
      name: 'Temporary Empty Category',
    });
    await deleteExpenseCategory(tenantAId, owner, catEmpty.id);
    const catCheck = await prisma.expenseCategory.findUnique({ where: { id: catEmpty.id } });
    assert(catCheck === null, 'Empty category must be deleted');
    ok('22. Empty category can be deleted safely');

    // System category TEACHER_SALARY cannot be deleted or deactivated
    const systemSalaryCat = await prisma.expenseCategory.findFirstOrThrow({
      where: { coachingCenterId: tenantAId, code: 'TEACHER_SALARY' },
    });
    await expectError(
      () => deleteExpenseCategory(tenantAId, owner, systemSalaryCat.id),
      'SYSTEM_CATEGORY_PROTECTED',
      '23a. System category cannot be deleted'
    );
    await expectError(
      () => updateExpenseCategory(tenantAId, owner, systemSalaryCat.id, { isActive: false }),
      'SYSTEM_CATEGORY_PROTECTED',
      '23b. System category cannot be deactivated'
    );

    // -------------------------------------------------------------
    // Test 24: Closed cash session prevents cash expense mutation
    // -------------------------------------------------------------
    const session = await prisma.cashSession.findFirstOrThrow({
      where: { coachingCenterId: tenantAId, branchId: b1.id, businessDate: toDateOnly(today) },
    });
    await closeCashSession(tenantAId, owner, session.id, {
      countedCash: expectedCash3,
      note: 'Normal closing',
    });
    await expectError(
      () =>
        createExpense(tenantAId, owner, {
          branchId: b1.id,
          categoryId: catOffice.id,
          amount: 500,
          paymentMethod: 'CASH',
          date: today,
        }),
      'CASH_SESSION_CLOSED',
      '24. Closed cash session blocks new cash expense'
    );

    console.log(`\n==================================================`);
    console.log(`ALL TESTS PASSED! (${passed} checks verified)`);
    console.log(`==================================================\n`);
  } finally {
    // Cleanup test tenants
    if (tenantAId) {
      await prisma.coachingCenter.delete({ where: { id: tenantAId } }).catch(() => null);
    }
    if (tenantBId) {
      await prisma.coachingCenter.delete({ where: { id: tenantBId } }).catch(() => null);
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:\n', err);
  process.exit(1);
});
