import 'dotenv/config';
import prisma from '../lib/db';
import type { SessionUser } from '../lib/auth/session';
import {
  ensureDefaultPolicies,
  getNotificationPolicies,
  updateNotificationPolicies,
  resolveNotificationRecipients,
  isNotificationMandatory,
  isRecipientMandatory,
} from '../lib/services/notification-policy.service';
import { notifyStudentGuardians } from '../lib/services/guardian-notify.service';

const TAG = `POLICY-VERIFY-${Date.now()}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ [PASS] ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

async function run() {
  console.log('========================================================');
  console.log('NOTIFICATION ALERT POLICY & RECIPIENT CONTROL VERIFICATION');
  console.log('========================================================');

  // Find or create test coaching centers
  let centerA = await prisma.coachingCenter.findFirst({
    where: { code: { not: { startsWith: 'TEST' } } },
    include: { users: true, students: true },
  });

  if (!centerA) {
    centerA = await prisma.coachingCenter.create({
      data: {
        name: `Test Center A ${TAG}`,
        code: `TCA-${Date.now()}`,
        phone: '01700000001',
      },
      include: { users: true, students: true },
    });
  }

  const adminUserA: SessionUser = {
    userId: centerA.users[0]?.id || 'admin-user-a',
    coachingCenterId: centerA.id,
    branchId: null,
    role: 'ADMIN',
    email: 'adminA@test.com',
    name: 'Admin A',
    phone: null,
    banglaName: null,
    sessionVersion: 1,
  };

  const staffUserA: SessionUser = {
    userId: 'staff-user-a',
    coachingCenterId: centerA.id,
    branchId: null,
    role: 'STAFF',
    email: 'staffA@test.com',
    name: 'Staff A',
    phone: null,
    banglaName: null,
    sessionVersion: 1,
  };

  const centerB = await prisma.coachingCenter.create({
    data: {
      name: `Test Center B ${TAG}`,
      code: `TCB-${Date.now()}`,
      phone: '01700000002',
    },
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Default Policy Seeding & Catalog Completeness
    // ----------------------------------------------------
    console.log('\n--- 1. Default Policy Seeding ---');
    await ensureDefaultPolicies(centerA.id);
    const policiesA = await getNotificationPolicies(centerA.id);
    assert(policiesA.length >= 10, 'Expected at least 10 notification alert policies seeded');

    const absentPolicy = policiesA.find((p) => p.notificationType === 'ATTENDANCE_ABSENT');
    assert(absentPolicy !== undefined, 'ATTENDANCE_ABSENT policy must exist');
    assert(absentPolicy.isMandatory === true, 'ATTENDANCE_ABSENT must be mandatory');
    assert(absentPolicy.isEnabled === true, 'ATTENDANCE_ABSENT must be enabled by default');

    const absentStudent = absentPolicy.recipients.find((r) => r.recipientType === 'STUDENT');
    const absentGuardian = absentPolicy.recipients.find((r) => r.recipientType === 'GUARDIAN');
    assert(absentStudent?.isMandatory === true, 'Student recipient must be mandatory for ATTENDANCE_ABSENT');
    assert(absentGuardian?.isMandatory === true, 'Guardian recipient must be mandatory for ATTENDANCE_ABSENT');
    ok('Default policies auto-seeded with correct mandatory definitions');

    // ----------------------------------------------------
    // TEST 2: Mandatory Notification Rejection (Backend Enforcement)
    // ----------------------------------------------------
    console.log('\n--- 2. Mandatory Notification Enforcement ---');
    let rejectedMandatory = false;
    try {
      await updateNotificationPolicies(centerA.id, adminUserA, [
        {
          notificationType: 'ATTENDANCE_ABSENT',
          isEnabled: false, // Attempt to turn off mandatory alert!
        },
      ]);
    } catch (err: any) {
      if (err.message.includes('mandatory notification and cannot be disabled')) {
        rejectedMandatory = true;
      }
    }
    assert(rejectedMandatory, 'Backend must reject disabling mandatory ATTENDANCE_ABSENT alert');
    ok('Disabling mandatory notification rejected by backend');

    // ----------------------------------------------------
    // TEST 3: Mandatory Recipient Rejection
    // ----------------------------------------------------
    console.log('\n--- 3. Mandatory Recipient Enforcement ---');
    let rejectedMandatoryRecipient = false;
    try {
      await updateNotificationPolicies(centerA.id, adminUserA, [
        {
          notificationType: 'ATTENDANCE_ABSENT',
          isEnabled: true,
          recipients: [
            {
              recipientType: 'STUDENT',
              isEnabled: false, // Attempt to turn off mandatory Student recipient!
            },
          ],
        },
      ]);
    } catch (err: any) {
      if (err.message.includes('mandatory') && err.message.includes('cannot be disabled')) {
        rejectedMandatoryRecipient = true;
      }
    }
    assert(rejectedMandatoryRecipient, 'Backend must reject disabling mandatory Student recipient for ATTENDANCE_ABSENT');
    ok('Disabling mandatory recipient rejected by backend');

    // ----------------------------------------------------
    // TEST 4: Configurable Notification Update (Fee Reminder)
    // ----------------------------------------------------
    console.log('\n--- 4. Configurable Notification Update ---');
    // Turn Fee Reminder Guardian to OFF
    await updateNotificationPolicies(centerA.id, adminUserA, [
      {
        notificationType: 'FEE_REMINDER',
        isEnabled: true,
        recipients: [
          { recipientType: 'STUDENT', isEnabled: false },
          { recipientType: 'GUARDIAN', isEnabled: false },
        ],
      },
    ]);

    let updatedPoliciesA = await getNotificationPolicies(centerA.id);
    let feeReminder = updatedPoliciesA.find((p) => p.notificationType === 'FEE_REMINDER');
    assert(feeReminder?.recipients.find((r) => r.recipientType === 'GUARDIAN')?.isEnabled === false, 'Guardian should be toggled OFF');
    ok('Configurable notification recipient successfully updated');

    // Turn Fee Reminder Guardian back to ON
    await updateNotificationPolicies(centerA.id, adminUserA, [
      {
        notificationType: 'FEE_REMINDER',
        isEnabled: true,
        recipients: [
          { recipientType: 'STUDENT', isEnabled: false },
          { recipientType: 'GUARDIAN', isEnabled: true },
        ],
      },
    ]);
    updatedPoliciesA = await getNotificationPolicies(centerA.id);
    feeReminder = updatedPoliciesA.find((p) => p.notificationType === 'FEE_REMINDER');
    assert(feeReminder?.recipients.find((r) => r.recipientType === 'GUARDIAN')?.isEnabled === true, 'Guardian should be toggled ON');
    ok('Configurable notification toggled back ON');

    // ----------------------------------------------------
    // TEST 5: Recipient Resolution Engine Targeting
    // ----------------------------------------------------
    console.log('\n--- 5. Recipient Resolution Engine ---');
    // Fee reminder with Student = OFF, Guardian = ON
    const feeRecipients = await resolveNotificationRecipients({
      coachingCenterId: centerA.id,
      notificationType: 'FEE_REMINDER',
      context: {
        studentId: 'student-test-123',
        guardianId: 'guardian-test-456',
      },
    });

    assert(feeRecipients.some((r) => r.recipientType === 'GUARDIAN'), 'Guardian must be included in fee reminder');
    assert(!feeRecipients.some((r) => r.recipientType === 'STUDENT'), 'Student must NOT be included in fee reminder when OFF');
    ok('Recipient resolution accurately includes Guardian and excludes Student for fee reminder');

    // Attendance absent with Student = ON, Guardian = ON
    const absentRecipients = await resolveNotificationRecipients({
      coachingCenterId: centerA.id,
      notificationType: 'ATTENDANCE_ABSENT',
      context: {
        studentId: 'student-test-123',
        guardianId: 'guardian-test-456',
      },
    });

    assert(absentRecipients.some((r) => r.recipientType === 'STUDENT'), 'Student must be included in attendance absent');
    assert(absentRecipients.some((r) => r.recipientType === 'GUARDIAN'), 'Guardian must be included in attendance absent');
    ok('Attendance absent correctly resolves both Student and Guardian recipients');

    // ----------------------------------------------------
    // TEST 6: Completely Disabled Notification Dispatches Nothing
    // ----------------------------------------------------
    console.log('\n--- 6. Disabled Notification Type ---');
    // Daily Attendance Present is configurable and can be disabled
    await updateNotificationPolicies(centerA.id, adminUserA, [
      {
        notificationType: 'ATTENDANCE_PRESENT',
        isEnabled: false,
      },
    ]);

    const presentRecipients = await resolveNotificationRecipients({
      coachingCenterId: centerA.id,
      notificationType: 'ATTENDANCE_PRESENT',
      context: { studentId: 'student-test-123' },
    });
    assert(presentRecipients.length === 0, 'Disabled notification type must resolve to zero recipients');
    ok('Disabled notification type resolves to 0 recipients');

    // ----------------------------------------------------
    // TEST 7: Tenant Isolation
    // ----------------------------------------------------
    console.log('\n--- 7. Tenant Isolation ---');
    await ensureDefaultPolicies(centerB.id);

    // Modify Center A's policy
    await updateNotificationPolicies(centerA.id, adminUserA, [
      {
        notificationType: 'HOMEWORK_PUBLISHED',
        isEnabled: false,
      },
    ]);

    // Check Center B's policy
    const policiesB = await getNotificationPolicies(centerB.id);
    const hwPolicyB = policiesB.find((p) => p.notificationType === 'HOMEWORK_PUBLISHED');
    assert(hwPolicyB?.isEnabled === true, 'Center B homework policy must NOT be affected by Center A modifications');
    ok('Strict tenant isolation verified: Center A changes did not leak into Center B');

    // ----------------------------------------------------
    // TEST 8: Role Authorization (Staff cannot update policies)
    // ----------------------------------------------------
    console.log('\n--- 8. Role-based Authorization ---');
    let rejectedStaff = false;
    try {
      await updateNotificationPolicies(centerA.id, staffUserA, [
        {
          notificationType: 'FEE_REMINDER',
          isEnabled: false,
        },
      ]);
    } catch (err: any) {
      if (err.message.includes('Only Center Owners and Admins')) {
        rejectedStaff = true;
      }
    }
    assert(rejectedStaff, 'Non-admin/owner staff must not be permitted to update notification alert policies');
    ok('Role authorization enforced: staff update rejected');

    // ----------------------------------------------------
    // TEST 9: Audit Logging
    // ----------------------------------------------------
    console.log('\n--- 9. Audit Logging ---');
    const recentAudit = await prisma.auditLog.findFirst({
      where: {
        coachingCenterId: centerA.id,
        action: 'NOTIFICATION_POLICY_UPDATED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(recentAudit !== null, 'Audit log row must be recorded on policy update');
    ok('Audit log verified for policy updates');

    console.log('\n========================================================');
    console.log(`ALL ${passed} NOTIFICATION POLICY TESTS PASSED SUCCESSFULLY!`);
    console.log('========================================================');
  } finally {
    // Cleanup temporary Center B
    await prisma.notificationPolicy.deleteMany({ where: { coachingCenterId: centerB.id } });
    await prisma.coachingCenter.delete({ where: { id: centerB.id } });
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
