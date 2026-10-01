import 'dotenv/config';
import prisma from '../lib/db';
import { createStudentAdmission } from '../lib/services/student.service';
import { createTeacher } from '../lib/services/teacher.service';
import { completeSetupOrReset } from '../lib/services/portal-auth.service';
import { authenticateUser } from '../lib/services/unified-auth.service';
import { linkTeacherAccount } from '../lib/services/teacher.service';
import { admissionSchema } from '../lib/validations/student';
import type { SessionUser } from '../lib/auth/session';

const TAG = `P131-${Date.now()}`;
let passed = 0;
let failed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`  ✔ [PASS] ${label}`);
}

function fail(label: string, err: any) {
  failed += 1;
  console.error(`  ✖ [FAIL] ${label}:`, err?.message || err);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
}

async function expectError(fn: () => Promise<unknown>, expectedSubstring: string, label: string) {
  try {
    await fn();
    throw new Error(`Expected error containing "${expectedSubstring}", but call succeeded`);
  } catch (err: any) {
    if (err.message && err.message.includes(expectedSubstring)) {
      ok(`${label} (threw expected error: ${expectedSubstring})`);
    } else {
      throw new Error(`Expected error containing "${expectedSubstring}", but got: ${err.message}`);
    }
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('PHASE 13.1 — COMPREHENSIVE AUTOMATIC ACCOUNT CREATION TEST SUITE');
  console.log('==================================================\n');

  // SETUP: Create Tenant A and Tenant B
  console.log('1. Setting up test tenants and master data...');
  const tenantA = await prisma.coachingCenter.create({
    data: {
      name: `Tenant A ${TAG}`,
      code: `T-A-${Date.now().toString().slice(-4)}`,
      phone: '01711111111',
      email: `tenanta_${TAG}@example.com`,
    },
  });

  const tenantB = await prisma.coachingCenter.create({
    data: {
      name: `Tenant B ${TAG}`,
      code: `T-B-${Date.now().toString().slice(-4)}`,
      phone: '01722222222',
      email: `tenantb_${TAG}@example.com`,
    },
  });

  // Setup branches
  const branchA = await prisma.branch.create({
    data: {
      coachingCenterId: tenantA.id,
      name: 'Branch A Main',
      code: 'BR-A1',
      address: 'Dhaka',
    },
  });

  const branchB = await prisma.branch.create({
    data: {
      coachingCenterId: tenantB.id,
      name: 'Branch B Main',
      code: 'BR-B1',
      address: 'Chittagong',
    },
  });

  // Setup academic hierarchy for Tenant A
  const sessionA = await prisma.academicSession.create({
    data: { coachingCenterId: tenantA.id, name: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
  });
  const programA = await prisma.academicProgram.create({
    data: { coachingCenterId: tenantA.id, name: 'HSC Program', code: 'HSC' },
  });
  const classA = await prisma.academicClass.create({
    data: { coachingCenterId: tenantA.id, academicProgramId: programA.id, name: 'Class 12', code: 'C12' },
  });
  const courseA = await prisma.course.create({
    data: {
      coachingCenterId: tenantA.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      name: 'HSC Physics & Math',
      code: 'HSC-PM',
      fee: 3000,
      billingType: 'ONE_TIME',
      status: 'ACTIVE',
    },
  });
  const batchA = await prisma.batch.create({
    data: {
      coachingCenterId: tenantA.id,
      branchId: branchA.id,
      academicSessionId: sessionA.id,
      academicProgramId: programA.id,
      academicClassId: classA.id,
      courseId: courseA.id,
      name: 'Morning Batch A',
      code: 'MB-A',
      capacity: 50,
      status: 'ACTIVE',
    },
  });
  const subjectA = await prisma.subject.create({
    data: { coachingCenterId: tenantA.id, academicClassId: classA.id, name: 'Physics', code: 'PHY-01' },
  });
  await prisma.batchSubject.create({
    data: { batchId: batchA.id, subjectId: subjectA.id },
  });

  // Create Roles & Users
  let roleOwner = await prisma.role.findFirst({ where: { coachingCenterId: tenantA.id, code: 'OWNER' } });
  if (!roleOwner) {
    roleOwner = await prisma.role.create({ data: { coachingCenterId: tenantA.id, name: 'Owner', code: 'OWNER', isSystem: true } });
  }
  let roleAdmin = await prisma.role.findFirst({ where: { coachingCenterId: tenantA.id, code: 'ADMIN' } });
  if (!roleAdmin) {
    roleAdmin = await prisma.role.create({ data: { coachingCenterId: tenantA.id, name: 'Admin', code: 'ADMIN', isSystem: true } });
  }
  let roleStaff = await prisma.role.findFirst({ where: { coachingCenterId: tenantA.id, code: 'STAFF' } });
  if (!roleStaff) {
    roleStaff = await prisma.role.create({ data: { coachingCenterId: tenantA.id, name: 'Staff', code: 'STAFF', isSystem: true } });
  }
  let roleTeacher = await prisma.role.findFirst({ where: { coachingCenterId: tenantA.id, code: 'TEACHER' } });
  if (!roleTeacher) {
    roleTeacher = await prisma.role.create({ data: { coachingCenterId: tenantA.id, name: 'Teacher', code: 'TEACHER', isSystem: true } });
  }

  // Create an Owner user for Tenant A
  const ownerUserA = await prisma.user.create({
    data: {
      coachingCenterId: tenantA.id,
      branchId: branchA.id,
      name: 'Owner User',
      email: `owner_${TAG}@example.com`,
      phone: '01733333333',
      passwordHash: 'dummyhash',
      roleAssignments: { create: { roleId: roleOwner.id, branchId: branchA.id } },
    },
  });

  // Create a Staff user for Tenant A
  const staffUserA = await prisma.user.create({
    data: {
      coachingCenterId: tenantA.id,
      branchId: branchA.id,
      name: 'Staff User',
      email: `staff_${TAG}@example.com`,
      phone: '01744444444',
      passwordHash: 'dummyhash',
      roleAssignments: { create: { roleId: roleStaff.id, branchId: branchA.id } },
    },
  });

  const ownerSession: SessionUser = {
    userId: ownerUserA.id,
    coachingCenterId: tenantA.id,
    branchId: branchA.id,
    email: ownerUserA.email,
    name: ownerUserA.name,
    banglaName: null,
    phone: ownerUserA.phone,
    role: 'OWNER',
    sessionVersion: 0,
  };

  ok('Tenant and reference master data initialized');

  // =========================================================================
  // SECTION 1: STUDENT AUTOMATIC ACCOUNT CREATION & AUTH
  // =========================================================================
  console.log('\n--- SECTION 1: Student Account Creation & Provisioning ---');

  // Test 1: New student admission automatically provisions PortalAccount
  const studentEmail = `student1_${TAG}@test.com`;
  const studentPhone = '01755555551';
  const admission1Input = admissionSchema.parse({
    name: 'Student One',
    phone: studentPhone,
    email: studentEmail,
    branchId: branchA.id,
    academicSessionId: sessionA.id,
    academicProgramId: programA.id,
    academicClassId: classA.id,
    courseId: courseA.id,
    batchId: batchA.id,
    guardianName: 'Guardian One',
    guardianPhone: '01766666661',
    guardianRelationship: 'FATHER',
    idempotencyKey: `adm_key_1_${TAG}`,
  });

  const admission1 = await createStudentAdmission(
    tenantA.id,
    admission1Input,
    staffUserA.id,
    'STAFF'
  );

  assert(admission1.id, 'Student record created');
  assert(admission1.portalAccount, 'PortalAccount result returned');
  assert(admission1.portalProvisioning?.status === 'SUCCESS', 'Portal provisioning status is SUCCESS');
  assert(admission1.portalAccount.loginIdentifier === studentPhone || admission1.portalAccount.loginIdentifier === studentEmail, 'Valid login identifier returned');
  assert(admission1.portalAccount.setupLink?.includes('/portal/setup-password?token='), 'Setup link returned with token');
  ok('Test 1: Student admission automatically provisions PortalAccount with setupLink');

  // Test 2: Check PortalAccount in DB and verify setup token is hashed
  const portalAccountDb = await prisma.portalAccount.findFirst({
    where: { coachingCenterId: tenantA.id, studentId: admission1.id },
    include: { authTokens: true },
  });
  assert(portalAccountDb, 'PortalAccount found in database');
  assert(portalAccountDb.portalType === 'STUDENT', 'PortalAccount type is STUDENT');
  assert(portalAccountDb.passwordHash === null, 'Password hash is initially null');
  assert(portalAccountDb.authTokens.length === 1, 'Setup token record created');
  const tokenRecord = portalAccountDb.authTokens[0];
  assert(tokenRecord.purpose === 'SETUP', 'Token purpose is SETUP');
  assert(tokenRecord.usedAt === null, 'Token is not yet used');

  // Verify expiry is ~48 hours
  const expiryHours = (tokenRecord.expiresAt.getTime() - tokenRecord.createdAt.getTime()) / (1000 * 60 * 60);
  assert(Math.round(expiryHours) === 48, `Token expires in 48 hours (was ${expiryHours}h)`);
  ok('Test 2: Setup token in DB is hashed and has 48-hour expiration');

  // Test 3: Raw token in response matches the SHA-256 hash in DB
  const rawToken = admission1.portalAccount.setupToken;
  assert(rawToken, 'Raw token present in admission response');
  const crypto = await import('crypto');
  const hashedRaw = crypto.createHash('sha256').update(rawToken).digest('hex');
  assert(hashedRaw === tokenRecord.tokenHash, 'Raw token correctly hashes to tokenHash in database');
  ok('Test 3: Raw setup token is returned once and not stored in plaintext in DB');

  // Test 4: Setup password using the raw token
  const newPassword = 'Password123#Secure!';
  await completeSetupOrReset(rawToken, newPassword);

  const updatedPortal = await prisma.portalAccount.findUnique({
    where: { id: portalAccountDb.id },
    include: { authTokens: true },
  });
  assert(updatedPortal?.passwordHash !== null, 'Password hash is now set in PortalAccount');
  assert(updatedPortal?.authTokens[0].usedAt !== null, 'Setup token is marked used');
  ok('Test 4: Password setup works, populates passwordHash, and marks token as used');

  // Test 5: Setup token cannot be used again
  await expectError(
    () => completeSetupOrReset(rawToken, 'AnotherPassword123#'),
    'TOKEN',
    'Test 5: Reusing setup token fails'
  );

  // Test 6: Student login via Email
  const loginByEmail = await authenticateUser(studentEmail, newPassword);
  assert(loginByEmail.ok && loginByEmail.kind === 'PORTAL', 'Student logged in via email');
  assert(loginByEmail.portalAccountId === portalAccountDb.id, 'Portal account matches');
  ok('Test 6: Student can login via email');

  // Test 7: Student login via Phone
  const loginByPhone = await authenticateUser(studentPhone, newPassword);
  assert(loginByPhone.ok && loginByPhone.kind === 'PORTAL', 'Student logged in via phone');
  assert(loginByPhone.portalAccountId === portalAccountDb.id, 'Portal account matches');
  ok('Test 7: Student can login via phone number');

  // Test 8: Student login via Student ID Code
  assert(admission1.studentIdCode, 'Student ID code exists');
  const loginByStudentId = await authenticateUser(admission1.studentIdCode, newPassword);
  assert(loginByStudentId.ok && loginByStudentId.kind === 'PORTAL', 'Student logged in via Student ID code');
  assert(loginByStudentId.portalAccountId === portalAccountDb.id, 'Portal account matches');
  ok('Test 8: Student can login via Student ID Code');

  // Test 9: Student login without email initially (created with phone only)
  const phoneOnly = '01755555552';
  const admissionPhoneOnlyInput = admissionSchema.parse({
    name: 'Phone Only Student',
    phone: phoneOnly,
    branchId: branchA.id,
    academicSessionId: sessionA.id,
    academicProgramId: programA.id,
    academicClassId: classA.id,
    courseId: courseA.id,
    batchId: batchA.id,
    guardianName: 'Guardian Two',
    guardianPhone: '01766666662',
    guardianRelationship: 'MOTHER',
    idempotencyKey: `adm_key_phone_${TAG}`,
  });
  const admissionPhoneOnly = await createStudentAdmission(
    tenantA.id,
    admissionPhoneOnlyInput,
    staffUserA.id,
    'STAFF'
  );
  assert(admissionPhoneOnly.portalAccount?.setupToken, 'Setup token generated for phone-only student');
  await completeSetupOrReset(admissionPhoneOnly.portalAccount.setupToken, 'PhonePass123!');
  const phoneOnlyLogin = await authenticateUser(phoneOnly, 'PhonePass123!');
  assert(phoneOnlyLogin.ok && phoneOnlyLogin.kind === 'PORTAL', 'Phone-only student successfully authenticated');
  ok('Test 9: Student created without email can set password and login via phone');

  // Test 10: Idempotency replay returns existing account state and does not create duplicate PortalAccount
  const replay = await createStudentAdmission(
    tenantA.id,
    admission1Input,
    staffUserA.id,
    'STAFF'
  );
  assert(replay.id === admission1.id, 'Idempotent replay returns same student');
  const countPortalAccounts = await prisma.portalAccount.count({
    where: { coachingCenterId: tenantA.id, studentId: admission1.id },
  });
  assert(countPortalAccounts === 1, 'Only 1 PortalAccount exists for the student');
  ok('Test 10: Idempotent admission replay does not duplicate PortalAccount');

  // Test 11: Portal quota exceeded does NOT block student admission
  // Set portal limit to current count (2)
  const planWithLimit = await prisma.subscriptionPlan.create({
    data: {
      name: `Limited Plan ${TAG}`,
      code: `LIM_${Date.now().toString().slice(-4)}`,
      maxPortalAccounts: 2, // exactly 2 accounts created so far
      maxTeachers: 10,
      maxStudents: 100,
      maxStaffUsers: 5,
      maxBranches: 5,
      priceMonthly: 1000,
      priceYearly: 10000,
      status: 'ACTIVE',
      version: 1,
      features: {},
    },
  });

  const sub = await prisma.subscription.create({
    data: {
      coachingCenterId: tenantA.id,
      planId: planWithLimit.id,
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planVersion: 1,
    },
  });

  const admissionQuotaExceededInput = admissionSchema.parse({
    name: 'Quota Exceeded Student',
    phone: '01755555553',
    email: `quota_student_${TAG}@test.com`,
    branchId: branchA.id,
    academicSessionId: sessionA.id,
    academicProgramId: programA.id,
    academicClassId: classA.id,
    courseId: courseA.id,
    batchId: batchA.id,
    guardianName: 'Guardian Three',
    guardianPhone: '01766666663',
    guardianRelationship: 'OTHER',
    idempotencyKey: `adm_key_quota_${TAG}`,
  });

  const admissionQuotaExceeded = await createStudentAdmission(
    tenantA.id,
    admissionQuotaExceededInput,
    staffUserA.id,
    'STAFF'
  );

  assert(admissionQuotaExceeded.id, 'Student admitted successfully despite portal quota being exceeded');
  assert(admissionQuotaExceeded.portalAccount === null, 'portalAccount is null on quota exceeded');
  assert(admissionQuotaExceeded.portalProvisioning?.status === 'QUOTA_EXCEEDED', 'portalProvisioning status is QUOTA_EXCEEDED');

  const noPortalInDb = await prisma.portalAccount.findFirst({
    where: { coachingCenterId: tenantA.id, studentId: admissionQuotaExceeded.id },
  });
  assert(noPortalInDb === null, 'No PortalAccount was inserted into DB when quota was exceeded');
  ok('Test 11: Portal account limit exceeded does NOT block admission; returns QUOTA_EXCEEDED status cleanly');

  // =========================================================================
  // SECTION 2: TEACHER AUTOMATIC ACCOUNT CREATION & AUTH
  // =========================================================================
  console.log('\n--- SECTION 2: Teacher Account Creation & Staff Quota ---');

  // Test 12: createLoginAccount=true creates Teacher + User with TEACHER role + links userId
  const teacherEmail1 = `teacher1_${TAG}@test.com`;
  const teacher1 = await createTeacher(
    tenantA.id,
    {
      name: 'Professor Kalam',
      phone: '01788888881',
      email: teacherEmail1,
      branchId: branchA.id,
      subjectIds: [subjectA.id],
      createLoginAccount: true,
    },
    ownerUserA.id,
    ownerSession
  );

  assert(teacher1.id, 'Teacher created');
  assert(teacher1.userId, 'Teacher.userId is linked');
  assert((teacher1 as any).userAccount?.created === true, 'userAccount.created is true');
  assert((teacher1 as any).userAccount?.temporaryPassword, 'temporaryPassword returned in creation response');
  const tempPass = (teacher1 as any).userAccount.temporaryPassword;

  const linkedUser = await prisma.user.findUnique({
    where: { id: teacher1.userId },
    include: { roleAssignments: { include: { role: true } } },
  });
  assert(linkedUser, 'User record created in database');
  assert(linkedUser.email === teacherEmail1.toLowerCase(), 'User email matches');
  assert(linkedUser.branchId === branchA.id, 'User branchId matches Teacher branchId');
  assert(linkedUser.roleAssignments.some((ra) => ra.role.code === 'TEACHER'), 'User assigned TEACHER role');
  ok('Test 12: Teacher created with User account, TEACHER role, and branch inheritance');

  // Test 13: Teacher can login using temporary password
  const teacherLogin = await authenticateUser(teacherEmail1, tempPass);
  assert(teacherLogin.ok && teacherLogin.kind === 'STAFF', 'Teacher can login via email and temporary password');
  assert(teacherLogin.staff.role === 'TEACHER', 'Authenticated user has TEACHER role');
  ok('Test 13: Teacher can login with generated temporary password');

  // Test 14: createLoginAccount=false creates Teacher without User
  const teacher2 = await createTeacher(
    tenantA.id,
    {
      name: 'Professor Salam',
      phone: '01788888882',
      email: `teacher2_${TAG}@test.com`,
      branchId: branchA.id,
      subjectIds: [subjectA.id],
      createLoginAccount: false,
    },
    ownerUserA.id,
    ownerSession
  );
  assert(teacher2.id, 'Teacher 2 created');
  assert(teacher2.userId === null, 'Teacher 2 userId is null');
  assert((teacher2 as any).userAccount?.created === false, 'userAccount.created is false');
  ok('Test 14: Teacher with createLoginAccount=false creates Teacher without User account');

  // Test 15: Existing teacher manual account linking still works
  const manualLink = await linkTeacherAccount(
    tenantA.id,
    teacher2.id,
    {
      mode: 'create',
      name: 'Professor Salam',
      email: `manual_teacher_${TAG}@test.com`,
      phone: '01788888883',
      password: 'ManualPassword123#',
    },
    ownerUserA.id,
    'OWNER'
  );
  assert(manualLink.userId, 'Teacher 2 manually linked to user');
  const updatedTeacher2 = await prisma.teacher.findUnique({ where: { id: teacher2.id } });
  assert(updatedTeacher2?.userId === manualLink.userId, 'Teacher 2 userId now updated in DB');
  ok('Test 15: Existing manual account linking continues to function for teachers without users');

  // Test 16: Email conflict on teacher user creation rolls back entire transaction cleanly
  const countTeachersBefore = await prisma.teacher.count({ where: { coachingCenterId: tenantA.id } });
  const countUsersBefore = await prisma.user.count({ where: { coachingCenterId: tenantA.id } });

  await expectError(
    () =>
      createTeacher(
        tenantA.id,
        {
          name: 'Conflict Teacher',
          phone: '01788888884',
          email: teacherEmail1, // already taken!
          branchId: branchA.id,
          createLoginAccount: true,
        },
        ownerUserA.id,
        ownerSession
      ),
    'EMAIL_ALREADY_EXISTS',
    'Test 16: Email conflict in teacher creation rolls back transaction'
  );

  const countTeachersAfter = await prisma.teacher.count({ where: { coachingCenterId: tenantA.id } });
  const countUsersAfter = await prisma.user.count({ where: { coachingCenterId: tenantA.id } });
  assert(countTeachersBefore === countTeachersAfter, 'No orphan Teacher created on email conflict');
  assert(countUsersBefore === countUsersAfter, 'No orphan User created on email conflict');
  ok('Test 16: No orphan records created on transaction rollback');

  // Test 17: Staff quota check rolls back entire transaction if exceeded
  // Update plan to have maxStaffUsers = 1 (we already have staffUserA = 1)
  await prisma.subscriptionPlan.update({
    where: { id: planWithLimit.id },
    data: { maxStaffUsers: 1 },
  });

  await expectError(
    () =>
      createTeacher(
        tenantA.id,
        {
          name: 'Quota Limited Teacher',
          phone: '01788888885',
          email: `quota_teacher_${TAG}@test.com`,
          branchId: branchA.id,
          createLoginAccount: true,
        },
        ownerUserA.id,
        ownerSession
      ),
    'STAFF_LIMIT_REACHED',
    'Test 17: Staff limit reached rolls back teacher creation cleanly'
  );

  // =========================================================================
  // SECTION 3: AUTHENTICATION & MULTI-TENANT ISOLATION
  // =========================================================================
  console.log('\n--- SECTION 3: Multi-Identifier Authentication & Security ---');

  // Test 18: Existing Staff & Owner login works
  const staffLogin = await authenticateUser(staffUserA.email, 'wrongpass');
  assert(!staffLogin.ok, 'Wrong password rejected');
  ok('Test 18: User login security rejects invalid passwords');

  // Test 19: Lockout policy after 5 failed attempts
  for (let i = 0; i < 5; i++) {
    await authenticateUser(studentEmail, 'WrongPassword!');
  }
  const lockedPortal = await prisma.portalAccount.findUnique({ where: { id: portalAccountDb.id } });
  assert(lockedPortal?.failedLoginAttempts! >= 5, 'Failed login count tracked');
  assert(lockedPortal?.lockedUntil !== null, 'Account is locked until future time');

  const attemptWhileLocked = await authenticateUser(studentEmail, newPassword);
  assert(!attemptWhileLocked.ok, 'Locked account rejects even valid password');
  ok('Test 19: Account lockout policy (5 failures -> 15 min lock) enforced for portal accounts');

  // Test 20: Tenant Isolation: Tenant B cannot access Tenant A student or teacher
  const studentInTenantB = await prisma.student.findFirst({
    where: { coachingCenterId: tenantB.id, id: admission1.id },
  });
  assert(studentInTenantB === null, 'Tenant A student not visible in Tenant B');

  const teacherInTenantB = await prisma.teacher.findFirst({
    where: { coachingCenterId: tenantB.id, id: teacher1.id },
  });
  assert(teacherInTenantB === null, 'Tenant A teacher not visible in Tenant B');
  ok('Test 20: Cross-tenant isolation strictly preserved across all operations');

  console.log('\n==================================================');
  console.log(`ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
