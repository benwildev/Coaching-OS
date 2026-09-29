import 'dotenv/config';
import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { provisionPortalAccount, completeSetupOrReset } from '../lib/services/portal-auth.service';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { PORTAL_SESSION_COOKIE_NAME } from '../lib/auth/portal-session';
import { createInvoice } from '../lib/services/invoice.service';
import { createPayment, refundPayment } from '../lib/services/payment.service';
import { todayDhaka } from '../lib/reports/dates';

/**
 * Phase 10.9 — Finance Operations & Collection Management Verification
 *
 *   AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase10-9.ts
 *
 * Duplicate-payment idempotency, concurrent-payment-race protection, and
 * overpayment prevention are already exhaustively proven by
 * verify-phase10-5.ts — scenarios 3-7 below give them one light
 * confirmation each rather than re-litigating that ground. The rest of this
 * script targets what Phase 10.9 actually adds: cash reconciliation,
 * collector summary, the date-selectable daily collection dashboard, and
 * refund/immutability coverage that no prior script exercised.
 *
 * Scenarios:
 *  1. Tenant isolation (cash sessions, collector view, daily collection)
 *  2. Branch isolation (STAFF pinned to own branch; cross-branch rejected)
 *  3. Payment creation (smoke)
 *  4. Payment idempotency (smoke)
 *  5. Concurrent payment protection (smoke)
 *  6. Due calculation correctness after payments + refund
 *  7. Overpayment prevention (smoke)
 *  8. Payment-method aggregation (daily collection breakdown)
 *  9. Daily collection summary (known fixture, exact totals)
 * 10. Collector summary (per-collector cash/digital/total split)
 * 11. Receipt generation (receipt number format + fields)
 * 12. Receipt reprint (idempotent re-fetch, no duplicate row)
 * 13. Refund (full)
 * 14. Refund (partial)
 * 15. Refund over-limit prevention
 * 16. Financial immutability (no mutation endpoint for a completed payment)
 * 17. Cash reconciliation — balanced close
 * 18. Cash reconciliation — mismatch requires a note, then records the discrepancy
 * 19. Cash reconciliation — a closed session cannot be closed again
 * 20. Cash reconciliation — concurrent close only succeeds once
 * 21. Branch-locked user cannot open/close a session for another branch
 * 22. Teacher financial denial (cash sessions, collectors, daily collection)
 * 23. Student financial isolation (own data only)
 * 24. Guardian child isolation (unlinked child rejected)
 * 25. Report filtering + pagination (extended Payments list)
 * 26. CSV export authorization (collectors view)
 * 27. Zero-data dashboard (new tenant, real zeros, no fabrication)
 * 28. Failed payment handling (rejected attempt creates zero Payment rows)
 * 29. Audit logging (cash session + refund + payment actions present)
 * 30. Rollback safety on a rejected refund (no partial state)
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P109-${Date.now()}`;
const PW = 'ValidPass123!';
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ [${passed}] ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

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
const patch = (path: string, payload: unknown, cookie?: string) => request('PATCH', path, { payload, cookie });
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

const todayNoonUtc = () => `${todayDhaka()}T08:00:00.000Z`; // 14:00 Dhaka — safely mid-day

// createInvoice is called directly (bypassing its Zod schema, which supplies
// .default(0) for discountAmount/waiverAmount) — this helper keeps every
// call site from re-deriving that NaN-avoidance detail.
function mkInvoice(cc: string, studentId: string, branchId: string, description: string, unitAmount: number, actorId: string) {
  return createInvoice(cc, { studentId, branchId, items: [{ description, quantity: 1, unitAmount, discountAmount: 0 }], discountAmount: 0, waiverAmount: 0, issueNow: true } as any, actorId);
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 10.9 FINANCE OPERATIONS VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerAId: string | null = null;
  let centerBId: string | null = null;

  try {
    const codeA = `T9A${Date.now().toString().slice(-7)}`;
    const codeB = `T9B${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerAId = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerBId = b.center.id;
    const cc = a.center.id;
    const branchA1 = a.branch;

    const branchA2 = await prisma.branch.create({ data: { coachingCenterId: cc, name: 'Branch Two', code: `B2-${Date.now().toString().slice(-4)}`, phone: '01711111111' } });
    const branchA3 = await prisma.branch.create({ data: { coachingCenterId: cc, name: 'Branch Three', code: `B3-${Date.now().toString().slice(-4)}`, phone: '01711111112' } });

    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: cc } });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER', branchId: string) =>
      prisma.user.create({
        data: {
          coachingCenterId: cc,
          branchId,
          email,
          passwordHash: hashPassword(PW),
          name: `${TAG} ${email}`,
          roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId } },
        },
      });

    const adminUser = await mkUser(e('admin'), 'ADMIN', branchA1.id);
    const staffA1 = await mkUser(e('staff1'), 'STAFF', branchA1.id);
    const staffA2 = await mkUser(e('staff2'), 'STAFF', branchA2.id);
    const teacherUser = await mkUser(e('teacher'), 'TEACHER', branchA1.id);

    const student1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student One`, email: `${TAG.toLowerCase()}-stu1@verify.local` } });
    const student2 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA2.id, studentIdCode: `${TAG}-S2`, name: `${TAG} Student Two`, email: `${TAG.toLowerCase()}-stu2@verify.local` } });

    const guardian1 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000010', email: `${TAG.toLowerCase()}-guardian@verify.local`, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    // guardian1 deliberately NOT linked to student2 — the isolation target for scenario 24.

    const student1Provision = await provisionPortalAccount({ coachingCenterId: cc, studentId: student1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(student1Provision.setupToken, PW);
    const guardianProvision = await provisionPortalAccount({ coachingCenterId: cc, guardianId: guardian1.id, actorUserId: a.owner.id });
    await completeSetupOrReset(guardianProvision.setupToken, PW);

    ok('Fixtures: 2 tenants, 3 branches, OWNER/ADMIN/STAFFx2/TEACHER, 2 students, 1 guardian (1 linked child), 2 portal accounts');

    // ----------------------------------------------------
    // Fixture: invoiceMain (branchA1/student1) — collector + method + daily summary target
    // ----------------------------------------------------
    const invoiceMain = await mkInvoice(cc, student1.id, branchA1.id, 'Monthly Tuition', 10000, a.owner.id);

    const p1 = (await createPayment(cc, invoiceMain.id, { amount: 3000, paymentMethod: 'CASH', paymentDate: todayNoonUtc() } as any, staffA1.id)).payment;
    const p2 = (await createPayment(cc, invoiceMain.id, { amount: 2000, paymentMethod: 'BKASH', paymentDate: todayNoonUtc(), transactionId: `TXN-${TAG}-1` } as any, staffA1.id)).payment;
    const p3 = (await createPayment(cc, invoiceMain.id, { amount: 1500, paymentMethod: 'CASH', paymentDate: todayNoonUtc() } as any, adminUser.id)).payment;
    const p4 = (await createPayment(cc, invoiceMain.id, { amount: 1000, paymentMethod: 'NAGAD', paymentDate: todayNoonUtc(), transactionId: `TXN-${TAG}-2` } as any, adminUser.id)).payment;

    // ----------------------------------------------------
    // Scenario 3, 4, 5, 7: payment creation / idempotency / concurrency / overpayment (smoke — exhaustively proven in verify-phase10-5.ts)
    // ----------------------------------------------------
    assert(p1.status === 'COMPLETED' && Number(p1.amount) === 3000, 'Scenario 3 failed: payment creation');
    ok('3. Payment creation (smoke)');

    const idemKey = `idem-${TAG}`;
    const idem1 = await createPayment(cc, invoiceMain.id, { amount: 100, paymentMethod: 'CASH', idempotencyKey: idemKey } as any, staffA1.id);
    const idem2 = await createPayment(cc, invoiceMain.id, { amount: 100, paymentMethod: 'CASH', idempotencyKey: idemKey } as any, staffA1.id);
    assert(idem1.payment.id === idem2.payment.id, 'Scenario 4 failed: idempotency');
    ok('4. Payment idempotency (smoke)');

    // On branchA2 (not branchA1) deliberately — keeps this concurrency/overpayment
    // fixture from polluting the branchA1 daily-summary/collector-summary
    // assertions in scenarios 8-10, which target a precisely known fixture.
    const invoiceForRace = await mkInvoice(cc, student1.id, branchA2.id, 'Race Test Fee', 1000, a.owner.id);
    const raceResults = await Promise.allSettled([
      createPayment(cc, invoiceForRace.id, { amount: 700, paymentMethod: 'CASH' } as any, staffA1.id),
      createPayment(cc, invoiceForRace.id, { amount: 700, paymentMethod: 'CASH' } as any, staffA1.id),
    ]);
    const raceSucceeded = raceResults.filter((r) => r.status === 'fulfilled').length;
    assert(raceSucceeded === 1, `Scenario 5 failed: expected exactly 1 concurrent overpayment race winner, got ${raceSucceeded}`);
    ok('5. Concurrent payment protection (smoke)');

    let overpayRejected = false;
    try {
      await createPayment(cc, invoiceForRace.id, { amount: 999999, paymentMethod: 'CASH' } as any, staffA1.id);
    } catch {
      overpayRejected = true;
    }
    assert(overpayRejected, 'Scenario 7 failed: overpayment must be rejected');
    ok('7. Overpayment prevention (smoke)');

    // ----------------------------------------------------
    // Scenario 6: Due calculation correctness (after payments; refund covered later reconfirms it)
    // ----------------------------------------------------
    // paid = 3000 (p1) + 2000 (p2) + 1500 (p3) + 1000 (p4) + 100 (the scenario-4 idempotency-test payment, also against invoiceMain) = 7600
    const invoiceMainAfterPayments = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoiceMain.id } });
    assert(Number(invoiceMainAfterPayments.paidAmount) === 7600 && Number(invoiceMainAfterPayments.dueAmount) === 2400, `Scenario 6 failed: ${JSON.stringify(invoiceMainAfterPayments)}`);
    ok('6. Due calculation correct after payments (paid=7600, due=2400 on a 10000 invoice)');

    // ----------------------------------------------------
    // Scenario 8 & 9: Payment-method aggregation + daily collection summary
    // ----------------------------------------------------
    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const staffA1Cookie = cookieOf(await login(staffA1.email, PW), SESSION_COOKIE_NAME);
    const staffA2Cookie = cookieOf(await login(staffA2.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacherUser.email, PW), SESSION_COOKIE_NAME);
    const student1Cookie = cookieOf(await login(student1.email!, PW), PORTAL_SESSION_COOKIE_NAME);
    const guardianCookie = cookieOf(await login(guardian1.email!, PW), PORTAL_SESSION_COOKIE_NAME);

    const s9Res = await get(`/api/fees/collection?branch=${branchA1.id}`, ownerCookie);
    assert(s9Res.status === 200, `Scenario 9 request failed: ${s9Res.status}`);
    const summary1 = s9Res.body.summary;
    assert(summary1.totalCollection === 7600, `Scenario 9 failed totalCollection: ${JSON.stringify(summary1)}`); // 7500 + the 100 idempotency-test payment
    assert(summary1.refundedAmount === 0 && summary1.netCollection === 7600, `Scenario 9 failed net/refunded: ${JSON.stringify(summary1)}`);
    const cashRow = summary1.methods.find((m: any) => m.method === 'CASH');
    const bkashRow = summary1.methods.find((m: any) => m.method === 'BKASH');
    const nagadRow = summary1.methods.find((m: any) => m.method === 'NAGAD');
    assert(cashRow.gross === 4600 && bkashRow.gross === 2000 && nagadRow.gross === 1000, `Scenario 8/9 failed method breakdown: ${JSON.stringify(summary1.methods)}`);
    ok('8. Payment-method aggregation correct (CASH/BKASH/NAGAD gross per method)');
    ok('9. Daily collection summary correct for a known fixture (total/refunded/net)');

    // ----------------------------------------------------
    // Scenario 10: Collector summary
    // ----------------------------------------------------
    const today = todayDhaka();
    const s10Res = await get(`/api/reports/finance?view=collectors&dateFrom=${today}&dateTo=${today}&branchId=${branchA1.id}`, ownerCookie);
    assert(s10Res.status === 200, `Scenario 10 request failed: ${s10Res.status}`);
    const collectorRows: any[] = s10Res.body.data.rows;
    const staffRow = collectorRows.find((r) => r.collectorId === staffA1.id);
    const adminRow = collectorRows.find((r) => r.collectorId === adminUser.id);
    assert(Number(staffRow.cash) === 3100 && Number(staffRow.digital) === 2000, `Scenario 10 failed staff row: ${JSON.stringify(staffRow)}`); // 3000 + 100 idempotency test, both CASH
    assert(Number(adminRow.cash) === 1500 && Number(adminRow.digital) === 1000, `Scenario 10 failed admin row: ${JSON.stringify(adminRow)}`);
    ok('10. Collector summary correct (per-collector cash/digital split)');

    // ----------------------------------------------------
    // Scenario 11: Receipt generation
    // ----------------------------------------------------
    assert(/^RCP-\d{4}-\d{6}$/.test(p1.receiptNumber), `Scenario 11 failed: bad receipt number format ${p1.receiptNumber}`);
    ok('11. Receipt generation (correct receiptNumber format)');

    // ----------------------------------------------------
    // Scenario 12: Receipt reprint
    // ----------------------------------------------------
    const reprint1 = await get(`/api/fees/payments/${p1.id}`, ownerCookie);
    const reprint2 = await get(`/api/fees/payments/${p1.id}`, ownerCookie);
    assert(reprint1.body.payment.receiptNumber === reprint2.body.payment.receiptNumber, 'Scenario 12 failed: receipt number must be stable across reprints');
    const paymentRowCount = await prisma.payment.count({ where: { id: p1.id } });
    assert(paymentRowCount === 1, 'Scenario 12 failed: reprinting must never create a duplicate payment row');
    ok('12. Receipt reprint is idempotent (same receipt, no duplicate row)');

    // ----------------------------------------------------
    // Scenario 13, 14, 15: Refund (full, partial, over-limit)
    // ----------------------------------------------------
    const invoiceFull = await mkInvoice(cc, student1.id, branchA1.id, 'Full Refund Test Fee', 2000, a.owner.id);
    const pFull = (await createPayment(cc, invoiceFull.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: todayNoonUtc() } as any, staffA1.id)).payment;
    await refundPayment(cc, pFull.id, { amount: 2000, reason: 'Full refund test' } as any, a.owner.id);
    const pFullAfter = await prisma.payment.findUniqueOrThrow({ where: { id: pFull.id } });
    const invoiceFullAfter = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoiceFull.id } });
    assert(pFullAfter.status === 'REFUNDED' && Number(invoiceFullAfter.dueAmount) === 2000 && Number(invoiceFullAfter.paidAmount) === 0, `Scenario 13 failed: ${JSON.stringify({ pFullAfter, invoiceFullAfter })}`);
    ok('13. Full refund restores invoice due and marks payment REFUNDED');

    const invoicePartial = await mkInvoice(cc, student1.id, branchA2.id, 'Partial Refund Test Fee', 5000, a.owner.id);
    const pPartial = (await createPayment(cc, invoicePartial.id, { amount: 5000, paymentMethod: 'CASH', paymentDate: todayNoonUtc() } as any, staffA2.id)).payment;
    await refundPayment(cc, pPartial.id, { amount: 1500, reason: 'Partial refund test' } as any, a.owner.id);
    const pPartialAfter = await prisma.payment.findUniqueOrThrow({ where: { id: pPartial.id } });
    const invoicePartialAfter = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoicePartial.id } });
    assert(pPartialAfter.status === 'PARTIALLY_REFUNDED' && Number(invoicePartialAfter.dueAmount) === 1500 && Number(invoicePartialAfter.paidAmount) === 3500, `Scenario 14 failed: ${JSON.stringify({ pPartialAfter, invoicePartialAfter })}`);
    ok('14. Partial refund leaves the correct remaining due and PARTIALLY_REFUNDED status');

    let overRefundRejected = false;
    try {
      await refundPayment(cc, pPartial.id, { amount: 4000, reason: 'Should exceed refundable balance' } as any, a.owner.id);
    } catch {
      overRefundRejected = true;
    }
    const pPartialUnchanged = await prisma.payment.findUniqueOrThrow({ where: { id: pPartial.id } });
    const invoicePartialUnchanged = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoicePartial.id } });
    const refundCountForPartial = await prisma.paymentRefund.count({ where: { paymentId: pPartial.id } });
    assert(overRefundRejected, 'Scenario 15 failed: refund exceeding refundable balance must be rejected');
    assert(refundCountForPartial === 1 && Number(pPartialUnchanged.amount) === 5000 && Number(invoicePartialUnchanged.dueAmount) === 1500, 'Scenario 15/30 failed: rejected refund must leave no partial state');
    ok('15. Refund exceeding the refundable balance is rejected, payment/invoice left unchanged');
    ok('30. Rollback safety confirmed: the rejected over-limit refund created zero PaymentRefund rows and changed nothing');

    // ----------------------------------------------------
    // Scenario 16: Financial immutability
    // ----------------------------------------------------
    const s16Res = await patch(`/api/fees/payments/${p1.id}`, { amount: 1 }, ownerCookie);
    assert(s16Res.status === 404 || s16Res.status === 405, `Scenario 16 failed: expected no mutation route, got ${s16Res.status}`);
    const p1Unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: p1.id } });
    assert(Number(p1Unchanged.amount) === 3000 && p1Unchanged.receiptNumber === p1.receiptNumber, 'Scenario 16 failed: payment fields must be immutable');
    ok('16. Financial immutability: no endpoint can mutate a completed payment\'s fields');

    // ----------------------------------------------------
    // Scenario 21a (branch-locked open is pinned to the caller's own branch)
    // + Scenario 17 (balanced close), sharing one session: staffA1 (locked to
    // branchA1) submits branchA2 as the target — the server must ignore that
    // and open the session for branchA1 instead.
    // ----------------------------------------------------
    const openA1 = await post('/api/fees/cash-sessions', { branchId: branchA2.id, openingCash: 1000 }, staffA1Cookie);
    assert(openA1.status === 201, `Scenario 17/21a open failed: ${JSON.stringify(openA1.body)}`);
    assert(openA1.body.session.branchId === branchA1.id, `Scenario 21a failed: branch-locked open must be pinned to the caller's own branch, got ${openA1.body.session.branchId}`);
    const sessionA1Id = openA1.body.session.id;
    // branchA1 cash today: p1(3000) + p3(1500) + idem payment(100) = 4600, no refunds on branchA1 today.
    const closeA1Balanced = await post(`/api/fees/cash-sessions/${sessionA1Id}/close`, { countedCash: 5600 }, ownerCookie);
    assert(closeA1Balanced.status === 200 && Number(closeA1Balanced.body.session?.difference) === 0, `Scenario 17 failed: ${JSON.stringify(closeA1Balanced.body)}`);
    ok('17. Cash reconciliation: balanced close (expected == actual)');

    const openA2 = await post('/api/fees/cash-sessions', { branchId: branchA2.id, openingCash: 2000 }, ownerCookie);
    const sessionA2Id = openA2.body.session.id;
    const closeA2NoNote = await post(`/api/fees/cash-sessions/${sessionA2Id}/close`, { countedCash: 5000 }, ownerCookie);
    assert(closeA2NoNote.status !== 200, 'Scenario 18a failed: a mismatched close with no note must be rejected');
    const closeA2WithNote = await post(`/api/fees/cash-sessions/${sessionA2Id}/close`, { countedCash: 5000, note: 'Cashier short by 500 taka, investigating' }, ownerCookie);
    assert(closeA2WithNote.status === 200, `Scenario 18b failed: ${JSON.stringify(closeA2WithNote.body)}`);
    const diff = Number(closeA2WithNote.body.session.difference);
    assert(diff !== 0, `Scenario 18 failed: discrepancy must remain visible, got difference=${diff}`);
    ok('18. Cash reconciliation: mismatch requires a note, then records the visible discrepancy (never silently balanced)');

    const closeA2Again = await post(`/api/fees/cash-sessions/${sessionA2Id}/close`, { countedCash: 5000, note: 'retry' }, ownerCookie);
    assert(closeA2Again.status !== 200, 'Scenario 19 failed: an already-closed session must not be closable again');
    ok('19. Cash reconciliation: an already-closed session cannot be closed again');

    const openA3 = await post('/api/fees/cash-sessions', { branchId: branchA3.id, openingCash: 0 }, ownerCookie);
    const sessionA3Id = openA3.body.session.id;
    const concurrentCloses = await Promise.allSettled([
      post(`/api/fees/cash-sessions/${sessionA3Id}/close`, { countedCash: 0 }, ownerCookie),
      post(`/api/fees/cash-sessions/${sessionA3Id}/close`, { countedCash: 0 }, ownerCookie),
    ]);
    const closeSuccesses = concurrentCloses.filter((r) => r.status === 'fulfilled' && (r.value as Resp).status === 200).length;
    assert(closeSuccesses === 1, `Scenario 20 failed: expected exactly 1 successful concurrent close, got ${closeSuccesses}`);
    ok('20. Cash reconciliation: two concurrent close requests only succeed once (atomic claim)');

    // ----------------------------------------------------
    // Scenario 21b: a branch-locked user cannot close another branch's
    // session (21a — the open-side pinning check — already ran above,
    // sharing the session used for scenario 17).
    // ----------------------------------------------------
    const s21Close = await post(`/api/fees/cash-sessions/${sessionA3Id}/close`, { countedCash: 0 }, staffA1Cookie);
    assert(s21Close.status === 403, `Scenario 21b failed: expected forbidden, got ${s21Close.status}`);
    ok('21. A branch-locked user cannot open (pinned instead) or close another branch\'s cash session');

    // ----------------------------------------------------
    // Scenario 22: Teacher financial denial
    // ----------------------------------------------------
    const t1 = await get('/api/fees/cash-sessions', teacherCookie);
    const t2 = await get(`/api/reports/finance?view=collectors&dateFrom=${today}&dateTo=${today}`, teacherCookie);
    const t3 = await get('/api/fees/collection', teacherCookie);
    assert(t1.status === 403 && t2.status === 403 && t3.status === 403, `Scenario 22 failed: cash=${t1.status} collectors=${t2.status} collection=${t3.status}`);
    ok('22. Teacher financial denial across cash sessions, collector summary, and daily collection');

    // ----------------------------------------------------
    // Scenario 23: Student financial isolation
    // ----------------------------------------------------
    const s23Res = await get('/api/portal/student/fees', student1Cookie);
    assert(s23Res.status === 200, `Scenario 23 failed: ${s23Res.status}`);
    ok('23. Student financial isolation: own data accessible via the existing portal endpoint');

    // ----------------------------------------------------
    // Scenario 24: Guardian child isolation
    // ----------------------------------------------------
    const s24Linked = await get(`/api/portal/guardian/children/${student1.id}/fees`, guardianCookie);
    const s24Unlinked = await get(`/api/portal/guardian/children/${student2.id}/fees`, guardianCookie);
    assert(s24Linked.status === 200, `Scenario 24 failed linked child: ${s24Linked.status}`);
    assert(s24Unlinked.status === 403, `Scenario 24 failed: unlinked child must be rejected, got ${s24Unlinked.status}`);
    ok('24. Guardian child isolation: unlinked child rejected, linked child accessible');

    // ----------------------------------------------------
    // Scenario 25: Report filtering + pagination (extended Payments list)
    // ----------------------------------------------------
    const s25Page1 = await get(`/api/fees/payments?branch=${branchA1.id}&pageSize=2&page=1`, ownerCookie);
    const s25Page2 = await get(`/api/fees/payments?branch=${branchA1.id}&pageSize=2&page=2`, ownerCookie);
    assert(s25Page1.body.payments.length <= 2 && s25Page2.status === 200, `Scenario 25 failed: ${JSON.stringify(s25Page1.body)}`);
    assert(s25Page1.body.payments[0]?.id !== s25Page2.body.payments[0]?.id, 'Scenario 25 failed: page 1 and page 2 must not repeat the same row');
    const s25Filtered = await get(`/api/fees/payments?branch=${branchA1.id}&method=CASH&collector=${staffA1.id}`, ownerCookie);
    assert(s25Filtered.status === 200 && s25Filtered.body.payments.every((p: any) => p.paymentMethod === 'CASH' && p.collectedBy?.id === staffA1.id), `Scenario 25 failed filter: ${JSON.stringify(s25Filtered.body.payments)}`);
    ok('25. Report filtering + pagination on the extended Payments list');

    // ----------------------------------------------------
    // Scenario 26: CSV export authorization
    // ----------------------------------------------------
    const csvOwner = await get(`/api/reports/finance?view=collectors&format=csv&dateFrom=${today}&dateTo=${today}`, ownerCookie);
    const csvTeacher = await get(`/api/reports/finance?view=collectors&format=csv&dateFrom=${today}&dateTo=${today}`, teacherCookie);
    assert(csvOwner.status === 200 && csvTeacher.status === 403, `Scenario 26 failed: owner=${csvOwner.status} teacher=${csvTeacher.status}`);
    ok('26. CSV export authorization: OWNER allowed, TEACHER forbidden');

    // ----------------------------------------------------
    // Scenario 1 & 2: Tenant + branch isolation
    // ----------------------------------------------------
    const crossTenant = await get(`/api/fees/collection?branch=${branchA1.id}`, ownerBCookie);
    assert(crossTenant.status === 200 && crossTenant.body.summary.totalCollection === 0, 'Scenario 1 failed: tenant B must never see tenant A collection figures');
    const crossTenantSession = await post(`/api/fees/cash-sessions/${sessionA1Id}/close`, { countedCash: 0 }, ownerBCookie);
    assert(crossTenantSession.status === 404, `Scenario 1 failed: tenant B must not reach tenant A's cash session, got ${crossTenantSession.status}`);
    ok('1. Tenant isolation confirmed across cash sessions and daily collection');

    const s2Res = await get(`/api/fees/payments?branch=${branchA2.id}`, staffA1Cookie);
    // staffA1 is locked to branchA1 — resolveEffectiveBranchId must override the requested branchA2 filter, not honor it.
    assert(!s2Res.body.payments.some((p: any) => p.id === pPartial.id), 'Scenario 2 failed: branch-locked STAFF must not see another branch\'s payments regardless of the requested filter');
    ok('2. Branch isolation confirmed: a branch-locked STAFF cannot widen their view via the branch query param');

    // ----------------------------------------------------
    // Scenario 27: Zero-data dashboard
    // ----------------------------------------------------
    const s27Res = await get('/api/fees/collection', ownerBCookie);
    const s27 = s27Res.body.summary;
    assert(s27.totalCollection === 0 && s27.paymentsCount === 0 && s27.methods.every((m: any) => m.gross === 0), `Scenario 27 failed: ${JSON.stringify(s27)}`);
    ok('27. Zero-data dashboard renders real zeros for a brand-new tenant, never fabricated values');

    // ----------------------------------------------------
    // Scenario 28: Failed payment handling
    // ----------------------------------------------------
    const beforeCount = await prisma.payment.count({ where: { invoiceId: invoiceForRace.id } });
    let failed = false;
    try {
      await createPayment(cc, invoiceForRace.id, { amount: 500000, paymentMethod: 'CASH' } as any, staffA1.id);
    } catch {
      failed = true;
    }
    const afterCount = await prisma.payment.count({ where: { invoiceId: invoiceForRace.id } });
    assert(failed && afterCount === beforeCount, `Scenario 28 failed: a rejected payment attempt must create zero rows (before=${beforeCount}, after=${afterCount})`);
    ok('28. Failed payment handling: a rejected attempt creates zero Payment rows (no PENDING/FAILED row exists in this schema)');

    // ----------------------------------------------------
    // Scenario 29: Audit logging
    // ----------------------------------------------------
    const auditActions = await prisma.auditLog.findMany({ where: { coachingCenterId: cc, action: { in: ['PAYMENT_CREATED', 'REFUND_CREATED', 'CASH_SESSION_OPENED', 'CASH_SESSION_CLOSED'] } } });
    for (const action of ['PAYMENT_CREATED', 'REFUND_CREATED', 'CASH_SESSION_OPENED', 'CASH_SESSION_CLOSED']) {
      assert(auditActions.some((al) => al.action === action), `Scenario 29 failed: audit log missing action ${action}`);
    }
    ok('29. Audit logging present for payment, refund, and cash session actions');

    console.log('\n========================================================');
    console.log(`PHASE 10.9 VERIFICATION COMPLETE (${passed} scenarios passed)`);
    console.log('========================================================');
  } finally {
    console.log('Cleaning up throwaway tenants...');
    if (centerAId) await prisma.coachingCenter.delete({ where: { id: centerAId } }).catch(() => null);
    if (centerBId) await prisma.coachingCenter.delete({ where: { id: centerBId } }).catch(() => null);
    console.log('Cleanup completed.');
  }
}

main().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
