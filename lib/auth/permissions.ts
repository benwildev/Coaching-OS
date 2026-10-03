/**
 * Phase 14.1 — Permission catalog and evaluation.
 *
 * SINGLE SOURCE OF TRUTH for every permission code, its grouping, its EN/BN
 * labels and the baseline (default) permission set of each configurable role.
 * Nothing else in the codebase may define a permission code or label — the
 * database `Permission` table is only a synced mirror of this file
 * (see lib/services/permission.service.ts and scripts/sync-permissions.ts).
 *
 * This module is deliberately free of runtime imports (Prisma, Next) so it
 * can be used by server code, scripts and client components alike.
 *
 * A permission is only ONE layer of authorization. It never replaces tenant
 * isolation, branch scope, teacher-assignment scope or resource ownership
 * checks — those stay exactly where they are.
 */
import type { RoleCode } from '@prisma/client';

// ---------------------------------------------------------------------------
// Groups & sections (UI structure)
// ---------------------------------------------------------------------------

export const PERMISSION_GROUPS = {
  CORE: { label: 'Core', bn: 'কোর' },
  ACADEMIC: { label: 'Academic', bn: 'একাডেমিক' },
  ATTENDANCE: { label: 'Attendance', bn: 'উপস্থিতি' },
  EXAMS: { label: 'Exams & Results', bn: 'পরীক্ষা ও ফলাফল' },
  HOMEWORK: { label: 'Homework', bn: 'হোমওয়ার্ক' },
  MATERIALS: { label: 'Study Materials', bn: 'স্টাডি ম্যাটেরিয়াল' },
  FINANCE: { label: 'Finance', bn: 'অর্থ ও হিসাব' },
  COMMUNICATION: { label: 'Communication', bn: 'যোগাযোগ' },
  REPORTS: { label: 'Reports', bn: 'রিপোর্ট' },
  ADMINISTRATION: { label: 'Administration', bn: 'প্রশাসন' },
} as const;

export type PermissionGroupKey = keyof typeof PERMISSION_GROUPS;

/** Display order of groups in the Owner UI. */
export const PERMISSION_GROUP_ORDER = Object.keys(PERMISSION_GROUPS) as PermissionGroupKey[];

export const PERMISSION_SECTIONS = {
  dashboard: { group: 'CORE', label: 'Dashboard', bn: 'ড্যাশবোর্ড' },
  uploads: { group: 'CORE', label: 'File Uploads', bn: 'ফাইল আপলোড' },
  students: { group: 'ACADEMIC', label: 'Students', bn: 'শিক্ষার্থী' },
  courses: { group: 'ACADEMIC', label: 'Courses', bn: 'কোর্স' },
  batches: { group: 'ACADEMIC', label: 'Batches', bn: 'ব্যাচ' },
  teachers: { group: 'ACADEMIC', label: 'Teachers', bn: 'শিক্ষক' },
  routine: { group: 'ACADEMIC', label: 'Routine', bn: 'রুটিন' },
  attendance: { group: 'ATTENDANCE', label: 'Attendance', bn: 'উপস্থিতি' },
  attendance_alerts: { group: 'ATTENDANCE', label: 'Attendance Alerts', bn: 'উপস্থিতি সতর্কতা' },
  teacher_attendance: { group: 'ATTENDANCE', label: 'Teacher Attendance', bn: 'শিক্ষক উপস্থিতি' },
  exams: { group: 'EXAMS', label: 'Exams', bn: 'পরীক্ষা' },
  results: { group: 'EXAMS', label: 'Results', bn: 'ফলাফল' },
  homework: { group: 'HOMEWORK', label: 'Homework', bn: 'হোমওয়ার্ক' },
  materials: { group: 'MATERIALS', label: 'Study Materials', bn: 'স্টাডি ম্যাটেরিয়াল' },
  questions: { group: 'MATERIALS', label: 'Question Bank', bn: 'প্রশ্নব্যাংক' },
  question_papers: { group: 'MATERIALS', label: 'Question Papers', bn: 'প্রশ্নপত্র' },
  fees: { group: 'FINANCE', label: 'Fees & Payments', bn: 'ফি ও পেমেন্ট' },
  fee_structures: { group: 'FINANCE', label: 'Fee Structures', bn: 'ফি কাঠামো' },
  salary: { group: 'FINANCE', label: 'Salary', bn: 'বেতন' },
  compensation: { group: 'FINANCE', label: 'Teacher Compensation', bn: 'শিক্ষক পারিশ্রমিক' },
  finance: { group: 'FINANCE', label: 'Finance Overview', bn: 'অর্থ ও হিসাব' },
  expenses: { group: 'FINANCE', label: 'Expenses', bn: 'খরচ' },
  communication: { group: 'COMMUNICATION', label: 'Communication', bn: 'যোগাযোগ' },
  notices: { group: 'COMMUNICATION', label: 'Notices', bn: 'নোটিশ' },
  notifications: { group: 'COMMUNICATION', label: 'Notifications', bn: 'নোটিফিকেশন' },
  reports: { group: 'REPORTS', label: 'Reports', bn: 'রিপোর্ট' },
  settings_general: { group: 'ADMINISTRATION', label: 'Centre Settings', bn: 'সেন্টার সেটিংস' },
  settings_users: { group: 'ADMINISTRATION', label: 'Users', bn: 'ব্যবহারকারী' },
  settings_system: { group: 'ADMINISTRATION', label: 'Integrations & Policies', bn: 'ইন্টিগ্রেশন ও নীতিমালা' },
  portal_accounts: { group: 'ADMINISTRATION', label: 'Portal Accounts', bn: 'পোর্টাল অ্যাকাউন্ট' },
} as const satisfies Record<string, { group: PermissionGroupKey; label: string; bn: string }>;

export type PermissionSectionKey = keyof typeof PERMISSION_SECTIONS;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface PermissionMeta {
  section: PermissionSectionKey;
  label: string;
  bn: string;
  description: string;
  /**
   * OWNER-only regardless of role configuration: never grantable to
   * ADMIN/STAFF/TEACHER, never stored as a RolePermission, never honoured by
   * `can()` for a non-owner even if a stray row exists.
   */
  ownerLocked: boolean;
}

function e(
  section: PermissionSectionKey,
  label: string,
  bn: string,
  opts: { description?: string; ownerLocked?: boolean } = {}
): PermissionMeta {
  return { section, label, bn, description: opts.description ?? label, ownerLocked: opts.ownerLocked ?? false };
}

/**
 * Every code corresponds to an action that exists in the application today
 * (verified in the Phase 14.0 audit). Codes are `<module>.<action>` where the
 * module is the first dot-segment and the action is the remainder.
 */
export const PERMISSION_META = {
  // CORE
  'dashboard.read': e('dashboard', 'View dashboard', 'ড্যাশবোর্ড দেখা'),
  'upload.use': e('uploads', 'Upload files', 'ফাইল আপলোড করা'),

  // ACADEMIC — students
  'students.read': e('students', 'View students', 'শিক্ষার্থীদের তালিকা ও প্রোফাইল দেখা'),
  'students.create': e('students', 'Admit students', 'শিক্ষার্থী ভর্তি করা'),
  'students.update': e('students', 'Update students', 'শিক্ষার্থীর তথ্য সম্পাদনা'),
  'students.promote': e('students', 'Promote students', 'শিক্ষার্থী প্রমোশন'),
  'students.transfer': e('students', 'Transfer students between batches', 'ব্যাচ ট্রান্সফার'),
  'students.archive': e('students', 'Change student status in bulk', 'শিক্ষার্থীর স্ট্যাটাস পরিবর্তন (বাল্ক)'),
  'students.certificates': e('students', 'Issue and view certificates', 'সার্টিফিকেট ইস্যু ও দেখা'),
  'students.id_card': e('students', 'View and print ID cards', 'আইডি কার্ড দেখা ও প্রিন্ট'),

  // ACADEMIC — courses
  'courses.read': e('courses', 'View courses', 'কোর্স দেখা'),
  'courses.create': e('courses', 'Create courses', 'কোর্স তৈরি'),
  'courses.update': e('courses', 'Update courses', 'কোর্স সম্পাদনা'),
  'courses.delete': e('courses', 'Delete courses', 'কোর্স মুছে ফেলা'),
  'courses.pricing.update': e('courses', 'Change course pricing', 'কোর্স ফি পরিবর্তন'),

  // ACADEMIC — batches
  'batches.read': e('batches', 'View batches', 'ব্যাচ দেখা'),
  'batches.create': e('batches', 'Create batches', 'ব্যাচ তৈরি'),
  'batches.update': e('batches', 'Update batches and enrolments', 'ব্যাচ ও ভর্তি সম্পাদনা'),
  'batches.assign_teacher': e('batches', 'Assign teachers to batches', 'ব্যাচে শিক্ষক নিয়োগ'),

  // ACADEMIC — teachers
  'teachers.read': e('teachers', 'View teachers', 'শিক্ষকদের তালিকা দেখা'),
  'teachers.create': e('teachers', 'Add teachers', 'শিক্ষক যোগ করা'),
  'teachers.update': e('teachers', 'Update teachers', 'শিক্ষকের তথ্য সম্পাদনা'),
  'teachers.delete': e('teachers', 'Delete teachers', 'শিক্ষক মুছে ফেলা'),
  'teachers.account': e('teachers', 'Manage teacher login accounts', 'শিক্ষকের লগইন অ্যাকাউন্ট পরিচালনা'),
  'teachers.assignments': e('teachers', 'Manage teacher assignments', 'শিক্ষকের দায়িত্ব বণ্টন'),

  // ACADEMIC — routine
  'routine.read': e('routine', 'View routine', 'রুটিন দেখা'),
  'routine.manage': e('routine', 'Manage class schedules', 'ক্লাস রুটিন পরিচালনা'),

  // ATTENDANCE
  'attendance.read': e('attendance', 'View attendance', 'উপস্থিতি দেখা'),
  'attendance.create': e('attendance', 'Take attendance', 'উপস্থিতি নেওয়া'),
  'attendance.update': e('attendance', 'Update attendance', 'উপস্থিতি সম্পাদনা'),
  'attendance.reopen': e('attendance', 'Reopen completed attendance', 'সম্পন্ন উপস্থিতি পুনরায় খোলা'),
  'attendance.alerts.read': e('attendance_alerts', 'View low-attendance alerts', 'কম উপস্থিতির সতর্কতা দেখা'),
  'attendance.threshold.update': e('attendance_alerts', 'Change attendance alert threshold', 'উপস্থিতি সতর্কতার সীমা পরিবর্তন'),
  'teacher_attendance.read': e('teacher_attendance', 'View teacher attendance', 'শিক্ষক উপস্থিতি দেখা'),
  'teacher_attendance.create': e('teacher_attendance', 'Record teacher attendance', 'শিক্ষক উপস্থিতি রেকর্ড'),

  // EXAMS & RESULTS
  'exams.read': e('exams', 'View exams', 'পরীক্ষা দেখা'),
  'exams.create': e('exams', 'Create exams', 'পরীক্ষা তৈরি'),
  'exams.update': e('exams', 'Update, schedule, start and complete exams', 'পরীক্ষা সম্পাদনা, সময়সূচি ও পরিচালনা'),
  'exams.publish': e('exams', 'Publish results', 'ফলাফল প্রকাশ'),
  'exams.cancel': e('exams', 'Cancel exams', 'পরীক্ষা বাতিল'),
  'exams.reopen': e('exams', 'Reopen exams', 'পরীক্ষা পুনরায় খোলা'),
  'exams.marks.enter': e('exams', 'Enter marks', 'নম্বর এন্ট্রি'),
  'results.read': e('results', 'View results', 'ফলাফল দেখা'),

  // HOMEWORK
  'homework.read': e('homework', 'View homework', 'হোমওয়ার্ক দেখা'),
  'homework.create': e('homework', 'Create homework', 'হোমওয়ার্ক তৈরি'),
  'homework.update': e('homework', 'Update homework and grade submissions', 'হোমওয়ার্ক সম্পাদনা ও মূল্যায়ন'),
  'homework.delete': e('homework', 'Delete homework', 'হোমওয়ার্ক মুছে ফেলা'),
  'homework.publish': e('homework', 'Publish, close and archive homework', 'হোমওয়ার্ক প্রকাশ, বন্ধ ও আর্কাইভ'),

  // STUDY MATERIALS
  'materials.read': e('materials', 'View study materials', 'স্টাডি ম্যাটেরিয়াল দেখা'),
  'materials.create': e('materials', 'Create study materials', 'স্টাডি ম্যাটেরিয়াল তৈরি'),
  'materials.update': e('materials', 'Update study materials', 'স্টাডি ম্যাটেরিয়াল সম্পাদনা'),
  'materials.delete': e('materials', 'Delete study materials', 'স্টাডি ম্যাটেরিয়াল মুছে ফেলা'),
  'materials.publish': e('materials', 'Publish and archive study materials', 'স্টাডি ম্যাটেরিয়াল প্রকাশ ও আর্কাইভ'),
  'questions.read': e('questions', 'View questions', 'প্রশ্ন দেখা'),
  'questions.create': e('questions', 'Create questions', 'প্রশ্ন তৈরি'),
  'questions.update': e('questions', 'Update questions', 'প্রশ্ন সম্পাদনা'),
  'questions.delete': e('questions', 'Delete questions', 'প্রশ্ন মুছে ফেলা'),
  'questions.publish': e('questions', 'Publish and archive questions', 'প্রশ্ন প্রকাশ ও আর্কাইভ'),
  'question_papers.read': e('question_papers', 'View question papers', 'প্রশ্নপত্র দেখা'),
  'question_papers.create': e('question_papers', 'Create question papers', 'প্রশ্নপত্র তৈরি'),
  'question_papers.update': e('question_papers', 'Update and archive question papers', 'প্রশ্নপত্র সম্পাদনা ও আর্কাইভ'),
  'question_papers.finalize': e('question_papers', 'Finalize question papers', 'প্রশ্নপত্র চূড়ান্ত করা'),

  // FINANCE
  'fees.read': e('fees', 'View fees, invoices and payments', 'ফি, ইনভয়েস ও পেমেন্ট দেখা'),
  'fees.collect': e('fees', 'Collect fees', 'ফি সংগ্রহ'),
  'fees.invoices.create': e('fees', 'Create and cancel invoices', 'ইনভয়েস তৈরি ও বাতিল'),
  'fees.refund': e('fees', 'Refund payments', 'পেমেন্ট ফেরত'),
  'fees.discount.request': e('fees', 'Request discounts', 'ডিসকাউন্টের অনুরোধ'),
  'fees.discount.approve': e('fees', 'Approve or reject discounts', 'ডিসকাউন্ট অনুমোদন বা প্রত্যাখ্যান', { ownerLocked: true }),
  'fees.reports.read': e('fees', 'View fee reports', 'ফি রিপোর্ট দেখা'),
  'fees.cash_session.manage': e('fees', 'Manage cash sessions', 'ক্যাশ সেশন পরিচালনা'),
  'fees.structures.read': e('fee_structures', 'View fee structures', 'ফি কাঠামো দেখা'),
  'fees.structures.create': e('fee_structures', 'Create fee structures', 'ফি কাঠামো তৈরি'),
  'fees.structures.update': e('fee_structures', 'Update fee structures and assignments', 'ফি কাঠামো ও অ্যাসাইনমেন্ট সম্পাদনা'),
  'salary.read': e('salary', 'View salary', 'বেতন দেখা'),
  'salary.generate': e('salary', 'Generate salary', 'বেতন তৈরি'),
  'salary.finalize': e('salary', 'Finalize salary periods', 'বেতন পিরিয়ড চূড়ান্ত করা'),
  'salary.pay': e('salary', 'Pay salary', 'বেতন পরিশোধ'),
  'salary.cancel': e('salary', 'Cancel salary', 'বেতন বাতিল'),
  'compensation.read': e('compensation', 'View teacher compensation', 'শিক্ষক পারিশ্রমিক দেখা'),
  'compensation.manage': e('compensation', 'Manage teacher compensation', 'শিক্ষক পারিশ্রমিক পরিচালনা'),
  'finance.dashboard.read': e('finance', 'View the finance overview (income, expenses, net result)', 'অর্থ ও হিসাব ওভারভিউ দেখা'),
  'expenses.read': e('expenses', 'View expenses', 'খরচ দেখা'),
  'expenses.create': e('expenses', 'Record expenses', 'খরচ যোগ করা'),
  'expenses.update': e('expenses', 'Edit expenses', 'খরচ সম্পাদনা'),
  'expenses.cancel': e('expenses', 'Cancel expenses', 'খরচ বাতিল'),
  'expenses.categories.manage': e('expenses', 'Manage expense categories', 'খরচের ক্যাটাগরি পরিচালনা'),

  // COMMUNICATION
  'communication.templates.read': e('communication', 'View message templates', 'মেসেজ টেমপ্লেট দেখা'),
  'communication.templates.manage': e('communication', 'Manage message templates', 'মেসেজ টেমপ্লেট পরিচালনা'),
  'communication.logs.read': e('communication', 'View communication logs', 'যোগাযোগ লগ দেখা'),
  'communication.retry': e('communication', 'Retry failed messages', 'ব্যর্থ মেসেজ পুনরায় পাঠানো'),
  'notices.read': e('notices', 'View notices', 'নোটিশ দেখা'),
  'notices.create': e('notices', 'Create notices', 'নোটিশ তৈরি'),
  'notices.update': e('notices', 'Update notices', 'নোটিশ সম্পাদনা'),
  'notices.publish': e('notices', 'Publish and archive notices', 'নোটিশ প্রকাশ ও আর্কাইভ'),
  'notifications.read': e('notifications', 'View notifications', 'নোটিফিকেশন দেখা'),

  // REPORTS
  'reports.students.read': e('reports', 'Student reports', 'শিক্ষার্থী রিপোর্ট'),
  'reports.attendance.read': e('reports', 'Attendance reports', 'উপস্থিতি রিপোর্ট'),
  'reports.exams.read': e('reports', 'Exam reports', 'পরীক্ষা রিপোর্ট'),
  'reports.teachers.read': e('reports', 'Teacher reports', 'শিক্ষক রিপোর্ট'),
  'reports.batches.read': e('reports', 'Batch reports', 'ব্যাচ রিপোর্ট'),
  'reports.finance.read': e('reports', 'Finance reports', 'আর্থিক রিপোর্ট'),
  'reports.communication.read': e('reports', 'Communication reports', 'যোগাযোগ রিপোর্ট'),

  // ADMINISTRATION
  'settings.profile.read': e('settings_general', 'View centre profile', 'সেন্টার প্রোফাইল দেখা'),
  'settings.profile.update': e('settings_general', 'Update centre profile', 'সেন্টার প্রোফাইল সম্পাদনা'),
  'settings.academic.read': e('settings_general', 'View academic setup', 'একাডেমিক সেটআপ দেখা'),
  'settings.academic.update': e('settings_general', 'Update academic setup', 'একাডেমিক সেটআপ সম্পাদনা'),
  'settings.branding.read': e('settings_general', 'View branding', 'ব্র্যান্ডিং দেখা'),
  'settings.branding.update': e('settings_general', 'Update branding', 'ব্র্যান্ডিং সম্পাদনা'),
  'settings.users.read': e('settings_users', 'View users', 'ব্যবহারকারী দেখা'),
  'settings.users.create': e('settings_users', 'Create users', 'ব্যবহারকারী তৈরি'),
  'settings.users.update': e('settings_users', 'Enable or disable users', 'ব্যবহারকারী সক্রিয় বা নিষ্ক্রিয়'),
  'settings.payment_gateways.read': e('settings_system', 'View payment gateway settings', 'পেমেন্ট গেটওয়ে সেটিংস দেখা'),
  'settings.payment_gateways.update': e('settings_system', 'Update payment gateway settings', 'পেমেন্ট গেটওয়ে সেটিংস সম্পাদনা'),
  'settings.communication.update': e('settings_system', 'Update SMS and gateway settings', 'এসএমএস ও গেটওয়ে সেটিংস সম্পাদনা'),
  'settings.notification_policy.update': e('settings_system', 'Update notification policies', 'নোটিফিকেশন পলিসি সম্পাদনা'),
  'settings.subscription.read': e('settings_system', 'View subscription', 'সাবস্ক্রিপশন দেখা', { ownerLocked: true }),
  'portal_accounts.manage': e('portal_accounts', 'Manage student and guardian portal accounts', 'পোর্টাল অ্যাকাউন্ট পরিচালনা'),
} as const satisfies Record<string, PermissionMeta>;

export type PermissionCode = keyof typeof PERMISSION_META;

export interface PermissionDefinition extends PermissionMeta {
  code: PermissionCode;
  module: string;
  action: string;
  group: PermissionGroupKey;
}

function splitCode(code: string): { module: string; action: string } {
  const i = code.indexOf('.');
  return { module: code.slice(0, i), action: code.slice(i + 1) };
}

/** Flat, ordered catalog (declaration order). */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = (
  Object.keys(PERMISSION_META) as PermissionCode[]
).map((code) => {
  const meta: PermissionMeta = PERMISSION_META[code];
  return { code, ...splitCode(code), ...meta, group: PERMISSION_SECTIONS[meta.section].group };
});

export const ALL_PERMISSION_CODES: readonly PermissionCode[] = PERMISSION_CATALOG.map((p) => p.code);
export const OWNER_LOCKED_CODES: readonly PermissionCode[] = PERMISSION_CATALOG.filter((p) => p.ownerLocked).map((p) => p.code);

const KNOWN_CODES: ReadonlySet<string> = new Set(ALL_PERMISSION_CODES);
const LOCKED_CODES: ReadonlySet<string> = new Set(OWNER_LOCKED_CODES);

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

export function isOwnerLockedPermission(code: string): boolean {
  return LOCKED_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Configurable roles & default sets
// ---------------------------------------------------------------------------

/** Roles whose permissions the Owner can configure. OWNER is unrestricted and never stored. */
export const CONFIGURABLE_ROLES = ['ADMIN', 'STAFF', 'TEACHER'] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export function isConfigurableRole(value: unknown): value is ConfigurableRole {
  return typeof value === 'string' && (CONFIGURABLE_ROLES as readonly string[]).includes(value);
}

/**
 * Baseline permission sets. These reproduce each role's EFFECTIVE access as of
 * the Phase 14.0 audit (API role gates first, service gates second). They are
 * a behaviour-preservation snapshot, not a product opinion: known
 * over-exposures (e.g. teacher branch-wide student reads) are deliberately
 * left as they are until Phase 14.3.
 *
 * Judgment calls (documented in the Phase 14.1 report):
 *  - `teachers.read` (list) is held by STAFF and TEACHER. Phase 14.1 had it
 *    false from a misreading of the audit; Phase 14.2 verified GET /api/teachers
 *    has never had a role gate (teacher dropdowns and the Teachers page work for
 *    every role), so the default was corrected to preserve behaviour. The
 *    per-teacher detail endpoint stays permission-ungated (own-profile access).
 *  - TEACHER `salary.read` / `compensation.read` are false: the teacher's own
 *    pay history is a self-service path checked in the service, not module
 *    access.
 *  - STAFF `settings.payment_gateways.read` is false: the gateway-config API
 *    is OWNER/ADMIN only (STAFF reviews manual submissions via `fees.*`).
 */
export const STAFF_DEFAULTS: readonly PermissionCode[] = [
  'dashboard.read',
  'upload.use',
  'students.read', 'students.create', 'students.update', 'students.promote', 'students.transfer',
  'students.archive', 'students.certificates', 'students.id_card',
  'courses.read',
  'batches.read', 'batches.create', 'batches.update',
  'teachers.read',
  'routine.read', 'routine.manage',
  'attendance.read', 'attendance.create', 'attendance.update', 'attendance.alerts.read',
  'teacher_attendance.read', 'teacher_attendance.create',
  'exams.read', 'exams.create', 'exams.update', 'exams.marks.enter',
  'results.read',
  'homework.read', 'homework.create', 'homework.update', 'homework.delete', 'homework.publish',
  'materials.read', 'materials.create', 'materials.update', 'materials.delete', 'materials.publish',
  'questions.read', 'questions.create', 'questions.update', 'questions.delete', 'questions.publish',
  'question_papers.read', 'question_papers.create', 'question_papers.update', 'question_papers.finalize',
  'fees.read', 'fees.collect', 'fees.invoices.create', 'fees.discount.request', 'fees.reports.read',
  'fees.cash_session.manage', 'fees.structures.read',
  'salary.read', 'salary.pay',
  'communication.templates.read', 'communication.logs.read',
  'notices.read', 'notices.create', 'notices.update', 'notices.publish',
  'notifications.read',
  'reports.students.read', 'reports.attendance.read', 'reports.exams.read', 'reports.teachers.read',
  'reports.batches.read', 'reports.finance.read', 'reports.communication.read',
];

export const TEACHER_DEFAULTS: readonly PermissionCode[] = [
  'dashboard.read',
  'upload.use',
  'students.read',
  'courses.read',
  'batches.read',
  'routine.read',
  'attendance.read', 'attendance.create', 'attendance.update', 'attendance.alerts.read',
  'teacher_attendance.read',
  'exams.read', 'exams.marks.enter',
  'results.read',
  'homework.read', 'homework.create', 'homework.update', 'homework.delete', 'homework.publish',
  'materials.read', 'materials.create', 'materials.update', 'materials.delete', 'materials.publish',
  'questions.read', 'questions.create', 'questions.update', 'questions.delete', 'questions.publish',
  'question_papers.read', 'question_papers.create', 'question_papers.update', 'question_papers.finalize',
  'notices.read', 'notices.create', 'notices.update', 'notices.publish',
  'notifications.read',
  'reports.students.read', 'reports.attendance.read', 'reports.exams.read',
  'reports.batches.read',
];

/** ADMIN today can do everything except the OWNER-only actions. */
export const ADMIN_DEFAULTS: readonly PermissionCode[] = ALL_PERMISSION_CODES.filter((c) => !LOCKED_CODES.has(c));

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<ConfigurableRole, readonly PermissionCode[]>> = {
  ADMIN: ADMIN_DEFAULTS,
  STAFF: STAFF_DEFAULTS,
  TEACHER: TEACHER_DEFAULTS,
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** The minimal identity shape `can()` needs — satisfied by `SessionUser`. */
export interface PermissionSubject {
  role: RoleCode;
  permissions?: readonly string[];
}

/**
 * Does `user` hold `code`?
 *
 *  - no user / unknown code        -> false (never fails open, not even for OWNER)
 *  - OWNER                         -> true for every catalogued code, no lookup
 *  - OWNER-locked code, non-owner  -> false regardless of stored rows
 *  - everyone else                 -> must have been granted the code
 *
 * Tenant, branch and assignment scope are NOT evaluated here.
 */
export function can(user: PermissionSubject | null | undefined, code: PermissionCode): boolean {
  if (!user || typeof code !== 'string' || !KNOWN_CODES.has(code)) return false;
  if (user.role === 'OWNER') return true;
  if (LOCKED_CODES.has(code)) return false;
  return Array.isArray(user.permissions) && user.permissions.includes(code);
}

/** True when the user holds at least one of `codes` (used for parent routes/nav entries whose children carry the real permissions). */
export function canAny(user: PermissionSubject | null | undefined, codes: readonly PermissionCode[]): boolean {
  return codes.some((c) => can(user, c));
}

/**
 * The permission list a freshly seeded role holds (OWNER: the whole catalog).
 * Used by tests and hand-built identity fixtures; real sessions get their
 * list from the database (`toStaffIdentity`).
 */
export function defaultPermissionsFor(role: RoleCode): PermissionCode[] {
  if (role === 'OWNER') return [...ALL_PERMISSION_CODES];
  return [...DEFAULT_ROLE_PERMISSIONS[role as ConfigurableRole]];
}
