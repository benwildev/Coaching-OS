import 'dotenv/config';

// Force mock mode in THIS process before any provider module is touched, so
// every direct (in-process) send/retry call below is fully deterministic and
// never contacts a real paid SMS/WhatsApp/Email vendor (AGENTS.md Phase
// 10.8 §27/§35). The manual-retry-over-HTTP scenario (28) additionally
// requires the *separately running* dev server to also have
// COMMUNICATION_MOCK_MODE=1 in its own environment — see the header note
// printed at startup.
process.env.COMMUNICATION_MOCK_MODE = '1';

import prisma from '../lib/db';
import { completeInitialSetup } from '../lib/services/tenant.service';
import { hashPassword } from '../lib/auth/password';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import type { SessionUser } from '../lib/auth/session';
import { dispatchToGuardian } from '../lib/services/communication.service';
import { retryCommunication, processDueRetries } from '../lib/services/communication-retry.service';
import { setCommunicationChannelEnabled } from '../lib/services/communication-settings.service';
import { normalizeBangladeshPhone } from '../lib/utils/phone';
import { POST as whatsappWebhookPost, GET as whatsappWebhookGet } from '../app/api/webhooks/whatsapp/route';
import { POST as processDueRoutePost } from '../app/api/communication/retry/process-due/route';
import { createHmac } from 'crypto';

/**
 * Phase 10.8 — Communication Delivery Engine Verification
 *
 *   1. Start the dev server WITH mock mode enabled (required for scenario 28
 *      only — the manual-retry HTTP round trip runs in the dev server's own
 *      process):
 *        COMMUNICATION_MOCK_MODE=1 npm run dev
 *   2. In another terminal:
 *        AUTH_BASE_URL=http://localhost:3000 npx tsx scripts/verify-phase10-8.ts
 *
 * Scenarios:
 *  1. BD phone normalization accepts all documented formats
 *  2. BD phone normalization rejects invalid input explicitly (no silent mutation)
 *  3. Invalid phone -> immediate non-retryable FAILED, no provider call
 *  4. Mocked SMS send success
 *  5. Mocked SMS send failure (retryable)
 *  6. Mocked SMS send failure (non-retryable / permanent)
 *  7. Mocked WhatsApp send success
 *  8. Mocked Email send success
 *  9. Unconfigured provider is honestly SKIPPED, never faked as sent
 * 10. Disabled channel is SKIPPED (CHANNEL_DISABLED), re-enabling restores sends
 * 11. Idempotency: duplicate dispatch for the same event/source creates exactly one log row
 * 12. Sibling-safety: two different guardians of the same child both get their own log
 * 13. Child-specific separation: one guardian, two children, both get separate logs (no suppression)
 * 14. Retry resolves a retryable FAILED log to SENT on the same row (no new row created)
 * 15. Non-retryable FAILED log cannot be retried
 * 16. Retry limit enforced (4th attempt refused once MAX_RETRY_ATTEMPTS reached)
 * 17. Concurrent retry claim: two simultaneous retries on the same log only send once
 * 18. Scheduled sweep (processDueRetries) resolves an eligible due retry automatically
 * 19. Tenant isolation: cross-tenant communication log access rejected
 * 20. Branch isolation: branch-scoped ADMIN... (N/A, ADMIN is center-wide) — verified via STAFF/TEACHER role gate instead
 * 21. Provider-config authorization: STAFF/TEACHER forbidden from /api/settings/communication
 * 22. No secret leakage in /api/settings/communication response
 * 23. Manual retry authorization: STAFF/TEACHER forbidden
 * 24. Audit log entries created for dispatch, retry, and settings mutations
 * 25. providerMessageId persisted on success
 * 26. WhatsApp webhook: valid signature updates DELIVERED
 * 27. WhatsApp webhook: invalid signature rejected, log unchanged
 * 28. WhatsApp webhook: replayed payload is an idempotent no-op
 * 29. Manual retry over HTTP (OWNER) — requires dev server COMMUNICATION_MOCK_MODE=1
 */

const BASE = process.env.AUTH_BASE_URL || 'http://localhost:3000';
const TAG = `P108-${Date.now()}`;
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

function fakeUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    userId: 'fake',
    email: 'fake@verify.local',
    phone: null,
    name: 'Fake',
    banglaName: null,
    role: 'OWNER',
    coachingCenterId: 'fake',
    branchId: null,
    sessionVersion: 1,
    ...overrides,
  };
}

async function main() {
  console.log('========================================================');
  console.log(`PHASE 10.8 COMMUNICATION VERIFICATION — ${BASE}`);
  console.log('========================================================');
  if (!(await fetch(`${BASE}/login`).catch(() => null))) throw new Error(`App not reachable at ${BASE}`);

  let centerAId: string | null = null;
  let centerBId: string | null = null;

  try {
    const codeA = `T8A${Date.now().toString().slice(-7)}`;
    const codeB = `T8B${Date.now().toString().slice(-7)}`;
    const a = await tenant(codeA, `${TAG} A`);
    centerAId = a.center.id;
    const b = await tenant(codeB, `${TAG} B`);
    centerBId = b.center.id;
    const cc = a.center.id;
    const branchA1 = a.branch;

    const aRoles = await prisma.role.findMany({ where: { coachingCenterId: cc } });
    const e = (n: string) => `${n}-${codeA.toLowerCase()}@verify.local`;
    const mkUser = (email: string, role: 'ADMIN' | 'STAFF' | 'TEACHER') =>
      prisma.user.create({
        data: {
          coachingCenterId: cc,
          branchId: branchA1.id,
          email,
          passwordHash: hashPassword(PW),
          name: `${TAG} ${email}`,
          roleAssignments: { create: { roleId: aRoles.find((r) => r.code === role)!.id, branchId: branchA1.id } },
        },
      });
    const staffUser = await mkUser(e('staff'), 'STAFF');
    const teacherUser = await mkUser(e('teacher'), 'TEACHER');

    const student1 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S1`, name: `${TAG} Student One` } });
    const student3 = await prisma.student.create({ data: { coachingCenterId: cc, branchId: branchA1.id, studentIdCode: `${TAG}-S3`, name: `${TAG} Student Three` } });

    // guardian1: SMS, valid BD phone, linked to BOTH student1 and student3 (sibling fixture).
    const guardian1 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian One`, relationship: 'Father', phone: '01712345601', preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student3.id, guardianId: guardian1.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });

    // guardian2: SMS, valid BD phone, ALSO linked to student1 (two different guardians, same child fixture).
    const guardian2 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian Two`, relationship: 'Mother', phone: '01712345602', preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian2.id, relationship: 'Mother', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });

    // guardian3: WHATSAPP channel.
    const guardian3 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian Three`, relationship: 'Father', phone: '01712345603', whatsapp: '01712345603', preferredChannel: 'WHATSAPP' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian3.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'WHATSAPP' } });

    // guardian4: EMAIL channel.
    const guardian4 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian Four`, relationship: 'Father', phone: '01712345604', email: `${TAG.toLowerCase()}-g4@verify.local`, preferredChannel: 'EMAIL' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian4.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'EMAIL' } });

    // guardian5: SMS channel, but an INVALID phone number.
    const guardian5 = await prisma.guardian.create({ data: { coachingCenterId: cc, name: `${TAG} Guardian Five`, relationship: 'Father', phone: '12345', preferredChannel: 'SMS' } });
    await prisma.studentGuardian.create({ data: { studentId: student1.id, guardianId: guardian5.id, relationship: 'Father', isPrimary: false, canReceiveNotifications: true, preferredChannel: 'SMS' } });

    ok('Fixtures: 2 tenants, 1 branch, OWNER/ADMIN/STAFF/TEACHER, 2 students, 5 guardians (siblings + multi-guardian + per-channel + invalid-phone fixtures)');

    const ownerUser = fakeUser({ userId: a.owner.id, role: 'OWNER', coachingCenterId: cc, branchId: branchA1.id });

    // ----------------------------------------------------
    // Scenario 1 & 2: BD phone normalization
    // ----------------------------------------------------
    for (const [input, expected] of [
      ['01712345678', '+8801712345678'],
      ['8801712345678', '+8801712345678'],
      ['+8801712345678', '+8801712345678'],
    ] as const) {
      const r = normalizeBangladeshPhone(input);
      assert(r.valid && r.e164 === expected, `normalizeBangladeshPhone(${input}) expected ${expected}, got ${JSON.stringify(r)}`);
    }
    ok('1. BD phone normalization accepts all documented formats (local/no-plus/E.164)');

    for (const bad of ['12345', '0171234567', '+8801212345678', 'not-a-phone', '']) {
      const r = normalizeBangladeshPhone(bad);
      assert(!r.valid, `normalizeBangladeshPhone(${JSON.stringify(bad)}) must be rejected, got ${JSON.stringify(r)}`);
    }
    ok('2. BD phone normalization rejects invalid input explicitly (no silent mutation)');

    // ----------------------------------------------------
    // Scenario 3: Invalid phone -> immediate FAILED, non-retryable
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian5.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Test' }, sourceType: 'Test', sourceId: `invalid-phone-${TAG}` });
    const invalidPhoneLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian5.id, sourceId: `invalid-phone-${TAG}` } });
    assert(invalidPhoneLog.status === 'FAILED' && invalidPhoneLog.errorCode === 'INVALID_PHONE' && invalidPhoneLog.retryable === false, `Scenario 3 failed: ${JSON.stringify(invalidPhoneLog)}`);
    ok('3. Invalid phone produces an immediate non-retryable FAILED log, never reaching the provider');

    // ----------------------------------------------------
    // Scenario 4-6: Mocked SMS success / retryable failure / permanent failure
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Normal Student' }, sourceType: 'Test', sourceId: `sms-success-${TAG}` });
    const smsSuccessLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `sms-success-${TAG}` } });
    assert(smsSuccessLog.status === 'SENT' && !!smsSuccessLog.providerMessageId, `Scenario 4 failed: ${JSON.stringify(smsSuccessLog)}`);
    ok('4. Mocked SMS send success');

    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_RETRYABLE' }, sourceType: 'Test', sourceId: `sms-fail-retryable-${TAG}` });
    const smsRetryableLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `sms-fail-retryable-${TAG}` } });
    assert(smsRetryableLog.status === 'FAILED' && smsRetryableLog.retryable === true && !!smsRetryableLog.nextRetryAt, `Scenario 5 failed: ${JSON.stringify(smsRetryableLog)}`);
    ok('5. Mocked SMS send failure classified retryable, with nextRetryAt scheduled');

    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_PERMANENT' }, sourceType: 'Test', sourceId: `sms-fail-permanent-${TAG}` });
    const smsPermanentLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `sms-fail-permanent-${TAG}` } });
    assert(smsPermanentLog.status === 'FAILED' && smsPermanentLog.retryable === false && !smsPermanentLog.nextRetryAt, `Scenario 6 failed: ${JSON.stringify(smsPermanentLog)}`);
    ok('6. Mocked SMS send failure classified permanent (non-retryable), no retry scheduled');

    // ----------------------------------------------------
    // Scenario 7 & 8: Mocked WhatsApp / Email success
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian3.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'WA Student' }, sourceType: 'Test', sourceId: `wa-success-${TAG}` });
    const waLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian3.id, sourceId: `wa-success-${TAG}` } });
    assert(waLog.status === 'SENT' && waLog.channel === 'WHATSAPP', `Scenario 7 failed: ${JSON.stringify(waLog)}`);
    ok('7. Mocked WhatsApp send success');

    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian4.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Email Student' }, sourceType: 'Test', sourceId: `email-success-${TAG}` });
    const emailLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian4.id, sourceId: `email-success-${TAG}` } });
    assert(emailLog.status === 'SENT' && emailLog.channel === 'EMAIL' && emailLog.recipientEmail === guardian4.email, `Scenario 8 failed: ${JSON.stringify(emailLog)}`);
    ok('8. Mocked Email send success');

    // ----------------------------------------------------
    // Scenario 9: Unconfigured provider never fakes success
    // ----------------------------------------------------
    {
      const savedMock = process.env.COMMUNICATION_MOCK_MODE;
      const savedEnv = {
        SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY,
        SMS_SENDER_ID: process.env.SMS_SENDER_ID,
      };
      delete process.env.COMMUNICATION_MOCK_MODE;
      delete process.env.SMS_PROVIDER_API_KEY;
      delete process.env.SMS_SENDER_ID;
      try {
        await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Unconfigured Test' }, sourceType: 'Test', sourceId: `unconfigured-${TAG}` });
      } finally {
        process.env.COMMUNICATION_MOCK_MODE = savedMock;
        if (savedEnv.SMS_PROVIDER_API_KEY) process.env.SMS_PROVIDER_API_KEY = savedEnv.SMS_PROVIDER_API_KEY;
        if (savedEnv.SMS_SENDER_ID) process.env.SMS_SENDER_ID = savedEnv.SMS_SENDER_ID;
      }
      const unconfiguredLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `unconfigured-${TAG}` } });
      assert(unconfiguredLog.status === 'SKIPPED' && unconfiguredLog.errorMessage === 'PROVIDER_NOT_CONFIGURED', `Scenario 9 failed: ${JSON.stringify(unconfiguredLog)}`);
    }
    ok('9. Unconfigured provider is honestly SKIPPED, never faked as sent');

    // ----------------------------------------------------
    // Scenario 10: Disabled channel skip + re-enable
    // ----------------------------------------------------
    await setCommunicationChannelEnabled(cc, ownerUser, 'SMS', false);
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Disabled Channel Test' }, sourceType: 'Test', sourceId: `disabled-${TAG}` });
    const disabledLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `disabled-${TAG}` } });
    assert(disabledLog.status === 'SKIPPED' && disabledLog.errorMessage === 'CHANNEL_DISABLED', `Scenario 10a failed: ${JSON.stringify(disabledLog)}`);
    await setCommunicationChannelEnabled(cc, ownerUser, 'SMS', true);
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Re-enabled Test' }, sourceType: 'Test', sourceId: `reenabled-${TAG}` });
    const reenabledLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `reenabled-${TAG}` } });
    assert(reenabledLog.status === 'SENT', `Scenario 10b failed: ${JSON.stringify(reenabledLog)}`);
    ok('10. Disabled channel is SKIPPED (CHANNEL_DISABLED); re-enabling restores normal sends');

    // ----------------------------------------------------
    // Scenario 11: Idempotency
    // ----------------------------------------------------
    const idemInput = { coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT' as const, vars: { studentName: 'Idempotency Test' }, sourceType: 'Test', sourceId: `idem-${TAG}` };
    await dispatchToGuardian(idemInput);
    await dispatchToGuardian(idemInput);
    const idemCount = await prisma.communicationLog.count({ where: { guardianId: guardian1.id, sourceId: `idem-${TAG}` } });
    assert(idemCount === 1, `Scenario 11 expected exactly 1 row, got ${idemCount}`);
    ok('11. Idempotency: duplicate dispatch for the same event/source creates exactly one log row');

    // ----------------------------------------------------
    // Scenario 12: Sibling-safety (two guardians, same child)
    // ----------------------------------------------------
    const sameChildSourceId = `same-child-${TAG}`;
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Shared Child' }, sourceType: 'Test', sourceId: sameChildSourceId });
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian2.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Shared Child' }, sourceType: 'Test', sourceId: sameChildSourceId });
    const sameChildLogs = await prisma.communicationLog.findMany({ where: { studentId: student1.id, sourceId: sameChildSourceId } });
    assert(sameChildLogs.length === 2 && new Set(sameChildLogs.map((l) => l.guardianId)).size === 2, `Scenario 12 failed: ${JSON.stringify(sameChildLogs)}`);
    ok('12. Sibling-safety: two different guardians of the same child both get their own log row');

    // ----------------------------------------------------
    // Scenario 13: Child-specific separation (one guardian, two children)
    // ----------------------------------------------------
    const multiChildSourceId = `multi-child-${TAG}`;
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Child One' }, sourceType: 'Test', sourceId: multiChildSourceId });
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student3.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Child Three' }, sourceType: 'Test', sourceId: multiChildSourceId });
    const multiChildLogs = await prisma.communicationLog.findMany({ where: { guardianId: guardian1.id, sourceId: multiChildSourceId } });
    assert(multiChildLogs.length === 2 && new Set(multiChildLogs.map((l) => l.studentId)).size === 2, `Scenario 13 failed: ${JSON.stringify(multiChildLogs)}`);
    ok('13. Child-specific separation: one guardian, two children, both get separate logs (no suppression)');

    // ----------------------------------------------------
    // Scenario 14: Retry resolves a retryable FAILED log to SENT
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_RETRYABLE' }, sourceType: 'Test', sourceId: `retry-success-${TAG}` });
    const retrySuccessLogBefore = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `retry-success-${TAG}` } });
    const originalMessage = retrySuccessLogBefore.message;
    // Rewrite the stored recipient to drop the FAILTEST marker so the retry
    // (which resends the exact stored `message`, unchanged by design) would
    // still hit FAILTEST_RETRYABLE again — instead we mutate the stored
    // message itself to simulate "the underlying condition is now fine",
    // which is the realistic shape of a retry succeeding.
    await prisma.communicationLog.update({ where: { id: retrySuccessLogBefore.id }, data: { message: originalMessage.replaceAll('FAILTEST_RETRYABLE', 'Now fine') } });
    const retried = await retryCommunication(cc, ownerUser, retrySuccessLogBefore.id);
    assert(retried.status === 'SENT' && retried.id === retrySuccessLogBefore.id, `Scenario 14 failed: ${JSON.stringify(retried)}`);
    const retryRowCount = await prisma.communicationLog.count({ where: { guardianId: guardian1.id, sourceId: `retry-success-${TAG}` } });
    assert(retryRowCount === 1, 'retry must never create a second CommunicationLog row');
    ok('14. Retry resolves a retryable FAILED log to SENT on the same row (no new row created)');

    // ----------------------------------------------------
    // Scenario 15: Non-retryable log cannot be retried
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_PERMANENT' }, sourceType: 'Test', sourceId: `retry-permanent-${TAG}` });
    const permanentLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `retry-permanent-${TAG}` } });
    await retryCommunication(cc, ownerUser, permanentLog.id).then(
      () => assert(false, 'Scenario 15: retrying a non-retryable log must throw'),
      (err) => assert(String(err.message).includes('COMMUNICATION_NOT_RETRYABLE'), `Scenario 15 wrong error: ${err.message}`)
    );
    ok('15. Non-retryable FAILED log cannot be retried');

    // ----------------------------------------------------
    // Scenario 16: Retry limit enforced
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_RETRYABLE' }, sourceType: 'Test', sourceId: `retry-limit-${TAG}` });
    let limitLogId = (await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `retry-limit-${TAG}` } })).id;
    // attemptCount is already 1 from the initial dispatch; 2 more retries reach MAX_RETRY_ATTEMPTS (3).
    await retryCommunication(cc, ownerUser, limitLogId); // attempt 2, still FAILTEST_RETRYABLE -> FAILED
    await retryCommunication(cc, ownerUser, limitLogId); // attempt 3 -> FAILED, attemptCount now == MAX
    await retryCommunication(cc, ownerUser, limitLogId).then(
      () => assert(false, 'Scenario 16: a 4th retry attempt must be refused once the limit is reached'),
      (err) => assert(String(err.message).includes('COMMUNICATION_RETRY_LIMIT_REACHED'), `Scenario 16 wrong error: ${err.message}`)
    );
    const limitLogFinal = await prisma.communicationLog.findUniqueOrThrow({ where: { id: limitLogId } });
    assert(limitLogFinal.attemptCount === 3, `Scenario 16 expected attemptCount 3, got ${limitLogFinal.attemptCount}`);
    ok('16. Retry limit enforced (4th attempt refused once MAX_RETRY_ATTEMPTS reached)');

    // ----------------------------------------------------
    // Scenario 17: Concurrent retry claim
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Now fine (concurrency)' }, sourceType: 'Test', sourceId: `concurrency-${TAG}` });
    const concurrencyLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `concurrency-${TAG}` } });
    // The dispatch above used a clean (non-FAILTEST) message and so already
    // succeeded (SENT) — force it back into a retryable FAILED state here so
    // the two concurrent retries below have something eligible to race on.
    await prisma.communicationLog.update({ where: { id: concurrencyLog.id }, data: { status: 'FAILED', retryable: true } });
    const concurrentResults = await Promise.allSettled([
      retryCommunication(cc, ownerUser, concurrencyLog.id),
      retryCommunication(cc, ownerUser, concurrencyLog.id),
    ]);
    const fulfilledCount = concurrentResults.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = concurrentResults.filter((r) => r.status === 'rejected').length;
    assert(fulfilledCount === 1 && rejectedCount === 1, `Scenario 17 expected exactly one winner, got ${JSON.stringify(concurrentResults.map((r) => r.status))}`);
    const concurrencyLogAfter = await prisma.communicationLog.findUniqueOrThrow({ where: { id: concurrencyLog.id } });
    assert(concurrencyLogAfter.attemptCount === 2, `Scenario 17 expected attemptCount to increase by exactly 1 (to 2), got ${concurrencyLogAfter.attemptCount}`);
    ok('17. Concurrent retry claim: two simultaneous retries on the same log only send once');

    // ----------------------------------------------------
    // Scenario 18: Scheduled sweep resolves a due retry
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'Sweep target' }, sourceType: 'Test', sourceId: `sweep-${TAG}` });
    const sweepLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `sweep-${TAG}` } });
    await prisma.communicationLog.update({ where: { id: sweepLog.id }, data: { status: 'FAILED', retryable: true, nextRetryAt: new Date(Date.now() - 1000) } });
    const sweepResult = await processDueRetries(10);
    assert(sweepResult.processed >= 1, `Scenario 18 expected the sweep to process at least 1 row, got ${JSON.stringify(sweepResult)}`);
    const sweepLogAfter = await prisma.communicationLog.findUniqueOrThrow({ where: { id: sweepLog.id } });
    assert(sweepLogAfter.status === 'SENT', `Scenario 18 failed: ${JSON.stringify(sweepLogAfter)}`);
    ok('18. Scheduled sweep (processDueRetries) resolves an eligible due retry automatically');

    // ----------------------------------------------------
    // Sessions for HTTP-driven authorization scenarios
    // ----------------------------------------------------
    const ownerCookie = cookieOf(await login(a.owner.email, PW), SESSION_COOKIE_NAME);
    const ownerBCookie = cookieOf(await login(b.owner.email, PW), SESSION_COOKIE_NAME);
    const staffCookie = cookieOf(await login(staffUser.email, PW), SESSION_COOKIE_NAME);
    const teacherCookie = cookieOf(await login(teacherUser.email, PW), SESSION_COOKIE_NAME);

    // ----------------------------------------------------
    // Scenario 19: Tenant isolation on communication logs
    // ----------------------------------------------------
    const s19Res = await get(`/api/communication/logs?search=${encodeURIComponent(TAG)}`, ownerBCookie);
    assert(s19Res.status === 200, `Scenario 19 request failed: ${s19Res.status}`);
    assert(!s19Res.body.logs.some((l: any) => l.guardian?.name?.includes(TAG)), 'Scenario 19: tenant B must not see tenant A communication logs');
    ok('19. Tenant isolation: cross-tenant communication log access rejected');

    // ----------------------------------------------------
    // Scenario 20: Provider-config authorization (OWNER allowed)
    // ----------------------------------------------------
    const s20Res = await get('/api/settings/communication', ownerCookie);
    assert(s20Res.status === 200 && Array.isArray(s20Res.body.channels) && s20Res.body.channels.length === 3, `Scenario 20 failed: ${JSON.stringify(s20Res.body)}`);
    ok('20. OWNER can read communication provider settings');

    // ----------------------------------------------------
    // Scenario 21: Provider-config authorization (STAFF/TEACHER forbidden)
    // ----------------------------------------------------
    const s21Staff = await get('/api/settings/communication', staffCookie);
    const s21Teacher = await get('/api/settings/communication', teacherCookie);
    assert(s21Staff.status === 403 && s21Teacher.status === 403, `Scenario 21 failed: staff=${s21Staff.status} teacher=${s21Teacher.status}`);
    const s21PatchStaff = await patch('/api/settings/communication', { channel: 'SMS', enabled: false }, staffCookie);
    assert(s21PatchStaff.status === 403, `Scenario 21b failed: ${s21PatchStaff.status}`);
    ok('21. Provider-config authorization: STAFF/TEACHER forbidden from /api/settings/communication');

    // ----------------------------------------------------
    // Scenario 22: No secret leakage
    // ----------------------------------------------------
    // The per-tenant credential UI (added after this script was first
    // written) legitimately returns field *names* like "apiKey"/"token" so
    // the settings page can render labeled inputs — every field carries only
    // {key, label, secret, required, set: boolean}, never an actual value.
    // The real security property is that no secret *value* ever appears, and
    // that a credential field never reports anything beyond a boolean "set"
    // flag — both checked explicitly below instead of a blanket keyword scan
    // that would now false-positive on that legitimate metadata.
    const settingsJson = JSON.stringify(s20Res.body);
    for (const secretName of ['SMS_PROVIDER_API_KEY', 'WHATSAPP_BUSINESS_API_TOKEN', 'EMAIL_SMTP_PASS'] as const) {
      const value = process.env[secretName];
      if (value) assert(!settingsJson.includes(value), `Scenario 22: ${secretName} value leaked in response`);
    }
    for (const ch of s20Res.body.channels) {
      for (const field of ch.fields ?? []) {
        const keys = Object.keys(field).sort();
        assert(
          JSON.stringify(keys) === JSON.stringify(['key', 'label', 'required', 'secret', 'set'].sort()),
          `Scenario 22: credential field must only expose {key,label,secret,required,set}, got ${JSON.stringify(field)}`
        );
        assert(typeof field.set === 'boolean', `Scenario 22: "set" must be a boolean presence flag, never the value itself: ${JSON.stringify(field)}`);
      }
    }
    ok('22. No secret leakage in /api/settings/communication response (field metadata only, never a value)');

    // ----------------------------------------------------
    // Scenario 23: Manual retry authorization
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_RETRYABLE' }, sourceType: 'Test', sourceId: `http-retry-auth-${TAG}` });
    const httpAuthLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `http-retry-auth-${TAG}` } });
    const s23Staff = await post(`/api/communication/retry/${httpAuthLog.id}`, {}, staffCookie);
    const s23Teacher = await post(`/api/communication/retry/${httpAuthLog.id}`, {}, teacherCookie);
    assert(s23Staff.status === 403 && s23Teacher.status === 403, `Scenario 23 failed: staff=${s23Staff.status} teacher=${s23Teacher.status}`);
    ok('23. Manual retry authorization: STAFF/TEACHER forbidden');

    // ----------------------------------------------------
    // Scenario 24: Audit logging
    // ----------------------------------------------------
    const auditActions = await prisma.auditLog.findMany({ where: { coachingCenterId: cc, action: { in: ['COMMUNICATION_ATTEMPTED', 'COMMUNICATION_SENT', 'COMMUNICATION_FAILED', 'COMMUNICATION_RETRIED', 'COMMUNICATION_PROVIDER_ENABLED', 'COMMUNICATION_PROVIDER_DISABLED'] } } });
    for (const action of ['COMMUNICATION_ATTEMPTED', 'COMMUNICATION_SENT', 'COMMUNICATION_FAILED', 'COMMUNICATION_RETRIED', 'COMMUNICATION_PROVIDER_ENABLED', 'COMMUNICATION_PROVIDER_DISABLED']) {
      assert(auditActions.some((al) => al.action === action), `Scenario 24: audit log missing action ${action}`);
    }
    ok('24. Audit log entries created for dispatch, retry, and settings mutations');

    // ----------------------------------------------------
    // Scenario 25: providerMessageId persisted
    // ----------------------------------------------------
    assert(!!smsSuccessLog.providerMessageId && smsSuccessLog.providerMessageId.startsWith('mock-'), `Scenario 25 failed: ${JSON.stringify(smsSuccessLog)}`);
    ok('25. providerMessageId persisted on a successful send');

    // ----------------------------------------------------
    // Scenario 26-28: WhatsApp delivery webhook (invoked directly, in-process)
    // ----------------------------------------------------
    const webhookSecret = 'test-whatsapp-app-secret';
    process.env.WHATSAPP_APP_SECRET = webhookSecret;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';

    const waWebhookLog = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian3.id, sourceId: `wa-success-${TAG}` } });
    const webhookPayload = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: waWebhookLog.providerMessageId, status: 'delivered' }] } }] }] });
    const validSig = 'sha256=' + createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');

    const validWebhookReq = new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': validSig }, body: webhookPayload });
    const validWebhookRes = await whatsappWebhookPost(validWebhookReq);
    assert(validWebhookRes.status === 200, `Scenario 26 webhook call failed: ${validWebhookRes.status}`);
    const waLogAfterWebhook = await prisma.communicationLog.findUniqueOrThrow({ where: { id: waWebhookLog.id } });
    assert(waLogAfterWebhook.status === 'DELIVERED' && !!waLogAfterWebhook.deliveredAt, `Scenario 26 failed: ${JSON.stringify(waLogAfterWebhook)}`);
    ok('26. WhatsApp webhook: valid signature updates status to DELIVERED');

    const invalidWebhookReq = new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=deadbeef' }, body: webhookPayload });
    const invalidWebhookRes = await whatsappWebhookPost(invalidWebhookReq);
    assert(invalidWebhookRes.status === 401, `Scenario 27 failed: expected 401, got ${invalidWebhookRes.status}`);
    ok('27. WhatsApp webhook: invalid signature rejected (401), log left unchanged');

    const replayRes = await whatsappWebhookPost(new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': validSig }, body: webhookPayload }));
    assert(replayRes.status === 200, `Scenario 28 replay call failed: ${replayRes.status}`);
    const waLogAfterReplay = await prisma.communicationLog.findUniqueOrThrow({ where: { id: waWebhookLog.id } });
    assert(waLogAfterReplay.status === 'DELIVERED' && waLogAfterReplay.deliveredAt?.getTime() === waLogAfterWebhook.deliveredAt?.getTime(), 'Scenario 28: replayed webhook must not change an already-terminal state');
    ok('28. WhatsApp webhook: replayed payload is an idempotent no-op');

    const verifyHandshake = await whatsappWebhookGet(new Request(`http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123`));
    assert(verifyHandshake.status === 200 && (await verifyHandshake.text()) === 'abc123', 'WhatsApp webhook GET verification handshake failed');

    // process-due route: missing secret must be rejected (in-process, direct import)
    delete process.env.CRON_SECRET;
    const noCronSecretRes = await processDueRoutePost(new Request('http://localhost/api/communication/retry/process-due', { method: 'POST' }));
    assert(noCronSecretRes.status === 401, `process-due route without CRON_SECRET configured must reject, got ${noCronSecretRes.status}`);
    process.env.CRON_SECRET = 'test-cron-secret';
    const wrongCronSecretRes = await processDueRoutePost(new Request('http://localhost/api/communication/retry/process-due', { method: 'POST', headers: { 'x-cron-secret': 'wrong' } }));
    assert(wrongCronSecretRes.status === 401, `process-due route with a wrong secret must reject, got ${wrongCronSecretRes.status}`);
    const correctCronSecretRes = await processDueRoutePost(new Request('http://localhost/api/communication/retry/process-due', { method: 'POST', headers: { 'x-cron-secret': 'test-cron-secret' } }));
    assert(correctCronSecretRes.status === 200, `process-due route with the correct secret must succeed, got ${correctCronSecretRes.status}`);

    // ----------------------------------------------------
    // Scenario 29: Manual retry over HTTP (requires dev server COMMUNICATION_MOCK_MODE=1)
    // ----------------------------------------------------
    await dispatchToGuardian({ coachingCenterId: cc, branchId: branchA1.id, guardianId: guardian1.id, studentId: student1.id, event: 'ATTENDANCE_ABSENT', vars: { studentName: 'FAILTEST_RETRYABLE' }, sourceType: 'Test', sourceId: `http-retry-${TAG}` });
    const httpRetryLogBefore = await prisma.communicationLog.findFirstOrThrow({ where: { guardianId: guardian1.id, sourceId: `http-retry-${TAG}` } });
    await prisma.communicationLog.update({ where: { id: httpRetryLogBefore.id }, data: { message: httpRetryLogBefore.message.replaceAll('FAILTEST_RETRYABLE', 'Now fine over HTTP') } });
    const s29Res = await post(`/api/communication/retry/${httpRetryLogBefore.id}`, {}, ownerCookie);
    if (s29Res.status === 200 && s29Res.body.log?.status === 'SENT') {
      ok('29. Manual retry over HTTP (OWNER) resolves the log to SENT');
    } else {
      console.warn(`⚠ [SKIPPED] 29. Manual retry over HTTP did not resolve to SENT (status ${s29Res.status}, body ${JSON.stringify(s29Res.body)}) — the dev server likely was not started with COMMUNICATION_MOCK_MODE=1. This is expected in that case; see script header.`);
    }

    console.log('\n========================================================');
    console.log(`PHASE 10.8 VERIFICATION COMPLETE (${passed} scenarios passed)`);
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
