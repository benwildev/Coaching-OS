// Centralized notification/communication event registry. Every service,
// route, and template that needs an event key imports from here — no ad hoc
// event-name strings anywhere else in the app (AGENTS.md Phase 8 §4/§41).

export const NOTIFICATION_RECIPIENT_TYPES = ['STUDENT', 'GUARDIAN', 'TEACHER', 'ADMIN'] as const;
export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number];

export const NOTIFICATION_DELIVERY_CHANNELS = ['IN_APP', 'SMS', 'WHATSAPP', 'EMAIL', 'PUSH'] as const;
export type NotificationDeliveryChannel = (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  // Attendance
  'ATTENDANCE_ABSENT',
  'ATTENDANCE_PRESENT',
  'ATTENDANCE_LATE',
  'ATTENDANCE_SUMMARY',
  'ATTENDANCE_LOW',

  // Fees
  'FEE_DUE',
  'FEE_REMINDER',
  'FEE_OVERDUE',
  'FEE_PAYMENT_RECEIVED',
  'FEE_PAYMENT_FAILED',
  'FEE_REFUND',
  'FEE_INVOICE_CREATED',
  'FEE_PAYMENT_DUE',
  'FEE_PAYMENT_OVERDUE',
  'FEE_DISCOUNT_REQUESTED',
  'FEE_DISCOUNT_APPROVED',
  'FEE_DISCOUNT_REJECTED',

  // Academic / Exams
  'EXAM_SCHEDULE',
  'EXAM_SCHEDULED',
  'EXAM_UPDATED',
  'EXAM_CANCELLED',
  'EXAM_RESULT_PUBLISHED',
  'RESULT_PUBLISHED',
  'RESULT_UPDATED',
  'GRADE_PUBLISHED',

  // Homework
  'HOMEWORK_ASSIGNED',
  'HOMEWORK_PUBLISHED',
  'HOMEWORK_DUE_REMINDER',
  'HOMEWORK_SUBMISSION',
  'HOMEWORK_REVIEWED',

  // Notices
  'GENERAL_NOTICE',
  'URGENT_NOTICE',
  'ACADEMIC_NOTICE',
  'NOTICE_PUBLISHED',
  'GENERAL_ANNOUNCEMENT',

  // Schedule & Class
  'CLASS_SCHEDULE_CHANGED',
  'CLASS_CANCELLED',
  'CLASS_RESCHEDULED',

  // Admission
  'ADMISSION_CONFIRMED',
  'ADMISSION_UPDATED',

  // Communication & Materials
  'MESSAGE_RECEIVED',
  'ANNOUNCEMENT',
  'MATERIAL_PUBLISHED',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

// Canonical event aliases mapping for seamless backward-compatibility:
// Maps legacy domain triggers and alternative synonyms to the catalog notification policy types.
export const EVENT_ALIASES: Record<string, NotificationEvent> = {
  // Fees
  FEE_INVOICE_CREATED: 'FEE_REMINDER',
  FEE_PAYMENT_DUE: 'FEE_DUE',
  FEE_PAYMENT_OVERDUE: 'FEE_OVERDUE',

  // Exams & Results
  EXAM_SCHEDULED: 'EXAM_SCHEDULE',
  EXAM_RESULT_PUBLISHED: 'RESULT_PUBLISHED',

  // Homework
  HOMEWORK_ASSIGNED: 'HOMEWORK_PUBLISHED',
  HOMEWORK_SUBMISSION: 'HOMEWORK_REVIEWED',

  // Notices
  GENERAL_ANNOUNCEMENT: 'GENERAL_NOTICE',
  NOTICE_PUBLISHED: 'ACADEMIC_NOTICE',
  ANNOUNCEMENT: 'GENERAL_NOTICE',
};

export function canonicalNotificationEvent(event: string): NotificationEvent {
  if (EVENT_ALIASES[event]) return EVENT_ALIASES[event];
  if (isNotificationEvent(event)) return event;
  return event as NotificationEvent;
}

// The only placeholders template bodies may use. Anything else in a
// `{{...}}` tag is left as literal text by the interpolator — never
// executed (AGENTS.md §20).
export const TEMPLATE_VARIABLES = [
  'studentName',
  'guardianName',
  'invoiceNumber',
  'amount',
  'dueAmount',
  'paymentDate',
  'examName',
  'examDate',
  'resultDate',
  'noticeTitle',
  'batchName',
  'subjectName',
  'className',
  'date',
  'time',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

interface EventCopy {
  en: { title: string; body: string };
  bn: { title: string; body: string };
}

// Built-in copy used when a coaching center hasn't defined its own
// CommunicationTemplate override for an event+channel yet.
export const DEFAULT_EVENT_COPY: Record<NotificationEvent, EventCopy> = {
  ATTENDANCE_ABSENT: {
    en: { title: 'Absence recorded', body: '{{studentName}} was marked absent in {{batchName}} today.' },
    bn: { title: 'অনুপস্থিতি নথিভুক্ত হয়েছে', body: 'আপনার সন্তান {{studentName}} আজ {{batchName}} ক্লাসে অনুপস্থিত ছিল।' },
  },
  ATTENDANCE_PRESENT: {
    en: { title: 'Attendance recorded', body: '{{studentName}} was present in {{batchName}} today.' },
    bn: { title: 'উপস্থিতি নথিভুক্ত হয়েছে', body: '{{studentName}} আজ {{batchName}} ক্লাসে উপস্থিত ছিল।' },
  },
  ATTENDANCE_LATE: {
    en: { title: 'Late arrival recorded', body: '{{studentName}} was marked late in {{batchName}} today.' },
    bn: { title: 'দেরিতে উপস্থিতি নথিভুক্ত হয়েছে', body: 'আপনার সন্তান {{studentName}} আজ {{batchName}} ক্লাসে দেরিতে উপস্থিত হয়েছিল।' },
  },
  ATTENDANCE_SUMMARY: {
    en: { title: 'Attendance summary', body: 'Attendance summary for {{studentName}} in {{batchName}} is now ready.' },
    bn: { title: 'উপস্থিতির সারসংক্ষেপ', body: '{{studentName}}-এর {{batchName}} ক্লাসের উপস্থিতির সারসংক্ষেপ প্রস্তুত।' },
  },
  ATTENDANCE_LOW: {
    en: { title: 'Low attendance alert', body: "{{studentName}}'s attendance in {{batchName}} has fallen below the required threshold." },
    bn: { title: 'কম উপস্থিতির সতর্কতা', body: '{{studentName}}-এর {{batchName}}-এ উপস্থিতির হার নির্ধারিত মাত্রার নিচে নেমে গেছে।' },
  },
  FEE_DUE: {
    en: { title: 'Payment due', body: 'A payment of ৳{{dueAmount}} for {{studentName}} is due.' },
    bn: { title: 'পেমেন্ট বকেয়া', body: '{{studentName}}-এর জন্য ৳{{dueAmount}} বকেয়া রয়েছে।' },
  },
  FEE_REMINDER: {
    en: { title: 'Fee reminder', body: 'Reminder: Fee payment for {{studentName}} is due soon.' },
    bn: { title: 'ফি পরিশোধের তাগিদ', body: 'অনুস্মারক: {{studentName}}-এর ফি পরিশোধের সময় ঘনিয়ে এসেছে।' },
  },
  FEE_OVERDUE: {
    en: { title: 'Payment overdue', body: 'Your fee payment of ৳{{dueAmount}} for {{studentName}} is overdue.' },
    bn: { title: 'পেমেন্ট মেয়াদোত্তীর্ণ', body: '{{studentName}}-এর ৳{{dueAmount}} ফি পরিশোধের মেয়াদ পেরিয়ে গেছে।' },
  },
  FEE_INVOICE_CREATED: {
    en: { title: 'New invoice issued', body: 'Invoice {{invoiceNumber}} of ৳{{amount}} has been issued for {{studentName}}.' },
    bn: { title: 'নতুন ইনভয়েস তৈরি হয়েছে', body: '{{studentName}}-এর জন্য {{invoiceNumber}} নম্বর ইনভয়েস (৳{{amount}}) তৈরি করা হয়েছে।' },
  },
  FEE_PAYMENT_RECEIVED: {
    en: { title: 'Fee payment received', body: 'Your fee payment of ৳{{amount}} on {{paymentDate}} has been recorded.' },
    bn: { title: 'ফি পরিশোধ সফল হয়েছে', body: 'আপনার ৳{{amount}} ফি পেমেন্ট {{paymentDate}} তারিখে গ্রহণ করা হয়েছে।' },
  },
  FEE_PAYMENT_DUE: {
    en: { title: 'Payment due', body: 'A payment of ৳{{dueAmount}} for {{studentName}} is due.' },
    bn: { title: 'পেমেন্ট বকেয়া', body: '{{studentName}}-এর জন্য ৳{{dueAmount}} বকেয়া রয়েছে।' },
  },
  FEE_PAYMENT_OVERDUE: {
    en: { title: 'Payment overdue', body: 'Your fee payment of ৳{{dueAmount}} for {{studentName}} is overdue.' },
    bn: { title: 'পেমেন্ট মেয়াদোত্তীর্ণ', body: '{{studentName}}-এর ৳{{dueAmount}} ফি পরিশোধের মেয়াদ পেরিয়ে গেছে।' },
  },
  FEE_PAYMENT_FAILED: {
    en: { title: 'Payment failed', body: 'Fee payment transaction for {{studentName}} could not be completed.' },
    bn: { title: 'পেমেন্ট ব্যর্থ হয়েছে', body: '{{studentName}}-এর ফি পেমেন্ট সম্পন্ন করা যায়নি।' },
  },
  FEE_REFUND: {
    en: { title: 'Payment refunded', body: 'A refund of ৳{{amount}} has been processed for {{studentName}}.' },
    bn: { title: 'ফি রিফান্ড সম্পন্ন', body: '{{studentName}}-এর জন্য ৳{{amount}} রিফান্ড প্রদান করা হয়েছে।' },
  },
  FEE_DISCOUNT_REQUESTED: {
    en: { title: 'New Discount/Waiver Request', body: 'A discount/waiver request of ৳{{amount}} for {{studentName}} requires your approval.' },
    bn: { title: 'নতুন ছাড়/মওকুফ আবেদন', body: '{{studentName}}-এর জন্য ৳{{amount}} ছাড় বা মওকুফের আবেদন অনুমোদনের অপেক্ষায় রয়েছে।' },
  },
  FEE_DISCOUNT_APPROVED: {
    en: { title: 'Discount/Waiver Approved', body: 'Your discount/waiver request of ৳{{amount}} for {{studentName}} has been approved.' },
    bn: { title: 'ছাড়/মওকুফ আবেদন অনুমোদিত', body: '{{studentName}}-এর জন্য ৳{{amount}} ছাড় বা মওকুফের আবেদন অনুমোদিত হয়েছে।' },
  },
  FEE_DISCOUNT_REJECTED: {
    en: { title: 'Discount/Waiver Rejected', body: 'Your discount/waiver request of ৳{{amount}} for {{studentName}} was rejected.' },
    bn: { title: 'ছাড়/মওকুফ আবেদন প্রত্যাখ্যাত', body: '{{studentName}}-এর জন্য ৳{{amount}} ছাড় বা মওকুফের আবেদন প্রত্যাখ্যাত হয়েছে।' },
  },
  EXAM_SCHEDULE: {
    en: { title: 'Exam scheduled', body: '{{examName}} has been scheduled on {{examDate}}.' },
    bn: { title: 'পরীক্ষা নির্ধারিত হয়েছে', body: '{{examName}} {{examDate}} তারিখে অনুষ্ঠিত হবে।' },
  },
  EXAM_SCHEDULED: {
    en: { title: 'Exam scheduled', body: '{{examName}} has been scheduled on {{examDate}}.' },
    bn: { title: 'পরীক্ষা নির্ধারিত হয়েছে', body: '{{examName}} {{examDate}} তারিখে অনুষ্ঠিত হবে।' },
  },
  EXAM_UPDATED: {
    en: { title: 'Exam updated', body: '{{examName}} has been rescheduled to {{examDate}}.' },
    bn: { title: 'পরীক্ষার তারিখ পরিবর্তন হয়েছে', body: '{{examName}} পরীক্ষার নতুন তারিখ {{examDate}}।' },
  },
  EXAM_CANCELLED: {
    en: { title: 'Exam cancelled', body: '{{examName}} scheduled on {{examDate}} has been cancelled.' },
    bn: { title: 'পরীক্ষা বাতিল হয়েছে', body: '{{examDate}} তারিখের {{examName}} পরীক্ষা বাতিল করা হয়েছে।' },
  },
  EXAM_RESULT_PUBLISHED: {
    en: { title: 'Result published', body: 'Your result for {{examName}} has been published.' },
    bn: { title: 'ফলাফল প্রকাশিত হয়েছে', body: 'আপনার {{examName}} পরীক্ষার ফলাফল প্রকাশিত হয়েছে।' },
  },
  RESULT_PUBLISHED: {
    en: { title: 'Result published', body: 'Your result for {{examName}} has been published.' },
    bn: { title: 'ফলাফল প্রকাশিত হয়েছে', body: 'আপনার {{examName}} পরীক্ষার ফলাফল প্রকাশিত হয়েছে।' },
  },
  RESULT_UPDATED: {
    en: { title: 'Result updated', body: 'Your result for {{examName}} has been revised.' },
    bn: { title: 'ফলাফল পরিমার্জিত হয়েছে', body: 'আপনার {{examName}} পরীক্ষার ফলাফল সংশোধন করা হয়েছে।' },
  },
  GRADE_PUBLISHED: {
    en: { title: 'Grade published', body: 'Grade report for {{studentName}} is now available.' },
    bn: { title: 'গ্রেড প্রকাশিত হয়েছে', body: '{{studentName}}-এর গ্রেড রিপোর্ট প্রকাশিত হয়েছে।' },
  },
  HOMEWORK_ASSIGNED: {
    en: { title: 'New homework assigned', body: 'New homework for {{subjectName}} in {{batchName}} has been assigned.' },
    bn: { title: 'নতুন হোমওয়ার্ক দেওয়া হয়েছে', body: '{{batchName}}-এ {{subjectName}}-এর নতুন হোমওয়ার্ক দেওয়া হয়েছে।' },
  },
  HOMEWORK_PUBLISHED: {
    en: { title: 'New homework assigned', body: 'New homework for {{subjectName}} in {{batchName}} has been assigned.' },
    bn: { title: 'নতুন হোমওয়ার্ক দেওয়া হয়েছে', body: '{{batchName}}-এ {{subjectName}}-এর নতুন হোমওয়ার্ক দেওয়া হয়েছে।' },
  },
  HOMEWORK_DUE_REMINDER: {
    en: { title: 'Homework due reminder', body: 'Reminder: Homework for {{subjectName}} is due soon.' },
    bn: { title: 'হোমওয়ার্ক জমার তাগিদ', body: 'অনুস্মারক: {{subjectName}}-এর হোমওয়ার্ক জমা দেওয়ার সময় ঘনিয়ে এসেছে।' },
  },
  HOMEWORK_SUBMISSION: {
    en: { title: 'Homework submitted', body: 'Homework submission received for {{subjectName}}.' },
    bn: { title: 'হোমওয়ার্ক জমা হয়েছে', body: '{{subjectName}}-এর হোমওয়ার্ক সফলভাবে জমা নেওয়া হয়েছে।' },
  },
  HOMEWORK_REVIEWED: {
    en: { title: 'Homework reviewed', body: 'Your homework for {{subjectName}} in {{batchName}} has been reviewed.' },
    bn: { title: 'হোমওয়ার্ক পর্যালোচনা হয়েছে', body: '{{batchName}}-এ {{subjectName}}-এর হোমওয়ার্ক পর্যালোচনা করা হয়েছে।' },
  },
  GENERAL_NOTICE: {
    en: { title: 'General notice', body: '{{noticeTitle}}' },
    bn: { title: 'সাধারণ নোটিশ', body: '{{noticeTitle}}' },
  },
  URGENT_NOTICE: {
    en: { title: 'URGENT NOTICE', body: '⚠️ URGENT: {{noticeTitle}}' },
    bn: { title: 'জরুরি নোটিশ', body: '⚠️ জরুরি: {{noticeTitle}}' },
  },
  ACADEMIC_NOTICE: {
    en: { title: 'Academic notice', body: '{{noticeTitle}}' },
    bn: { title: 'একাডেমিক নোটিশ', body: '{{noticeTitle}}' },
  },
  NOTICE_PUBLISHED: {
    en: { title: 'New notice published', body: '{{noticeTitle}}' },
    bn: { title: 'নতুন নোটিশ প্রকাশিত হয়েছে', body: '{{noticeTitle}}' },
  },
  GENERAL_ANNOUNCEMENT: {
    en: { title: 'Announcement', body: '{{noticeTitle}}' },
    bn: { title: 'ঘোষণা', body: '{{noticeTitle}}' },
  },
  CLASS_SCHEDULE_CHANGED: {
    en: { title: 'Class schedule changed', body: 'The schedule for {{batchName}} has been updated.' },
    bn: { title: 'ক্লাস সূচি পরিবর্তিত হয়েছে', body: '{{batchName}}-এর ক্লাসের সময়সূচি পরিবর্তন করা হয়েছে।' },
  },
  CLASS_CANCELLED: {
    en: { title: 'Class cancelled', body: 'Class for {{batchName}} on {{date}} has been cancelled.' },
    bn: { title: 'ক্লাস বাতিল করা হয়েছে', body: '{{date}} তারিখে {{batchName}}-এর ক্লাস বাতিল করা হয়েছে।' },
  },
  CLASS_RESCHEDULED: {
    en: { title: 'Class rescheduled', body: 'Class for {{batchName}} has been rescheduled to {{date}} at {{time}}.' },
    bn: { title: 'ক্লাসের নতুন সময় নির্ধারণ', body: '{{batchName}}-এর ক্লাস {{date}} তারিখ {{time}} সময়ে অনুষ্ঠিত হবে।' },
  },
  ADMISSION_CONFIRMED: {
    en: { title: 'Admission confirmed', body: 'Admission confirmed for {{studentName}} in {{batchName}}.' },
    bn: { title: 'ভর্তি নিশ্চিত হয়েছে', body: '{{batchName}}-এ {{studentName}}-এর ভর্তি নিশ্চিত হয়েছে।' },
  },
  ADMISSION_UPDATED: {
    en: { title: 'Admission updated', body: 'Admission details updated for {{studentName}}.' },
    bn: { title: 'ভর্তির তথ্য হালনাগাদ', body: '{{studentName}}-এর ভর্তির তথ্য হালনাগাদ করা হয়েছে।' },
  },
  MESSAGE_RECEIVED: {
    en: { title: 'New message received', body: 'You have received a new message from {{senderName}}.' },
    bn: { title: 'নতুন বার্তা এসেছে', body: 'আপনার জন্য একটি নতুন বার্তা এসেছে।' },
  },
  ANNOUNCEMENT: {
    en: { title: 'Announcement', body: '{{noticeTitle}}' },
    bn: { title: 'ঘোষণা', body: '{{noticeTitle}}' },
  },
  MATERIAL_PUBLISHED: {
    en: { title: 'New study material available', body: 'New material for {{subjectName}} in {{batchName}} is now available.' },
    bn: { title: 'নতুন পাঠ্য উপকরণ প্রকাশিত হয়েছে', body: '{{batchName}}-এ {{subjectName}}-এর নতুন উপকরণ প্রকাশিত হয়েছে।' },
  },
};

export const NOTIFICATION_CATEGORIES = [
  'ATTENDANCE',
  'FEE',
  'EXAM',
  'RESULT',
  'HOMEWORK',
  'NOTICE',
  'SCHEDULE',
  'ADMISSION',
  'COMMUNICATION',
  'MATERIAL',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const EVENT_CATEGORY: Record<NotificationEvent, NotificationCategory> = {
  ATTENDANCE_ABSENT: 'ATTENDANCE',
  ATTENDANCE_PRESENT: 'ATTENDANCE',
  ATTENDANCE_LATE: 'ATTENDANCE',
  ATTENDANCE_SUMMARY: 'ATTENDANCE',
  ATTENDANCE_LOW: 'ATTENDANCE',

  FEE_DUE: 'FEE',
  FEE_REMINDER: 'FEE',
  FEE_OVERDUE: 'FEE',
  FEE_INVOICE_CREATED: 'FEE',
  FEE_PAYMENT_RECEIVED: 'FEE',
  FEE_PAYMENT_DUE: 'FEE',
  FEE_PAYMENT_OVERDUE: 'FEE',
  FEE_PAYMENT_FAILED: 'FEE',
  FEE_REFUND: 'FEE',
  FEE_DISCOUNT_REQUESTED: 'FEE',
  FEE_DISCOUNT_APPROVED: 'FEE',
  FEE_DISCOUNT_REJECTED: 'FEE',

  EXAM_SCHEDULE: 'EXAM',
  EXAM_SCHEDULED: 'EXAM',
  EXAM_UPDATED: 'EXAM',
  EXAM_CANCELLED: 'EXAM',
  EXAM_RESULT_PUBLISHED: 'RESULT',
  RESULT_PUBLISHED: 'RESULT',
  RESULT_UPDATED: 'RESULT',
  GRADE_PUBLISHED: 'RESULT',

  HOMEWORK_ASSIGNED: 'HOMEWORK',
  HOMEWORK_PUBLISHED: 'HOMEWORK',
  HOMEWORK_DUE_REMINDER: 'HOMEWORK',
  HOMEWORK_SUBMISSION: 'HOMEWORK',
  HOMEWORK_REVIEWED: 'HOMEWORK',

  GENERAL_NOTICE: 'NOTICE',
  URGENT_NOTICE: 'NOTICE',
  ACADEMIC_NOTICE: 'NOTICE',
  NOTICE_PUBLISHED: 'NOTICE',
  GENERAL_ANNOUNCEMENT: 'NOTICE',

  CLASS_SCHEDULE_CHANGED: 'SCHEDULE',
  CLASS_CANCELLED: 'SCHEDULE',
  CLASS_RESCHEDULED: 'SCHEDULE',

  ADMISSION_CONFIRMED: 'ADMISSION',
  ADMISSION_UPDATED: 'ADMISSION',

  MESSAGE_RECEIVED: 'COMMUNICATION',
  ANNOUNCEMENT: 'COMMUNICATION',
  MATERIAL_PUBLISHED: 'MATERIAL',
};
