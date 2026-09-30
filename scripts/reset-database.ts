import 'dotenv/config';
import prisma from '../lib/db';
import { hashPassword } from '../lib/auth/password';

const SUPER_ADMIN_EMAIL = 'superadmin@example.com';
const SUPER_ADMIN_PASSWORD = 'YourPassword123!';
const SUPER_ADMIN_NAME = 'Super Admin';

// All tables in public schema except migrations and platform_admins
const TABLES_TO_TRUNCATE = [
  'academic_classes',
  'academic_groups',
  'academic_programs',
  'academic_sessions',
  'attendance_sessions',
  'audit_logs',
  'batch_subjects',
  'batch_teacher_assignments',
  'batches',
  'branches',
  'branding_settings',
  'cash_sessions',
  'certificates',
  'class_schedules',
  'coaching_centers',
  'communication_logs',
  'communication_provider_configs',
  'communication_templates',
  'course_fee_items',
  'course_installments',
  'course_subjects',
  'courses',
  'education_boards',
  'exam_students',
  'exam_subjects',
  'exams',
  'expense_categories',
  'expenses',
  'fee_discounts',
  'fee_invoice_items',
  'fee_invoices',
  'fee_structures',
  'financial_sequences',
  'guardians',
  'homework_submissions',
  'homeworks',
  'manual_payment_instructions',
  'manual_payment_submissions',
  'media',
  'notices',
  'notification_channel_policies',
  'notification_policies',
  'notification_preferences',
  'notification_recipient_policies',
  'notifications',
  'payment_gateway_configs',
  'payment_gateway_transactions',
  'payment_refunds',
  'payments',
  'permissions',
  'platform_audit_logs',
  'portal_accounts',
  'portal_auth_tokens',
  'question_options',
  'question_paper_items',
  'question_papers',
  'questions',
  'rate_limit_buckets',
  'results',
  'role_assignments',
  'role_permissions',
  'roles',
  'rooms',
  'student_attendances',
  'student_batches',
  'student_enrollments',
  'student_fee_assignments',
  'student_guardians',
  'student_id_sequences',
  'students',
  'study_materials',
  'subject_papers',
  'subjects',
  'subscriptions',
  'subscription_plans',
  'system_settings',
  'teacher_attendances',
  'teacher_subjects',
  'teachers',
  'users',
];

const STANDARD_PLANS = [
  {
    name: 'Starter',
    banglaName: 'প্রারম্ভিক',
    code: 'STARTER',
    description: 'Essential tools for small coaching centers and single-branch institutions.',
    priceMonthly: 1500,
    priceYearly: 15000,
    trialDays: 14,
    status: 'ACTIVE',
    version: 1,
    maxStudents: 100,
    maxTeachers: 5,
    maxStaffUsers: 3,
    maxPortalAccounts: 50,
    maxBranches: 1,
    maxSms: 500,
    maxWhatsapp: 100,
    maxEmail: null,
    maxStorageMb: 500,
    features: {
      ATTENDANCE: true,
      FEES: true,
      HOMEWORK: true,
      EXAMS: true,
      STUDY_MATERIALS: true,
      COMMUNICATION: true,
      ADVANCED_REPORTS: false,
      ONLINE_PAYMENT: false,
    },
  },
  {
    name: 'Growth',
    banglaName: 'বৃদ্ধি',
    code: 'GROWTH',
    description: 'For growing institutions with multiple batches and online fee collection.',
    priceMonthly: 3500,
    priceYearly: 35000,
    trialDays: 14,
    status: 'ACTIVE',
    version: 1,
    maxStudents: 500,
    maxTeachers: 20,
    maxStaffUsers: 10,
    maxPortalAccounts: 300,
    maxBranches: 3,
    maxSms: 2000,
    maxWhatsapp: 500,
    maxEmail: null,
    maxStorageMb: 2000,
    features: {
      ATTENDANCE: true,
      FEES: true,
      HOMEWORK: true,
      EXAMS: true,
      STUDY_MATERIALS: true,
      COMMUNICATION: true,
      ADVANCED_REPORTS: true,
      ONLINE_PAYMENT: true,
    },
  },
  {
    name: 'Pro',
    banglaName: 'পেশাদার',
    code: 'PRO',
    description: 'Full platform capabilities with multi-branch management and high quotas.',
    priceMonthly: 7000,
    priceYearly: 70000,
    trialDays: 14,
    status: 'ACTIVE',
    version: 1,
    maxStudents: 2000,
    maxTeachers: 100,
    maxStaffUsers: 30,
    maxPortalAccounts: 1500,
    maxBranches: 10,
    maxSms: 10000,
    maxWhatsapp: 2000,
    maxEmail: null,
    maxStorageMb: 10000,
    features: {
      ATTENDANCE: true,
      FEES: true,
      HOMEWORK: true,
      EXAMS: true,
      STUDY_MATERIALS: true,
      COMMUNICATION: true,
      ADVANCED_REPORTS: true,
      ONLINE_PAYMENT: true,
    },
  },
];

async function main() {
  console.log('========================================================');
  console.log('RESETTING DATABASE (PRESERVING ONLY SUPER ADMIN)');
  console.log('========================================================');

  // 1. Ensure Super Admin account exists and is pristine
  console.log(`\n[1/5] Preserving Super Admin: ${SUPER_ADMIN_EMAIL}...`);
  const passwordHash = hashPassword(SUPER_ADMIN_PASSWORD);
  const superAdmin = await prisma.platformAdmin.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      name: SUPER_ADMIN_NAME,
      passwordHash,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 0,
    },
    create: {
      email: SUPER_ADMIN_EMAIL,
      name: SUPER_ADMIN_NAME,
      passwordHash,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 0,
    },
  });
  console.log(`✔ Super Admin preserved: ${superAdmin.email} (ID: ${superAdmin.id})`);

  // 2. Remove other platform admins
  console.log('\n[2/5] Cleaning other platform admins...');
  const deletedAdmins = await prisma.platformAdmin.deleteMany({
    where: { email: { not: SUPER_ADMIN_EMAIL } },
  });
  console.log(`✔ Deleted ${deletedAdmins.count} other platform admin(s).`);

  // 3. Truncate all application and tenant tables
  console.log('\n[3/5] Truncating all tenant tables...');
  const truncateSql = `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
  await prisma.$executeRawUnsafe(truncateSql);
  console.log(`✔ Truncated ${TABLES_TO_TRUNCATE.length} tables cleanly with CASCADE.`);

  // 4. Seed standard subscription plans
  console.log('\n[4/5] Seeding standard clean subscription plans...');
  for (const plan of STANDARD_PLANS) {
    const created = await prisma.subscriptionPlan.create({ data: plan });
    console.log(`✔ Created plan: ${created.name} (${created.code}) - ৳${created.priceMonthly}/mo`);
  }

  // 5. Create initial audit log
  console.log('\n[5/5] Recording initial platform audit log...');
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: superAdmin.id,
      action: 'PLATFORM_DATABASE_RESET',
      entity: 'PlatformAdmin',
      entityId: superAdmin.id,
      details: {
        preservedAdmin: superAdmin.email,
        plansSeeded: STANDARD_PLANS.map((p) => p.code),
        timestamp: new Date().toISOString(),
      },
    },
  });
  console.log('✔ Audit log recorded.');

  // Verification counts
  console.log('\n========================================================');
  console.log('FINAL DATABASE STATE:');
  console.log('========================================================');
  const counts = {
    platformAdmins: await prisma.platformAdmin.count(),
    coachingCenters: await prisma.coachingCenter.count(),
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    teachers: await prisma.teacher.count(),
    branches: await prisma.branch.count(),
    subscriptionPlans: await prisma.subscriptionPlan.count(),
    platformAuditLogs: await prisma.platformAuditLog.count(),
  };
  console.table(counts);

  const activeAdmins = await prisma.platformAdmin.findMany({
    select: { email: true, name: true, status: true },
  });
  console.log('\nActive Platform Admin(s):', activeAdmins);
  console.log('\n✔ DATABASE WIPE COMPLETE: Only Super Admin remains.');
}

main()
  .catch((e) => {
    console.error('DATABASE RESET ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
