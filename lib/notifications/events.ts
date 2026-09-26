// Centralized notification/communication event registry. Every service,
// route, and template that needs an event key imports from here — no ad hoc
// event-name strings anywhere else in the app (AGENTS.md Phase 8 §4/§41).

export const NOTIFICATION_EVENTS = [
  'ATTENDANCE_ABSENT',
  'ATTENDANCE_LATE',
  'ATTENDANCE_LOW',
  'FEE_INVOICE_CREATED',
  'FEE_PAYMENT_RECEIVED',
  'FEE_PAYMENT_DUE',
  'FEE_PAYMENT_OVERDUE',
  'EXAM_SCHEDULED',
  'EXAM_UPDATED',
  'EXAM_CANCELLED',
  'RESULT_PUBLISHED',
  'NOTICE_PUBLISHED',
  'MATERIAL_PUBLISHED',
  'GENERAL_ANNOUNCEMENT',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
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
  ATTENDANCE_LATE: {
    en: { title: 'Late arrival recorded', body: '{{studentName}} was marked late in {{batchName}} today.' },
    bn: { title: 'দেরিতে উপস্থিতি নথিভুক্ত হয়েছে', body: 'আপনার সন্তান {{studentName}} আজ {{batchName}} ক্লাসে দেরিতে উপস্থিত হয়েছিল।' },
  },
  ATTENDANCE_LOW: {
    en: { title: 'Low attendance alert', body: "{{studentName}}'s attendance in {{batchName}} has fallen below the required threshold." },
    bn: { title: 'কম উপস্থিতির সতর্কতা', body: '{{studentName}}-এর {{batchName}}-এ উপস্থিতির হার নির্ধারিত মাত্রার নিচে নেমে গেছে।' },
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
  RESULT_PUBLISHED: {
    en: { title: 'Result published', body: 'Your result for {{examName}} has been published.' },
    bn: { title: 'ফলাফল প্রকাশিত হয়েছে', body: 'আপনার {{examName}} পরীক্ষার ফলাফল প্রকাশিত হয়েছে।' },
  },
  NOTICE_PUBLISHED: {
    en: { title: 'New notice published', body: '{{noticeTitle}}' },
    bn: { title: 'নতুন নোটিশ প্রকাশিত হয়েছে', body: '{{noticeTitle}}' },
  },
  MATERIAL_PUBLISHED: {
    en: { title: 'New study material available', body: 'New material for {{subjectName}} in {{batchName}} is now available.' },
    bn: { title: 'নতুন পাঠ্য উপকরণ প্রকাশিত হয়েছে', body: '{{batchName}}-এ {{subjectName}}-এর নতুন উপকরণ প্রকাশিত হয়েছে।' },
  },
  GENERAL_ANNOUNCEMENT: {
    en: { title: 'Announcement', body: '{{noticeTitle}}' },
    bn: { title: 'ঘোষণা', body: '{{noticeTitle}}' },
  },
};

export const NOTIFICATION_CATEGORIES = ['ATTENDANCE', 'FEE', 'EXAM', 'RESULT', 'NOTICE', 'MATERIAL'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const EVENT_CATEGORY: Record<NotificationEvent, NotificationCategory> = {
  ATTENDANCE_ABSENT: 'ATTENDANCE',
  ATTENDANCE_LATE: 'ATTENDANCE',
  ATTENDANCE_LOW: 'ATTENDANCE',
  FEE_INVOICE_CREATED: 'FEE',
  FEE_PAYMENT_RECEIVED: 'FEE',
  FEE_PAYMENT_DUE: 'FEE',
  FEE_PAYMENT_OVERDUE: 'FEE',
  EXAM_SCHEDULED: 'EXAM',
  EXAM_UPDATED: 'EXAM',
  EXAM_CANCELLED: 'EXAM',
  RESULT_PUBLISHED: 'RESULT',
  NOTICE_PUBLISHED: 'NOTICE',
  MATERIAL_PUBLISHED: 'MATERIAL',
  GENERAL_ANNOUNCEMENT: 'NOTICE',
};
