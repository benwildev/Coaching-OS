import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { notifyUser } from '../lib/services/notification.service';

/**
 * Phase 11.2.1 — Finance UX Completion & Admission Integrity verification.
 *
 * Runs against a live dev/prod server (AUTH_BASE_URL, default localhost:3000)
 * and the real database in isolated throwaway tenants.
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P1121-${Date.now()}`;
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
  assert(a === b || String(a) === String(b) || Number(a) === Number(b), `${label} — expected ${b}, got ${a}`);

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
const get = (path: string, cookie?: string) => request('GET', path, { cookie });
const login = (email: string, password: string) => post('/api/auth/login', { email, password });
const cookieOf = (r: Resp, name: string) => `${name}=${r.cookies[name].value}`;

async function setupTenant(code: string, name: string) {
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

async function createStaffUser(centerId: string, branchId: string, email: string) {
  const hp = await hashPassword(PW);
  const staffRole = await prisma.role.findFirstOrThrow({
    where: { coachingCenterId: centerId, code: 'STAFF' },
  });
  return prisma.user.create({
    data: {
      coachingCenterId: centerId,
      branchId,
      email,
      name: 'Staff Member',
      phone: `018${Date.now().toString().slice(-8)}`,
      passwordHash: hp,
      roleAssignments: {
        create: {
          roleId: staffRole.id,
          branchId,
        },
      },
    },
  });
}

async function run() {
  console.log(`\n============================================================`);
  console.log(`  PHASE 11.2.1 VERIFICATION SUITE — FINANCE UX & ADMISSION  `);
  console.log(`============================================================\n`);

  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  const codeA = `P1A-${rand}`;
  const codeB = `P1B-${rand}`;

  console.log(`Creating Tenant A (${codeA}) and Tenant B (${codeB})...`);
  const tA = await setupTenant(codeA, `Academy A ${TAG}`);
  const tB = await setupTenant(codeB, `Academy B ${TAG}`);

  const ccA = tA.center.id;
  const ccB = tB.center.id;

  // Add Branch 2 in Tenant A for branch isolation checks
  const bA2 = await prisma.branch.create({
    data: {
      coachingCenterId: ccA,
      name: 'Dhanmondi Branch',
      code: `DHN-${rand}`,
      phone: '01711112222',
      address: 'Dhanmondi, Dhaka',
    },
  });

  const staffAEmail = `staff-${codeA.toLowerCase()}@verify.local`;
  const staffUserA = await createStaffUser(ccA, tA.branch.id, staffAEmail);

  // Authenticate users
  const ownerALogin = await login(tA.owner.email, PW);
  assert(ownerALogin.status === 200, 'Owner A login failed');
  const ownerACookie = cookieOf(ownerALogin, SESSION_COOKIE_NAME);

  const staffALogin = await login(staffAEmail, PW);
  assert(staffALogin.status === 200, 'Staff A login failed');
  const staffACookie = cookieOf(staffALogin, SESSION_COOKIE_NAME);

  const ownerBLogin = await login(tB.owner.email, PW);
  assert(ownerBLogin.status === 200, 'Owner B login failed');
  const ownerBCookie = cookieOf(ownerBLogin, SESSION_COOKIE_NAME);

  // Retrieve classes and sessions for admission payload
  const classesA = await prisma.academicClass.findMany({
    where: { coachingCenterId: ccA },
  });
  const sessionA = await prisma.academicSession.findFirst({
    where: { coachingCenterId: ccA },
  });
  const programA = await prisma.academicProgram.findFirstOrThrow({
    where: { coachingCenterId: ccA },
  });
  const subjectA = await prisma.subject.findFirstOrThrow({
    where: { coachingCenterId: ccA },
  });
  assert(classesA.length > 0 && sessionA, 'Tenant A missing class or session');

  // Create a Course with fee and batch
  const courseA = await prisma.course.create({
    data: {
      coachingCenterId: ccA,
      academicProgramId: programA.id,
      academicClassId: classesA[0].id,
      name: 'Physics Excellence',
      code: `PHY-${rand}`,
      fee: 3000,
      description: 'Comprehensive SSC Physics',
    },
  });

  const batchA = await prisma.batch.create({
    data: {
      coachingCenterId: ccA,
      branchId: tA.branch.id,
      academicProgramId: programA.id,
      academicClassId: classesA[0].id,
      academicSessionId: sessionA.id,
      courseId: courseA.id,
      name: 'Morning Batch A',
      code: `MB-${rand}`,
      capacity: 30,
    },
  });

  // Create class schedule for batchA
  await prisma.classSchedule.create({
    data: {
      coachingCenterId: ccA,
      branchId: tA.branch.id,
      batchId: batchA.id,
      subjectId: subjectA.id,
      dayOfWeek: 'MONDAY',
      startTime: '08:00',
      endTime: '09:30',
      status: 'ACTIVE',
    },
  });

  console.log(`\n--- PART 1: DELIVERABLE 1 — ADMISSION IDEMPOTENCY ---`);

  // 1.1: Admission with idempotencyKey creates student and invoice
  const key1 = `adm-key-${Date.now()}-1`;
  const admPayload1 = {
    name: 'Rahim Uddin',
    phone: '01712345678',
    gender: 'MALE',
    academicSessionId: sessionA.id,
    branchId: tA.branch.id,
    academicProgramId: programA.id,
    academicClassId: classesA[0].id,
    courseId: courseA.id,
    batchId: batchA.id,
    idempotencyKey: key1,
    guardianName: 'Karim Uddin',
    guardianPhone: '01798765432',
    guardianRelationship: 'FATHER',
    feeAmount: 3000,
    feeDueDate: '2026-12-31',
  };

  const admRes1 = await post('/api/students', admPayload1, ownerACookie);
  assert(admRes1.status === 201, `Admission 1 failed: ${JSON.stringify(admRes1.body)}`);
  assert(admRes1.body.success === true, 'Admission 1 not successful');
  const student1Id = admRes1.body.student.id;
  const invoice1Id = admRes1.body.invoice.id;
  ok('Deliverable 1.1: Admission with idempotencyKey created student & invoice successfully');

  // 1.2: Replay exact same request with same idempotencyKey returns cached response
  const admRes1Replay = await post('/api/students', admPayload1, ownerACookie);
  assert(
    admRes1Replay.status === 200 || admRes1Replay.status === 201,
    `Admission replay failed: ${JSON.stringify(admRes1Replay.body)}`
  );
  assert(admRes1Replay.body.idempotentReplay === true, 'Admission replay missing idempotentReplay flag');
  assert(admRes1Replay.body.student.id === student1Id, 'Admission replay returned different student ID');
  assert(admRes1Replay.body.invoice.id === invoice1Id, 'Admission replay returned different invoice ID');

  // Verify DB count: only 1 student exists with phone '01712345678' in Tenant A
  const studentCount = await prisma.student.count({
    where: { coachingCenterId: ccA, phone: '01712345678' },
  });
  eq(studentCount, 1, 'Deliverable 1.2: Database contains exactly 1 student record (no duplicates)');
  ok('Deliverable 1.2: Idempotent replay returned original student & invoice without duplicate creation');

  // 1.3: Cross-tenant safety: Tenant B using the same key1 succeeds independently
  const classesB = await prisma.academicClass.findMany({
    where: { coachingCenterId: ccB },
  });
  const sessionB = await prisma.academicSession.findFirst({
    where: { coachingCenterId: ccB },
  });
  const programB = await prisma.academicProgram.findFirstOrThrow({
    where: { coachingCenterId: ccB },
  });
  const admPayloadB = {
    name: 'Karim Tenant B',
    phone: '01755556666',
    gender: 'MALE',
    academicSessionId: sessionB!.id,
    branchId: tB.branch.id,
    academicProgramId: programB.id,
    academicClassId: classesB[0].id,
    idempotencyKey: key1, // Same key used in Tenant A
    guardianName: 'Guardian B',
    guardianPhone: '01744443333',
    guardianRelationship: 'FATHER',
    feeAmount: 2000,
    feeDueDate: '2026-12-31',
  };
  const admResB = await post('/api/students', admPayloadB, ownerBCookie);
  assert(admResB.status === 201, `Tenant B admission with same key failed: ${JSON.stringify(admResB.body)}`);
  assert(admResB.body.student.id !== student1Id, 'Tenant B received Tenant A student ID');
  ok('Deliverable 1.3: Tenant-scoped idempotency key allows reuse across different tenants safely');

  console.log(`\n--- PART 2: DELIVERABLE 2 — COLLECT PAYMENT WORKFLOW ---`);

  // 2.1: Student Search API for collection
  const searchRes = await get(`/api/fees/collect/students?q=Rahim`, ownerACookie);
  assert(searchRes.status === 200, `Student search failed: ${JSON.stringify(searchRes.body)}`);
  assert(searchRes.body.students.length >= 1, 'Student search returned no results');
  const foundStudent = searchRes.body.students.find((s: any) => s.id === student1Id);
  assert(foundStudent, 'Target student not found in search results');
  assert(foundStudent.totalDue === 3000, `Expected totalDue 3000, got ${foundStudent.totalDue}`);
  assert(foundStudent.payableInvoiceCount >= 1, 'Payable invoice count should be >= 1');
  ok('Deliverable 2.1: Student search endpoint returned student with calculated due balance');

  // 2.2: Partial Payment Collection with payment idempotency
  const payKey1 = `pay-key-${Date.now()}-1`;
  const partialPayRes = await post(
    `/api/fees/invoices/${invoice1Id}/payments`,
    {
      amount: 1000,
      paymentMethod: 'BKASH',
      transactionId: 'TRX998877',
      paymentDate: '2026-03-15',
      idempotencyKey: payKey1,
      notes: 'Initial bKash partial payment',
    },
    ownerACookie
  );
  assert(partialPayRes.status === 201, `Partial payment failed: ${JSON.stringify(partialPayRes.body)}`);
  assert(partialPayRes.body.payment.receiptNumber, 'Receipt number not generated for payment');
  const receiptNo1 = partialPayRes.body.payment.receiptNumber;

  // Verify invoice updated
  const updatedInv1 = await prisma.feeInvoice.findUnique({ where: { id: invoice1Id } });
  eq(updatedInv1!.paidAmount, 1000, 'Invoice paidAmount');
  eq(updatedInv1!.dueAmount, 2000, 'Invoice dueAmount');
  assert(updatedInv1!.status === 'PARTIAL', `Expected status PARTIAL, got ${updatedInv1!.status}`);
  ok('Deliverable 2.2: Partial payment recorded, receipt generated, and invoice status updated to PARTIAL');

  // 2.3: Idempotent replay of the payment request
  const payReplayRes = await post(
    `/api/fees/invoices/${invoice1Id}/payments`,
    {
      amount: 1000,
      paymentMethod: 'BKASH',
      transactionId: 'TRX998877',
      paymentDate: '2026-03-15',
      idempotencyKey: payKey1,
    },
    ownerACookie
  );
  assert(
    payReplayRes.status === 200 || payReplayRes.status === 201,
    `Payment replay failed: ${JSON.stringify(payReplayRes.body)}`
  );
  assert(payReplayRes.body.idempotentReplay === true, 'Payment replay missing idempotentReplay flag');
  assert(payReplayRes.body.payment.receiptNumber === receiptNo1, 'Replayed payment returned different receipt');
  // Check invoice due is still 2000 (not decremented again)
  const invAfterReplay = await prisma.feeInvoice.findUnique({ where: { id: invoice1Id } });
  eq(invAfterReplay!.dueAmount, 2000, 'Invoice dueAmount after replay');
  ok('Deliverable 2.3: Payment idempotency replayed safely without double-charging');

  // 2.4: Branch isolation on student search
  // Create student in Branch 2 of Tenant A
  const studentB2 = await prisma.student.create({
    data: {
      coachingCenterId: ccA,
      branchId: bA2.id,
      studentIdCode: `STU-B2-${Date.now()}`,
      name: 'Farhan Dhanmondi',
      phone: '01733334444',
      gender: 'MALE',
    },
  });

  // Staff A (assigned to MAIN branch) searching for Farhan should NOT see students from Dhanmondi branch
  const staffSearchRes = await get(`/api/fees/collect/students?q=Farhan`, staffACookie);
  assert(staffSearchRes.status === 200, 'Staff search failed');
  const staffFound = staffSearchRes.body.students.find((s: any) => s.id === studentB2.id);
  assert(!staffFound, 'Branch leakage: Staff A found student from another branch');
  ok('Deliverable 2.4: Collect student search enforces branch boundary isolation for Staff');

  console.log(`\n--- PART 3: DELIVERABLE 3 — DISCOUNTS & WAIVERS WORKFLOW ---`);

  // 3.1: Staff submits discount request (pending approval)
  const staffDiscRes = await post(
    '/api/fees/discounts',
    {
      invoiceId: invoice1Id,
      type: 'DISCOUNT',
      amount: 500,
      reason: 'Merit scholarship requested by staff',
    },
    staffACookie
  );
  assert(staffDiscRes.status === 201, `Staff discount request failed: ${JSON.stringify(staffDiscRes.body)}`);
  assert(staffDiscRes.body.status === 'PENDING_APPROVAL', 'Expected PENDING_APPROVAL status');
  const discount1Id = staffDiscRes.body.discount.id;

  // Verify invoice balance remains unchanged while pending
  const invPendingCheck = await prisma.feeInvoice.findUnique({ where: { id: invoice1Id } });
  eq(invPendingCheck!.dueAmount, 2000, 'Invoice dueAmount must remain 2000 while request is pending');
  ok('Deliverable 3.1: Staff discount request created in PENDING_APPROVAL state without modifying invoice balance');

  // 3.2: Staff attempts to approve discount -> must be rejected (Owner only)
  const staffApproveRes = await post(`/api/fees/discounts/${discount1Id}/approve`, {}, staffACookie);
  assert(staffApproveRes.status === 403, `Staff was able to approve discount: status ${staffApproveRes.status}`);
  ok('Deliverable 3.2: Staff approval attempt rejected with 403 Forbidden (Owner-only permission)');

  // 3.3: Staff attempts to reject discount -> must be rejected (Owner only)
  const staffRejectRes = await post(`/api/fees/discounts/${discount1Id}/reject`, {}, staffACookie);
  assert(staffRejectRes.status === 403, `Staff was able to reject discount: status ${staffRejectRes.status}`);
  ok('Deliverable 3.3: Staff rejection attempt rejected with 403 Forbidden (Owner-only permission)');

  // 3.4: Cross-tenant approval attempt -> Owner B cannot approve Tenant A discount
  const crossTenantApproveRes = await post(`/api/fees/discounts/${discount1Id}/approve`, {}, ownerBCookie);
  assert(crossTenantApproveRes.status === 404, `Cross-tenant approval succeeded: status ${crossTenantApproveRes.status}`);
  ok('Deliverable 3.4: Cross-tenant approval attempt rejected with 404 (tenant isolation verified)');

  // 3.5: Owner A approves the pending discount
  const ownerApproveRes = await post(
    `/api/fees/discounts/${discount1Id}/approve`,
    { note: 'Approved based on academic performance' },
    ownerACookie
  );
  assert(ownerApproveRes.status === 200, `Owner approval failed: ${JSON.stringify(ownerApproveRes.body)}`);
  assert(ownerApproveRes.body.success === true, 'Approval response not successful');

  // Verify invoice updated: original total 3000, discount 500 -> total 2500, paid 1000 -> due 1500
  const invAfterApprove = await prisma.feeInvoice.findUnique({ where: { id: invoice1Id } });
  eq(invAfterApprove!.discountAmount, 500, 'Invoice discountAmount');
  eq(invAfterApprove!.totalAmount, 2500, 'Invoice totalAmount');
  eq(invAfterApprove!.dueAmount, 1500, 'Invoice dueAmount');
  ok('Deliverable 3.5: Owner approved discount; invoice balance decremented atomically to ৳1500');

  // 3.6: Duplicate approval attempt on already approved discount is rejected
  const dupApproveRes = await post(`/api/fees/discounts/${discount1Id}/approve`, {}, ownerACookie);
  assert(dupApproveRes.status === 400, `Duplicate approval allowed: status ${dupApproveRes.status}`);
  ok('Deliverable 3.6: Duplicate approval on already-approved discount rejected with 400');

  // 3.7: Staff requests a Waiver of 1000
  const staffWaiverRes = await post(
    '/api/fees/discounts',
    {
      invoiceId: invoice1Id,
      type: 'WAIVER',
      amount: 1000,
      reason: 'Hardship waiver request',
    },
    staffACookie
  );
  assert(staffWaiverRes.status === 201, `Staff waiver request failed: ${JSON.stringify(staffWaiverRes.body)}`);
  const waiver1Id = staffWaiverRes.body.discount.id;

  // 3.8: Owner rejects the waiver with reason
  const ownerRejectRes = await post(
    `/api/fees/discounts/${waiver1Id}/reject`,
    { reason: 'Exceeds branch concession quota for this session' },
    ownerACookie
  );
  assert(ownerRejectRes.status === 200, `Owner rejection failed: ${JSON.stringify(ownerRejectRes.body)}`);
  assert(ownerRejectRes.body.success === true, 'Rejection response not successful');

  // Verify invoice balance unchanged after rejection
  const invAfterReject = await prisma.feeInvoice.findUnique({ where: { id: invoice1Id } });
  eq(invAfterReject!.dueAmount, 1500, 'Invoice dueAmount must remain 1500 after waiver rejection');
  ok('Deliverable 3.8: Owner rejected waiver request; invoice balance preserved intact at ৳1500');

  // 3.9: Duplicate rejection on already rejected concession is rejected
  const dupRejectRes = await post(`/api/fees/discounts/${waiver1Id}/reject`, {}, ownerACookie);
  assert(dupRejectRes.status === 400, `Duplicate rejection allowed: status ${dupRejectRes.status}`);
  ok('Deliverable 3.9: Duplicate rejection on already-rejected concession rejected with 400');

  // 3.10: Concession amount exceeding invoice current due balance is rejected
  const excessiveDiscRes = await post(
    '/api/fees/discounts',
    {
      invoiceId: invoice1Id,
      type: 'DISCOUNT',
      amount: 5000, // Due is only 1500
      reason: 'Excessive discount test',
    },
    ownerACookie
  );
  assert(excessiveDiscRes.status === 400, `Excessive discount allowed: status ${excessiveDiscRes.status}`);
  ok('Deliverable 3.10: Discount amount exceeding current due balance rejected with 400');

  // 3.11: Audit log verification for discount actions
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      coachingCenterId: ccA,
      entity: 'FeeDiscount',
    },
    orderBy: { createdAt: 'desc' },
  });
  const actions = auditLogs.map((l) => l.action);
  assert(actions.includes('DISCOUNT_REQUESTED'), 'Missing DISCOUNT_REQUESTED in audit log');
  assert(actions.includes('DISCOUNT_APPROVED'), 'Missing DISCOUNT_APPROVED in audit log');
  assert(actions.includes('WAIVER_REQUESTED'), 'Missing WAIVER_REQUESTED in audit log');
  assert(actions.includes('WAIVER_REJECTED'), 'Missing WAIVER_REJECTED in audit log');
  ok('Deliverable 3.11: Audit logs correctly recorded for requested, approved, and rejected concessions');

  // 3.12: In-app notification verification for OWNER on discount and waiver requests
  const ownerDiscNotifs = await prisma.notification.findMany({
    where: {
      coachingCenterId: ccA,
      userId: tA.owner.id,
      sourceType: 'FeeDiscount',
      sourceId: discount1Id,
    },
  });
  assert(ownerDiscNotifs.length === 1, `Owner should have exactly 1 notification for discount1Id, found ${ownerDiscNotifs.length}`);
  const dNotif = ownerDiscNotifs[0];
  eq(dNotif.type, 'FEE_DISCOUNT_REQUESTED', 'Notification type must be FEE_DISCOUNT_REQUESTED');
  eq(dNotif.actionUrl, '/fees/discounts', 'Notification actionUrl must be /fees/discounts');
  assert(dNotif.title.includes('Discount') || dNotif.title.includes('ডিসকাউন্ট'), 'Notification title should contain Discount');
  assert(dNotif.body.includes('500'), 'Notification body should include requested amount 500');
  assert(dNotif.body.includes('Staff Member'), 'Notification body should include requester name');
  assert(dNotif.body.includes('INV-'), 'Notification body should include invoice number');

  const ownerWaiverNotifs = await prisma.notification.findMany({
    where: {
      coachingCenterId: ccA,
      userId: tA.owner.id,
      sourceType: 'FeeDiscount',
      sourceId: waiver1Id,
    },
  });
  assert(ownerWaiverNotifs.length === 1, `Owner should have exactly 1 notification for waiver1Id, found ${ownerWaiverNotifs.length}`);
  const wNotif = ownerWaiverNotifs[0];
  eq(wNotif.type, 'FEE_DISCOUNT_REQUESTED', 'Notification type must be FEE_DISCOUNT_REQUESTED');
  assert(wNotif.title.includes('Waiver') || wNotif.title.includes('মওকুফ'), 'Notification title should contain Waiver');
  assert(wNotif.body.includes('1000'), 'Notification body should include requested amount 1000');
  ok('Deliverable 3.12: OWNER receives in-app notifications for new discount & waiver requests with student, amount, and invoice details');

  // 3.13: In-app notification verification for requester on approval and rejection
  const requesterApproveNotifs = await prisma.notification.findMany({
    where: {
      coachingCenterId: ccA,
      userId: staffUserA.id,
      sourceType: 'FeeDiscount',
      sourceId: discount1Id,
    },
  });
  assert(requesterApproveNotifs.length === 1, `Requester should have 1 approval notification, found ${requesterApproveNotifs.length}`);
  const aNotif = requesterApproveNotifs[0];
  eq(aNotif.type, 'FEE_DISCOUNT_APPROVED', 'Approval notification type must be FEE_DISCOUNT_APPROVED');
  eq(aNotif.actionUrl, '/fees/discounts', 'ActionUrl must be /fees/discounts');
  assert(aNotif.title.includes('Approved') || aNotif.title.includes('অনুমোদিত'), 'Title must state approved');
  assert(aNotif.body.includes('Approved based on academic performance'), 'Body must include owner note');
  assert(aNotif.body.includes('500'), 'Body must include approved amount');

  const requesterRejectNotifs = await prisma.notification.findMany({
    where: {
      coachingCenterId: ccA,
      userId: staffUserA.id,
      sourceType: 'FeeDiscount',
      sourceId: waiver1Id,
    },
  });
  assert(requesterRejectNotifs.length === 1, `Requester should have 1 rejection notification, found ${requesterRejectNotifs.length}`);
  const rNotif = requesterRejectNotifs[0];
  eq(rNotif.type, 'FEE_DISCOUNT_REJECTED', 'Rejection notification type must be FEE_DISCOUNT_REJECTED');
  eq(rNotif.actionUrl, '/fees/discounts', 'ActionUrl must be /fees/discounts');
  assert(rNotif.title.includes('Rejected') || rNotif.title.includes('প্রত্যাখ্যাত'), 'Title must state rejected');
  assert(rNotif.body.includes('Exceeds branch concession quota for this session'), 'Body must include rejection reason');
  assert(rNotif.body.includes('1000'), 'Body must include rejected amount');
  ok('Deliverable 3.13: Requester receives in-app notifications upon OWNER approval and rejection with notes/reasons');

  // 3.14: Tenant isolation & deduplication verification
  const crossTenantNotifs = await prisma.notification.findMany({
    where: {
      coachingCenterId: ccB,
      sourceType: 'FeeDiscount',
    },
  });
  eq(crossTenantNotifs.length, 0, 'Cross-tenant leak: Tenant B received Tenant A discount notifications');

  const foreignOwnerNotifs = await prisma.notification.findMany({
    where: {
      userId: tB.owner.id,
      sourceType: 'FeeDiscount',
    },
  });
  eq(foreignOwnerNotifs.length, 0, 'Foreign owner received Tenant A discount notifications');

  // Deduplication check: re-notifying for existing (userId, sourceType, sourceId, type) does not create duplicate
  await notifyUser({
    coachingCenterId: ccA,
    userId: staffUserA.id,
    type: 'FEE_DISCOUNT_APPROVED',
    title: 'Duplicate test',
    body: 'Duplicate test body',
    actionUrl: '/fees/discounts',
    sourceType: 'FeeDiscount',
    sourceId: discount1Id,
  });
  const afterDupCount = await prisma.notification.count({
    where: {
      userId: staffUserA.id,
      sourceType: 'FeeDiscount',
      sourceId: discount1Id,
      type: 'FEE_DISCOUNT_APPROVED',
    },
  });
  eq(afterDupCount, 1, 'Duplicate notification was created on retried event');
  ok('Deliverable 3.14: Strict tenant isolation and deduplication on retry verified for discount notifications');

  console.log(`\n--- PART 4: DELIVERABLE 4 — COURSE STUDENTS & SCHEDULE TABS ---`);

  // 4.1: Course Students endpoint returns enrolled students with guardian & batch
  const courseStudentsRes = await get(`/api/courses/${courseA.id}/students`, ownerACookie);
  assert(courseStudentsRes.status === 200, `Course students fetch failed: ${JSON.stringify(courseStudentsRes.body)}`);
  assert(courseStudentsRes.body.success === true, 'Course students response not successful');
  assert(courseStudentsRes.body.count >= 1, 'Expected at least 1 student enrolled in course');
  const enrolledStudent = courseStudentsRes.body.students.find((s: any) => s.id === student1Id);
  assert(enrolledStudent, 'Enrolled student missing from course students list');
  assert(enrolledStudent.batchName === 'Morning Batch A', `Batch name mismatch: ${enrolledStudent.batchName}`);
  assert(enrolledStudent.guardianName === 'Karim Uddin', `Guardian mismatch: ${enrolledStudent.guardianName}`);
  ok('Deliverable 4.1: Course Students tab API returned enrolled students with guardian and batch details');

  // 4.2: Course Schedules endpoint returns batch routine periods
  const courseSchedulesRes = await get(`/api/courses/${courseA.id}/schedules`, ownerACookie);
  assert(
    courseSchedulesRes.status === 200,
    `Course schedules fetch failed: ${JSON.stringify(courseSchedulesRes.body)}`
  );
  assert(courseSchedulesRes.body.success === true, 'Course schedules response not successful');
  assert(courseSchedulesRes.body.count >= 1, 'Expected at least 1 schedule in course');
  const foundSchedule = courseSchedulesRes.body.schedules.find((s: any) => s.batchCode === `MB-${rand}`);
  assert(foundSchedule, 'Batch schedule missing from course schedules');
  assert(foundSchedule.subjectName === subjectA.name, 'Routine period subject mismatch');
  ok('Deliverable 4.2: Course Schedule tab API returned batch routine periods for the course');

  // 4.3: Cross-tenant safety for Course endpoints
  const crossCourseStudents = await get(`/api/courses/${courseA.id}/students`, ownerBCookie);
  assert(crossCourseStudents.status === 404, `Cross-tenant course students allowed: status ${crossCourseStudents.status}`);
  const crossCourseSchedules = await get(`/api/courses/${courseA.id}/schedules`, ownerBCookie);
  assert(crossCourseSchedules.status === 404, `Cross-tenant course schedules allowed: status ${crossCourseSchedules.status}`);
  ok('Deliverable 4.3: Course tabs API enforces strict cross-tenant isolation (404 on foreign course)');

  console.log(`\n============================================================`);
  console.log(`  ALL ${passed} CHECKS PASSED FOR PHASE 11.2.1!             `);
  console.log(`============================================================\n`);

  // Clean up throwaway tenants
  try {
    await prisma.coachingCenter.deleteMany({ where: { id: { in: [ccA, ccB] } } });
  } catch (cleanErr) {
    console.warn('Tenant cleanup warning:', cleanErr);
  }
}

run()
  .catch((err) => {
    console.error(`\n❌ VERIFICATION FAILED:`, err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
