import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import {
  allocateAdjustments,
  buildPricingLines,
  computePricingTotals,
  validateInstallments,
} from '../lib/course-pricing';

/**
 * Phase 11.2 — Course-Centric Fee & Payment Plan verification.
 *
 * Runs against a live dev/prod server (AUTH_BASE_URL, default localhost:3000)
 * and the real database, in throwaway tenants that are deleted afterwards.
 * Pure-logic checks (pricing math) run first without the server.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P112-${Date.now()}`;
const PW = 'ValidPass123!';
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ [${passed}] ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

const eq = (a: unknown, b: unknown, label: string) =>
  assert(Number(a) === Number(b), `${label} — expected ${b}, got ${a}`);

interface Resp {
  status: number;
  body: Record<string, any>;
  cookies: Record<string, { value: string }>;
}

async function request(method: string, path: string, opts: { payload?: unknown; cookie?: string } = {}): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.payload !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { _text: text.slice(0, 300) };
  }
  const cookies: Resp['cookies'] = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = { value: pair.slice(i + 1) };
  }
  return { status: res.status, body, cookies };
}

const post = (path: string, payload: unknown, cookie?: string) => request('POST', path, { payload, cookie });
const put = (path: string, payload: unknown, cookie?: string) => request('PUT', path, { payload, cookie });
const get = (path: string, cookie?: string) => request('GET', path, { cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function tenant(code: string, name: string) {
  return completeInitialSetup({
    centerName: name,
    centerCode: code,
    centerPhone: '01700000000',
    centerCity: 'Dhaka',
    centerDistrict: 'Dhaka',
    ownerName: `${name} Owner`,
    ownerEmail: `${code.toLowerCase()}-owner@verify.local`,
    ownerPhone: `019${Date.now().toString().slice(-8)}`,
    ownerPassword: PW,
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

function pureLogicChecks() {
  const fees = [
    { id: 'a', name: 'Admission Fee', amount: 500, isRequired: true, isActive: true },
    { id: 'b', name: 'Exam Fee', amount: 1000, isRequired: true, isActive: true },
    { id: 'c', name: 'Study Material', amount: 300, isRequired: false, isActive: true },
    { id: 'd', name: 'Disabled Optional', amount: 999, isRequired: false, isActive: false },
  ];
  const t = computePricingTotals({ fee: 12000, additionalFees: fees });
  eq(t.requiredTotal, 13500, 'required total');
  eq(t.optionalAdditional, 300, 'optional total (disabled fee excluded)');
  eq(t.potentialTotal, 13800, 'potential total');
  ok('P1. Course total = Course Fee + required fees; optional shown separately (disabled optional excluded)');

  const cfg = { fee: 12000, billingType: 'ONE_TIME' as const, additionalFees: fees, installments: [] };
  eq(buildPricingLines(cfg, []).length, 3, 'default lines exclude optional');
  eq(buildPricingLines(cfg, ['c']).length, 4, 'selected optional included');
  eq(buildPricingLines(cfg, ['d']).length, 3, 'disabled optional cannot be selected in');
  ok('P2. Optional fees are only included when chosen (never treated as mandatory)');

  assert(validateInstallments(12000, [
    { name: 'A', amount: 4000, dueAfterDays: 0 },
    { name: 'B', amount: 4000, dueAfterDays: 30 },
    { name: 'C', amount: 4000, dueAfterDays: 60 },
  ]) === null, 'valid installments');
  assert(validateInstallments(12000, [
    { name: 'A', amount: 4000, dueAfterDays: 0 },
    { name: 'B', amount: 4000, dueAfterDays: 30 },
    { name: 'C', amount: 3999.99, dueAfterDays: 60 },
  ]) === 'INSTALLMENTS_MUST_EQUAL_COURSE_FEE', 'unbalanced installments rejected');
  assert(validateInstallments(0.3, [
    { name: 'A', amount: 0.1, dueAfterDays: 0 },
    { name: 'B', amount: 0.2, dueAfterDays: 0 },
  ]) === null, 'paisa-exact (0.1 + 0.2 = 0.3)');
  ok('P3. Installment totals must equal the Course Fee (paisa-exact)');

  const lines = buildPricingLines(cfg, ['c']);
  const alloc = allocateAdjustments(lines, 12500, 500);
  eq(alloc.reduce((s, l) => s + l.discountAmount, 0), 12500, 'discount fully allocated');
  eq(alloc.reduce((s, l) => s + l.waiverAmount, 0), 500, 'waiver fully allocated');
  eq(alloc.reduce((s, l) => s + l.finalAmount, 0), 800, 'final = 13800 - 12500 - 500');
  let threw = false;
  try { allocateAdjustments(lines, 13800, 1); } catch { threw = true; }
  assert(threw, 'discount+waiver above total rejected');
  ok('P4. Discount/waiver waterfall is exact and rejects over-deduction');
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 11.2 COURSE PRICING VERIFICATION — ${BASE}`);
  console.log('========================================================');

  pureLogicChecks();

  let centerAId: string | null = null;
  let centerBId: string | null = null;
  let phoneSeq = 0;
  const nextPhone = () => `0181${String(2000000 + ++phoneSeq + (Date.now() % 100000))}`;

  try {
    const codeA = `T112A${Date.now().toString().slice(-6)}`;
    const codeB = `T112B${Date.now().toString().slice(-6)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerAId = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerBId = b.center.id;
    const ccA = a.center.id;
    const ccB = b.center.id;
    const branchA1 = a.branch;

    const branchA2 = await prisma.branch.create({
      data: { coachingCenterId: ccA, name: 'Dhanmondi Branch', code: `DHN-${Date.now().toString().slice(-4)}`, phone: '01711111111' },
    });

    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: ccA } });
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER', branchId: string) =>
      prisma.user.create({
        data: {
          coachingCenterId: ccA,
          branchId,
          email,
          passwordHash: hashPassword(PW),
          name: `${TAG} ${email}`,
          roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId } },
        },
      });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const admin = await mkUser(e('admin'), 'ADMIN', branchA1.id);
    const staff = await mkUser(e('staff'), 'STAFF', branchA1.id);
    const staffB2 = await mkUser(e('staff2'), 'STAFF', branchA2.id);
    const teacher = await mkUser(e('teacher'), 'TEACHER', branchA1.id);

    const session = await prisma.academicSession.findFirstOrThrow({ where: { coachingCenterId: ccA } });
    const program = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccA, code: 'SSC' } });
    const klass = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccA, academicProgramId: program.id } });

    // Course with NO pricing yet (fee 0) + a legacy priced course + tenant B course.
    const course = await prisma.course.create({
      data: { coachingCenterId: ccA, academicProgramId: program.id, academicClassId: klass.id, name: 'IELTS Foundation', code: `IELTS-${Date.now().toString().slice(-4)}` },
    });
    const legacyCourse = await prisma.course.create({
      data: { coachingCenterId: ccA, academicProgramId: program.id, academicClassId: klass.id, name: 'Legacy Math', code: `LEG-${Date.now().toString().slice(-4)}`, fee: 8000 },
    });
    const progB = await prisma.academicProgram.findFirstOrThrow({ where: { coachingCenterId: ccB } });
    const classB = await prisma.academicClass.findFirstOrThrow({ where: { coachingCenterId: ccB, academicProgramId: progB.id } });
    const courseB = await prisma.course.create({
      data: { coachingCenterId: ccB, academicProgramId: progB.id, academicClassId: classB.id, name: 'Tenant B Course', code: `B-${Date.now().toString().slice(-4)}`, fee: 5000 },
    });

    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const adminCookie = cookieOf(await login(admin.email, PW), SESSION_COOKIE_NAME);
    const staffCookie = cookieOf(await login(staff.email, PW), SESSION_COOKIE_NAME);
    const staffB2Cookie = cookieOf(await login(staffB2.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacher.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);

    const admission = (over: Record<string, unknown> = {}) => ({
      name: `Student ${Math.random().toString(36).slice(2, 7)}`,
      gender: 'MALE',
      dob: '2008-05-15',
      guardianName: 'Md Guardian',
      guardianRelationship: 'FATHER',
      guardianPhone: nextPhone(),
      preferredChannel: 'SMS',
      academicSessionId: session.id,
      branchId: branchA1.id,
      academicProgramId: program.id,
      academicClassId: klass.id,
      courseId: course.id,
      feeDueDate: '2026-12-31',
      ...over,
    });

    console.log('Setup finished. Beginning scenarios...');

    // ---------------- Course pricing configuration ----------------
    const notConfigured = await post('/api/students', admission({ useCoursePricing: true }), ownerCookie);
    assert(notConfigured.status === 400 && notConfigured.body.error === 'COURSE_PRICING_NOT_CONFIGURED', `unpriced course must not admit with pricing, got ${notConfigured.status} ${JSON.stringify(notConfigured.body)}`);
    ok('1. Course with no pricing rejects useCoursePricing (no guessing, no silent zero fee)');

    const plan = {
      fee: 12000,
      billingType: 'ONE_TIME',
      additionalFees: [
        { name: 'Admission Fee', banglaName: 'ভর্তি ফি', amount: 500, isRequired: true, isActive: true },
        { name: 'Exam Fee', amount: 1000, isRequired: true, isActive: true },
        { name: 'Study Material', amount: 300, isRequired: false, isActive: true },
      ],
      installments: [],
    };
    const setPlan = await put(`/api/courses/${course.id}/pricing`, plan, ownerCookie);
    assert(setPlan.status === 200 && setPlan.body.success, `OWNER set pricing failed: ${JSON.stringify(setPlan.body)}`);
    const pricing = setPlan.body.pricing;
    eq(pricing.fee, 12000, 'course fee saved');
    eq(pricing.additionalFees.length, 3, 'additional fees saved');
    eq(pricing.totals.requiredTotal, 13500, 'API required total');
    eq(pricing.totals.optionalAdditional, 300, 'API optional total');
    eq(pricing.totals.potentialTotal, 13800, 'API potential total');
    ok('2. Course can have a base fee + additional fee line items; required/optional/potential totals correct');

    const feeId = (n: string) => pricing.additionalFees.find((f: any) => f.name === n).id as string;

    const opts = await get('/api/academic/options', ownerCookie);
    const optCourse = opts.body.courses?.find((c: any) => c.id === course.id);
    assert(optCourse && optCourse.fee === 12000 && optCourse.feeItems.length === 3, 'admission options expose course pricing');
    ok('3. Admission options expose the course pricing for the wizard fee step');

    // ---------------- Authorization ----------------
    // Existing lines are always re-sent with their ids (as the UI does) so they are updated in place, not recreated.
    const adminPut = await put(`/api/courses/${course.id}/pricing`, { ...plan, additionalFees: pricing.additionalFees }, adminCookie);
    assert(adminPut.status === 200, `ADMIN may manage pricing, got ${adminPut.status}`);
    const staffPut = await put(`/api/courses/${course.id}/pricing`, plan, staffCookie);
    assert(staffPut.status === 403, `STAFF must not change pricing, got ${staffPut.status}`);
    const staffGet = await get(`/api/courses/${course.id}/pricing`, staffCookie);
    assert(staffGet.status === 200, `STAFF may read pricing, got ${staffGet.status}`);
    const teacherPut = await put(`/api/courses/${course.id}/pricing`, plan, teacherCookie);
    const teacherGet = await get(`/api/courses/${course.id}/pricing`, teacherCookie);
    assert(teacherPut.status === 403 && teacherGet.status === 403, `TEACHER blocked, got ${teacherPut.status}/${teacherGet.status}`);
    const anonPut = await put(`/api/courses/${course.id}/pricing`, plan);
    assert(anonPut.status === 401, `anonymous blocked, got ${anonPut.status}`);
    ok('4. OWNER + ADMIN manage pricing; STAFF read-only; TEACHER and anonymous blocked');

    // ---------------- Tenant isolation ----------------
    const xGet = await get(`/api/courses/${courseB.id}/pricing`, ownerCookie);
    const xPut = await put(`/api/courses/${courseB.id}/pricing`, plan, ownerCookie);
    assert(xGet.status === 404 && xPut.status === 404, `cross-tenant pricing must 404, got ${xGet.status}/${xPut.status}`);
    const bAfter = await prisma.course.findUniqueOrThrow({ where: { id: courseB.id } });
    eq(bAfter.fee, 5000, 'tenant B course untouched');
    const foreignItem = await put(`/api/courses/${course.id}/pricing`, { ...plan, additionalFees: [{ id: '00000000-0000-0000-0000-000000000000', name: 'X', amount: 1, isRequired: true, isActive: true }] }, ownerCookie);
    assert(foreignItem.status === 404, `foreign/unknown fee item id rejected, got ${foreignItem.status}`);
    const bView = await get(`/api/courses/${course.id}/pricing`, ownerBCookie);
    assert(bView.status === 404, `tenant B cannot read tenant A pricing, got ${bView.status}`);
    const xAdmit = await post('/api/students', admission({ courseId: courseB.id, useCoursePricing: true }), ownerCookie);
    assert(xAdmit.status >= 400, `admitting into another tenant's course with pricing must fail, got ${xAdmit.status}`);
    ok('5. Tenant isolation: cannot read/price/admit against another tenant\'s course; foreign fee-item ids rejected');

    // ---------------- Admission with course pricing ----------------
    const idemKey = `PAY-${TAG}`;
    const s1Payload = admission({
      name: 'Rahim Ahmed',
      useCoursePricing: true,
      optionalFeeIds: [feeId('Study Material')],
      feeAmount: 20000, // hostile client amount — must be ignored
      discountAmount: 1000,
      discountReason: 'Merit scholarship',
      initialPayment: { amount: 5000, paymentMethod: 'CASH', idempotencyKey: idemKey },
    });
    const s1 = await post('/api/students', s1Payload, ownerCookie);
    assert(s1.status === 201, `pricing admission failed ${s1.status}: ${JSON.stringify(s1.body)}`);
    const inv1 = s1.body.invoice;
    eq(inv1.subtotalAmount, 13800, 'invoice subtotal (course fee + 2 required + chosen optional)');
    eq(inv1.discountAmount, 1000, 'invoice discount');
    eq(inv1.totalAmount, 12800, 'amount payable');
    eq(inv1.paidAmount, 5000, 'paid');
    eq(inv1.dueAmount, 7800, 'due');
    const s1Id = s1.body.student.id as string;
    const s1Assign = await prisma.studentFeeAssignment.findMany({ where: { studentId: s1Id }, orderBy: { createdAt: 'asc' } });
    eq(s1Assign.length, 4, 'one assignment per fee line');
    eq(s1Assign.reduce((s, x) => s + Number(x.finalAmount), 0), 12800, 'assignments sum to payable');
    assert(s1Assign.every((x) => x.courseId === course.id), 'assignments trace to the course');
    const disc = await prisma.feeDiscount.findMany({ where: { studentFeeAssignment: { studentId: s1Id } } });
    eq(disc.reduce((s, x) => s + Number(x.amount), 0), 1000, 'discount history recorded');
    assert(disc.every((d) => d.type === 'DISCOUNT'), 'discount typed DISCOUNT');
    const byName1 = (n: string) => s1Assign.find((x) => x.name === n)!;
    assert(byName1('Course Fee').status === 'PARTIAL' && byName1('Exam Fee').status === 'PENDING', `payment mirrored on lines in order: ${s1Assign.map((x) => `${x.name}:${x.status}`)}`);
    eq(byName1('Course Fee').finalAmount, 11000, 'discount taken off the first line (waterfall)');
    assert(s1.body.receiptNumber, 'receipt number issued');
    ok('6. Admission auto-applies course pricing: ৳13,800 − ৳1,000 discount = ৳12,800; paid ৳5,000; due ৳7,800 (client amount ignored)');

    // Optional not chosen -> not charged; invalid optional id -> rollback
    const before = await prisma.student.count({ where: { coachingCenterId: ccA } });
    const s2 = await post('/api/students', admission({ useCoursePricing: true }), ownerCookie);
    assert(s2.status === 201, `admission without optional failed: ${JSON.stringify(s2.body)}`);
    eq(s2.body.invoice.totalAmount, 13500, 'optional fee not charged unless chosen');
    const bad = await post('/api/students', admission({ useCoursePricing: true, optionalFeeIds: ['nope'] }), ownerCookie);
    assert(bad.status === 400 && bad.body.error === 'INVALID_OPTIONAL_FEE', `invalid optional rejected: ${bad.status} ${JSON.stringify(bad.body)}`);
    const requiredAsOptional = await post('/api/students', admission({ useCoursePricing: true, optionalFeeIds: [feeId('Exam Fee')] }), ownerCookie);
    assert(requiredAsOptional.status === 400, 'a required fee id cannot be passed as an optional selection');
    eq(await prisma.student.count({ where: { coachingCenterId: ccA } }), before + 1, 'failed admissions rolled back completely (no orphan students)');
    ok('7. Optional fees only when chosen; invalid/required-as-optional ids rejected with full rollback');

    // ---------------- Snapshot: price change must not touch existing students ----------------
    const snapBefore = {
      inv: await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv1.id } }),
      pay: await prisma.payment.findMany({ where: { invoiceId: inv1.id } }),
      assigns: await prisma.studentFeeAssignment.findMany({ where: { studentId: s1Id }, orderBy: { createdAt: 'asc' } }),
    };
    const raise = await put(`/api/courses/${course.id}/pricing`, { ...plan, fee: 15000, additionalFees: pricing.additionalFees.map((f: any) => ({ ...f, amount: f.name === 'Exam Fee' ? 1200 : f.amount })) }, ownerCookie);
    assert(raise.status === 200, `price change failed: ${JSON.stringify(raise.body)}`);
    const snapAfter = {
      inv: await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv1.id } }),
      pay: await prisma.payment.findMany({ where: { invoiceId: inv1.id } }),
      assigns: await prisma.studentFeeAssignment.findMany({ where: { studentId: s1Id }, orderBy: { createdAt: 'asc' } }),
    };
    eq(snapAfter.inv.totalAmount, snapBefore.inv.totalAmount, 'existing invoice total unchanged');
    eq(snapAfter.inv.dueAmount, snapBefore.inv.dueAmount, 'existing invoice due unchanged');
    eq(snapAfter.pay.length, snapBefore.pay.length, 'payments unchanged');
    const amts = (rows: { finalAmount: unknown }[]) => rows.map((x) => Number(x.finalAmount)).sort((m, n) => m - n).join(',');
    assert(amts(snapAfter.assigns) === amts(snapBefore.assigns), `existing assignments unchanged: ${amts(snapBefore.assigns)} vs ${amts(snapAfter.assigns)}`);
    ok('8. Raising the course fee 12,000 → 15,000 does not change existing students\' assignments, invoice or payments');

    const s3 = await post('/api/students', admission({ useCoursePricing: true }), ownerCookie);
    assert(s3.status === 201, `post-change admission failed: ${JSON.stringify(s3.body)}`);
    eq(s3.body.invoice.totalAmount, 16700, 'new student gets new pricing (15000 + 500 + 1200)');
    ok('9. New students receive the updated course pricing (৳16,700)');

    // ---------------- Waiver, staff pending approval, legacy path ----------------
    const s4 = await post('/api/students', admission({ useCoursePricing: true, waiverAmount: 500, discountReason: 'Hardship' }), ownerCookie);
    assert(s4.status === 201, `waiver admission failed: ${JSON.stringify(s4.body)}`);
    eq(s4.body.invoice.waiverAmount, 500, 'waiver applied by OWNER');
    eq(s4.body.invoice.totalAmount, 16200, 'total after waiver');
    const w = await prisma.feeDiscount.findMany({ where: { studentFeeAssignment: { studentId: s4.body.student.id } } });
    assert(w.length === 1 && w[0].type === 'WAIVER', 'waiver history recorded');
    ok('10. Existing waiver behaviour preserved on course-priced admission');

    const s5 = await post('/api/students', admission({ useCoursePricing: true, discountAmount: 2000, discountReason: 'Sibling' }), staffCookie);
    assert(s5.status === 201, `staff admission failed: ${JSON.stringify(s5.body)}`);
    eq(s5.body.invoice.totalAmount, 16700, 'STAFF discount is NOT applied silently');
    assert(s5.body.discountApproved === false, 'discount flagged pending');
    const pend = await prisma.feeDiscount.findMany({ where: { studentFeeAssignment: { studentId: s5.body.student.id } } });
    assert(pend.length === 1 && pend[0].reason.startsWith('[PENDING_APPROVAL'), 'pending request recorded once, not applied');
    const s5a = await post('/api/students', admission({ useCoursePricing: true, discountAmount: 1 }), adminCookie);
    eq(s5a.body.invoice.totalAmount, 16700, 'ADMIN discount also pending');
    ok('11. Discount approval workflow preserved: OWNER applies, STAFF/ADMIN stay pending');

    const legacy = await post('/api/students', admission({ courseId: legacyCourse.id, feeAmount: 8000, feeName: 'Legacy Fee' }), ownerCookie);
    assert(legacy.status === 201, `legacy admission failed: ${JSON.stringify(legacy.body)}`);
    eq(legacy.body.invoice.totalAmount, 8000, 'legacy single-fee admission unchanged');
    const legacyA = await prisma.studentFeeAssignment.findMany({ where: { studentId: legacy.body.student.id } });
    assert(legacyA.length === 1 && legacyA[0].courseId === null && legacyA[0].name === 'Legacy Fee', 'legacy path creates one untraced assignment');
    ok('12. Legacy admission (explicit feeAmount, no course pricing) behaves exactly as before');

    // ---------------- Retry / idempotency ----------------
    const counts = async () => ({
      students: await prisma.student.count({ where: { coachingCenterId: ccA } }),
      assigns: await prisma.studentFeeAssignment.count({ where: { coachingCenterId: ccA } }),
      invoices: await prisma.feeInvoice.count({ where: { coachingCenterId: ccA } }),
      payments: await prisma.payment.count({ where: { coachingCenterId: ccA } }),
    });
    const c0 = await counts();
    const retry = await post('/api/students', { ...s1Payload, name: 'Rahim Ahmed', guardianPhone: s1Payload.guardianPhone }, ownerCookie);
    assert(retry.status >= 400, `retrying an admission with the same payment key must be rejected, got ${retry.status}`);
    const c1 = await counts();
    assert(JSON.stringify(c0) === JSON.stringify(c1), `retry created records: ${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
    ok('13. Admission retry (same payment idempotency key) creates no duplicate student, assignments, invoice or payment');

    // ---------------- Payment engine / receipts / refunds / reports ----------------
    const payKey = `COLLECT-${TAG}`;
    const p1 = await post(`/api/fees/invoices/${inv1.id}/payments`, { amount: 3000, paymentMethod: 'BKASH', transactionId: `TX-${TAG}`, idempotencyKey: payKey }, staffCookie);
    assert(p1.status === 201, `collect payment failed: ${JSON.stringify(p1.body)}`);
    const p2 = await post(`/api/fees/invoices/${inv1.id}/payments`, { amount: 3000, paymentMethod: 'BKASH', transactionId: `TX-${TAG}`, idempotencyKey: payKey }, staffCookie);
    assert(p2.status === 201 && p2.body.idempotentReplay === true && p2.body.payment.id === p1.body.payment.id, 'idempotent replay returns the same payment');
    const invAfterPay = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv1.id } });
    eq(invAfterPay.paidAmount, 8000, 'paid = 5000 + 3000 (charged once)');
    eq(invAfterPay.dueAmount, 4800, 'due = 12800 − 8000');
    eq(await prisma.payment.count({ where: { invoiceId: inv1.id } }), 2, 'exactly two payments (initial + collected)');
    assert(p1.body.payment.receiptNumber, 'receipt issued');
    ok('14. Payment collection + idempotency unchanged (৳3,000 collected once; due ৳4,800; receipt issued)');

    const over = await post(`/api/fees/invoices/${inv1.id}/payments`, { amount: 999999, paymentMethod: 'CASH' }, staffCookie);
    assert(over.status >= 400, 'overpayment still rejected');
    const refund = await post(`/api/fees/payments/${p1.body.payment.id}/refund`, { amount: 500, reason: 'Duplicate collection' }, ownerCookie);
    assert(refund.status === 201, `refund failed: ${JSON.stringify(refund.body)}`);
    const staffRefund = await post(`/api/fees/payments/${p1.body.payment.id}/refund`, { amount: 100, reason: 'Not allowed' }, staffCookie);
    assert(staffRefund.status === 403, `STAFF cannot refund, got ${staffRefund.status}`);
    const invAfterRefund = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv1.id } });
    eq(invAfterRefund.paidAmount, 7500, 'refund reduces paid');
    eq(invAfterRefund.dueAmount, 5300, 'refund increases due');
    ok('15. Overpayment guard, OWNER refund and STAFF refund denial unchanged');

    const rep = await get('/api/fees/reports/collection', ownerCookie);
    const dash = await get('/api/fees/dashboard', ownerCookie);
    const due = await get('/api/fees/reports/due', ownerCookie);
    const payDetail = await get(`/api/fees/payments/${p1.body.payment.id}`, ownerCookie);
    assert(rep.status === 200 && dash.status === 200 && due.status === 200 && payDetail.status === 200, `reports/receipt endpoints: ${rep.status}/${dash.status}/${due.status}/${payDetail.status}`);
    assert(JSON.stringify(payDetail.body).includes(p1.body.payment.receiptNumber), 'receipt detail shows the receipt number');
    ok('16. Collection report, finance dashboard, due report and receipt detail still respond correctly');

    // ---------------- Branch isolation ----------------
    const xBranch = await post('/api/students', admission({ useCoursePricing: true }), staffB2Cookie);
    assert(xBranch.status === 403, `branch-locked STAFF admitting into another branch must be 403, got ${xBranch.status}`);
    const xPay = await post(`/api/fees/invoices/${inv1.id}/payments`, { amount: 10, paymentMethod: 'CASH' }, staffB2Cookie);
    assert(xPay.status === 403, `branch-locked STAFF collecting on another branch's invoice must be 403, got ${xPay.status}`);
    const s1Branch = await prisma.studentFeeAssignment.findMany({ where: { studentId: s1Id }, select: { branchId: true } });
    assert(s1Branch.every((x) => x.branchId === branchA1.id), 'assignments carry the student\'s branch');
    ok('17. Branch isolation: cross-branch admission and collection blocked; assignments inherit the student\'s branch');

    // ---------------- Installments ----------------
    const inst = {
      fee: 12000,
      billingType: 'INSTALLMENT',
      additionalFees: [{ name: 'Admission Fee', amount: 500, isRequired: true, isActive: true }],
      installments: [
        { name: 'Admission', amount: 4000, dueAfterDays: 0 },
        { name: '2nd Installment', amount: 4000, dueAfterDays: 30 },
        { name: 'Final Installment', amount: 4000, dueAfterDays: 60 },
      ],
    };
    const badInst = await put(`/api/courses/${course.id}/pricing`, { ...inst, installments: [inst.installments[0], inst.installments[1], { ...inst.installments[2], amount: 3999 }] }, ownerCookie);
    assert(badInst.status === 400 && badInst.body.error === 'INSTALLMENTS_MUST_EQUAL_COURSE_FEE', `unbalanced installments rejected: ${badInst.status} ${JSON.stringify(badInst.body)}`);
    const oneInst = await put(`/api/courses/${course.id}/pricing`, { ...inst, installments: [{ name: 'Only', amount: 12000, dueAfterDays: 0 }] }, ownerCookie);
    assert(oneInst.status === 400, 'a single installment is rejected');
    const okInst = await put(`/api/courses/${course.id}/pricing`, inst, ownerCookie);
    assert(okInst.status === 200 && okInst.body.pricing.installments.length === 3, `valid installment plan saved: ${JSON.stringify(okInst.body)}`);
    const lockedFee = await put(`/api/courses/${course.id}`, { fee: 9999 }, ownerCookie);
    assert(lockedFee.status === 400 && lockedFee.body.error === 'COURSE_FEE_LOCKED_BY_INSTALLMENTS', `bare fee edit blocked on installment course: ${lockedFee.status} ${JSON.stringify(lockedFee.body)}`);
    const s6 = await post('/api/students', admission({ useCoursePricing: true, initialPayment: { amount: 4500, paymentMethod: 'CASH' } }), ownerCookie);
    assert(s6.status === 201, `installment admission failed: ${JSON.stringify(s6.body)}`);
    eq(s6.body.invoice.totalAmount, 12500, 'invoice covers full obligation');
    eq(s6.body.invoice.dueAmount, 8000, 'due after first installment + admission fee');
    const s6All = await prisma.studentFeeAssignment.findMany({ where: { studentId: s6.body.student.id } });
    assert(s6All.length === 4, `expected 3 installments + 1 fee, got ${s6All.length}`);
    const i1 = s6All.find((x) => x.name === 'Admission')!;
    const i2 = s6All.find((x) => x.name === '2nd Installment')!;
    const i3 = s6All.find((x) => x.name === 'Final Installment')!;
    assert(i1.dueDate && i1.dueDate.toISOString().startsWith('2026-12-31'), 'first installment uses the invoice due date');
    assert(i2.dueDate && i3.dueDate && i3.dueDate > i2.dueDate, 'later installments fall due later');
    assert(i1.status === 'PAID' && i2.status === 'PARTIAL' && i3.status === 'PENDING', `payment waterfalls over lines: ${s6All.map((x) => `${x.name}:${x.status}`)}`);
    ok('18. Installment plans validated (sum = Course Fee, ≥2); admission creates one assignment per installment with staggered due dates');

    // ---------------- Audit ----------------
    await prisma.$queryRaw`SELECT 1`;
    const logs = await prisma.auditLog.findMany({ where: { coachingCenterId: ccA, entity: 'Course', entityId: course.id }, orderBy: { createdAt: 'asc' } });
    const actions = new Set(logs.map((l) => l.action));
    for (const act of ['COURSE_PRICING_CREATED', 'COURSE_PRICING_UPDATED', 'COURSE_FEE_ITEM_ADDED', 'COURSE_FEE_ITEM_UPDATED', 'COURSE_PAYMENT_PLAN_CHANGED']) {
      assert(actions.has(act), `audit action ${act} missing (have: ${[...actions].join(', ')})`);
    }
    const updated = logs.find((l) => l.action === 'COURSE_PRICING_UPDATED')!;
    const det = JSON.parse(updated.details as string);
    assert(det.before?.fee === 12000 && det.after?.fee === 15000 && det.courseName === 'IELTS Foundation', 'before/after captured');
    assert(updated.userId && updated.createdAt, 'actor + timestamp captured');
    // removal
    await put(`/api/courses/${course.id}/pricing`, { ...inst, additionalFees: [] }, ownerCookie);
    const removed = await prisma.auditLog.count({ where: { coachingCenterId: ccA, entityId: course.id, action: 'COURSE_FEE_ITEM_REMOVED' } });
    assert(removed >= 1, 'COURSE_FEE_ITEM_REMOVED audited');
    const feeAudits = await prisma.auditLog.count({ where: { coachingCenterId: ccA, action: 'STUDENT_FEE_ASSIGNED' } });
    assert(feeAudits >= 4, 'per-line STUDENT_FEE_ASSIGNED audit entries recorded');
    ok('19. Audit: pricing created/updated, fee item added/updated/removed, payment plan changed — with actor and before/after');

    // ---------------- Historical data untouched by removing a fee item ----------------
    const s1Again = await prisma.studentFeeAssignment.findMany({ where: { studentId: s1Id }, orderBy: { createdAt: 'asc' } });
    eq(s1Again.length, 4, 'removing/disabling fee items leaves historical assignments intact');
    const invFinal = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: inv1.id } });
    eq(invFinal.subtotalAmount, 13800, 'historical invoice subtotal unchanged after all pricing edits');
    ok('20. Historical invoices/assignments unchanged after fee edits and removals');

    console.log('\n========================================================');
    console.log(`ALL PHASE 11.2 CHECKS PASSED (${passed})`);
    console.log('========================================================');
  } finally {
    console.log('Cleaning up throwaway tenants...');
    if (centerAId) await prisma.coachingCenter.delete({ where: { id: centerAId } }).catch(() => null);
    if (centerBId) await prisma.coachingCenter.delete({ where: { id: centerBId } }).catch(() => null);
    console.log('Cleanup completed.');
  }
}

main()
  .catch((err) => {
    console.error('FATAL VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => null));
