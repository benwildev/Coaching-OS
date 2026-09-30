import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import {
  type NotificationRecipientType,
  type NotificationDeliveryChannel,
  type NotificationCategory,
  canonicalNotificationEvent,
} from '@/lib/notifications/events';
import type { NotificationPolicyUpdateItem } from '@/lib/validations/notification';

export interface CatalogPolicyDefinition {
  notificationType: string;
  category: NotificationCategory;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  isMandatory: boolean;
  defaultEnabled: boolean;
  recipients: Array<{
    recipientType: NotificationRecipientType;
    isMandatory: boolean;
    defaultEnabled: boolean;
    defaultChannels: Record<NotificationDeliveryChannel, boolean>;
  }>;
}

const DEFAULT_CHANNELS_ALL_ON: Record<NotificationDeliveryChannel, boolean> = {
  IN_APP: true,
  SMS: true,
  WHATSAPP: true,
  EMAIL: true,
  PUSH: false,
};

const DEFAULT_CHANNELS_INAPP_ONLY: Record<NotificationDeliveryChannel, boolean> = {
  IN_APP: true,
  SMS: false,
  WHATSAPP: false,
  EMAIL: false,
  PUSH: false,
};

const DEFAULT_CHANNELS_STAFF: Record<NotificationDeliveryChannel, boolean> = {
  IN_APP: true,
  SMS: false,
  WHATSAPP: false,
  EMAIL: true,
  PUSH: false,
};

// ==========================================
// CENTRALIZED NOTIFICATION POLICIES CATALOG
// ==========================================

export const POLICY_DEFINITIONS_CATALOG: CatalogPolicyDefinition[] = [
  // --- Attendance ---
  {
    notificationType: 'ATTENDANCE_ABSENT',
    category: 'ATTENDANCE',
    titleEn: 'Attendance Absent',
    titleBn: 'অনুপস্থিতির সতর্কতা',
    descriptionEn: 'Notify immediately when a student is recorded absent in a class or batch.',
    descriptionBn: 'ক্লাসে বা ব্যাচে শিক্ষার্থী অনুপস্থিত থাকলে অবিলম্বে নোটিফিকেশন পাঠান।',
    isMandatory: true,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'ATTENDANCE_LATE',
    category: 'ATTENDANCE',
    titleEn: 'Attendance Late Arrival',
    titleBn: 'দেরিতে উপস্থিতির তথ্য',
    descriptionEn: 'Notify when a student arrives late for their scheduled batch.',
    descriptionBn: 'নির্ধারিত ব্যাচে শিক্ষার্থী দেরিতে পৌঁছালে বার্তা প্রদান করুন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'ATTENDANCE_PRESENT',
    category: 'ATTENDANCE',
    titleEn: 'Daily Attendance Recorded',
    titleBn: 'দৈনিক উপস্থিতি নিশ্চিতকরণ',
    descriptionEn: 'Send confirmation when regular attendance is recorded.',
    descriptionBn: 'শিক্ষার্থী ক্লাসে নিয়মিত উপস্থিত থাকলে নিশ্চিতকরণ বার্তা পাঠান।',
    isMandatory: false,
    defaultEnabled: false,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'ATTENDANCE_SUMMARY',
    category: 'ATTENDANCE',
    titleEn: 'Attendance Periodic Summary',
    titleBn: 'উপস্থিতির পর্যায়ক্রমিক বিবরণী',
    descriptionEn: 'Periodic weekly/monthly attendance statistics and performance summaries.',
    descriptionBn: 'সাপ্তাহিক বা মাসিক উপস্থিতির শতকরা হার ও সারসংক্ষেপ বার্তা।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'ATTENDANCE_LOW',
    category: 'ATTENDANCE',
    titleEn: 'Low Attendance Warning',
    titleBn: 'কম উপস্থিতির সতর্কবার্তা',
    descriptionEn: 'Automatic warning when attendance percentage falls below center threshold.',
    descriptionBn: 'উপস্থিতির হার নির্ধারিত ন্যূনতম মাত্রার নিচে নেমে গেলে অভিভাবককে সতর্কবার্তা।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Fees ---
  {
    notificationType: 'FEE_REMINDER',
    category: 'FEE',
    titleEn: 'Fee Payment Reminder',
    titleBn: 'ফি পরিশোধের তাগিদ',
    descriptionEn: 'Notice of upcoming fee invoices and scheduled payment deadlines.',
    descriptionBn: 'আসন্ন বকেয়া ফি এবং নির্ধারিত পরিশোধ তারিখের পূর্বে আগাম বার্তা।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'FEE_OVERDUE',
    category: 'FEE',
    titleEn: 'Fee Payment Overdue',
    titleBn: 'মেয়াদোত্তীর্ণ ফি নোটিশ',
    descriptionEn: 'Urgent reminder when an invoice has passed its due date without full payment.',
    descriptionBn: 'ফি পরিশোধের শেষ তারিখ অতিক্রান্ত হওয়ার পর বকেয়া আদায়ের তাগিদ বার্তা।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'FEE_PAYMENT_RECEIVED',
    category: 'FEE',
    titleEn: 'Payment Receipt Confirmation',
    titleBn: 'ফি প্রাপ্তি রশিদ নিশ্চিতকরণ',
    descriptionEn: 'Instant receipt acknowledgement when tuition or exam fees are paid.',
    descriptionBn: 'শিক্ষার্থীর ফি পরিশোধ সম্পন্ন হওয়ার পর ডিজিটাল মানি রিসিট নিশ্চিতকরণ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'FEE_PAYMENT_FAILED',
    category: 'FEE',
    titleEn: 'Payment Transaction Failed',
    titleBn: 'পেমেন্ট ব্যর্থ হয়েছে',
    descriptionEn: 'Alert when an online bKash/Nagad or bank payment attempt encounters an error.',
    descriptionBn: 'অনলাইন পেমেন্ট কোনো কারণে সফল না হলে অভিভাবককে সতর্কতা প্রদান।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'FEE_REFUND',
    category: 'FEE',
    titleEn: 'Payment Refund Issued',
    titleBn: 'ফি রিফান্ড নিশ্চিতকরণ',
    descriptionEn: 'Notification when an adjustment or payment refund has been processed.',
    descriptionBn: 'শিক্ষার্থীর অ্যাকাউন্টে অর্থ রিফান্ড বা সমন্বয় করা হলে নিশ্চিতকরণ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Academic & Exams ---
  {
    notificationType: 'EXAM_SCHEDULED',
    category: 'EXAM',
    titleEn: 'Exam Routine Scheduled',
    titleBn: 'পরীক্ষার সময়সূচি নির্ধারণ',
    descriptionEn: 'Announcement of upcoming exam schedules, seat plans, and dates.',
    descriptionBn: 'আসন্ন পরীক্ষার রুটিন, সময় এবং পরীক্ষার কেন্দ্র সংক্রান্ত তথ্য।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'RESULT_PUBLISHED',
    category: 'RESULT',
    titleEn: 'Exam Result Published',
    titleBn: 'পরীক্ষার ফলাফল প্রকাশ',
    descriptionEn: 'Direct publication of exam marks, ranks, and performance scorecards.',
    descriptionBn: 'পরীক্ষার নম্বরপত্র, মেধা তালিকা ও ফলাফল প্রকাশের নোটিফিকেশন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'RESULT_UPDATED',
    category: 'RESULT',
    titleEn: 'Result Recheck / Updated',
    titleBn: 'ফলাফল পুনর্মূল্যায়ন বা সংশোধন',
    descriptionEn: 'Notice when an exam mark is corrected or updated after re-evaluation.',
    descriptionBn: 'নম্বর পুনঃনিরীক্ষণ বা সংশোধনের পর হালনাগাদ ফলাফল সংক্রান্ত নোটিশ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'GRADE_PUBLISHED',
    category: 'RESULT',
    titleEn: 'Grade Card / Transcript Published',
    titleBn: 'গ্রেড শিট বা সনদ প্রকাশ',
    descriptionEn: 'Issuance of formal grade transcripts and term progress reports.',
    descriptionBn: 'সামষ্টিক মূল্যায়ন, গ্রেড কার্ড অথবা অগ্রগতি প্রতিবেদন প্রকাশের নোটিশ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Homework ---
  {
    notificationType: 'HOMEWORK_PUBLISHED',
    category: 'HOMEWORK',
    titleEn: 'Homework Assigned',
    titleBn: 'নতুন হোমওয়ার্ক প্রদান',
    descriptionEn: 'Alert when a teacher posts new assignments or tasks for a batch.',
    descriptionBn: 'শিক্ষক ক্লাসে নতুন বাড়ির কাজ বা এসাইনমেন্ট দিলে নোটিফিকেশন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'HOMEWORK_DUE_REMINDER',
    category: 'HOMEWORK',
    titleEn: 'Homework Submission Due Reminder',
    titleBn: 'হোমওয়ার্ক জমা দেওয়ার তাগিদ',
    descriptionEn: 'Reminder sent before homework submission deadline expires.',
    descriptionBn: 'হোমওয়ার্ক জমা দেওয়ার সময়সীমা সমাপ্ত হওয়ার পূর্বে শিক্ষার্থীদের তাগিদ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'HOMEWORK_REVIEWED',
    category: 'HOMEWORK',
    titleEn: 'Homework Evaluated & Reviewed',
    titleBn: 'হোমওয়ার্ক মূল্যায়ন সম্পন্ন',
    descriptionEn: 'Feedback and marks returned by the teacher on homework submission.',
    descriptionBn: 'শিক্ষক কর্তৃক বাড়ির কাজ মূল্যায়ন ও মন্তব্য প্রদান করা হলে নোটিফিকেশন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Notices ---
  {
    notificationType: 'URGENT_NOTICE',
    category: 'NOTICE',
    titleEn: 'Urgent Center Notice',
    titleBn: 'জরুরি নোটিশ ⚠️',
    descriptionEn: 'Critical emergency notices such as sudden holidays, security, or storm warnings.',
    descriptionBn: 'জরুরি বা অনাকাঙ্ক্ষিত পরিস্থিতিতে কেন্দ্র বন্ধ অথবা গুরুত্বপূর্ণ ঘোষণা।',
    isMandatory: true,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'GUARDIAN', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'ADMIN', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
    ],
  },
  {
    notificationType: 'NOTICE_PUBLISHED',
    category: 'NOTICE',
    titleEn: 'General Notice Board Announcement',
    titleBn: 'সাধারণ নোটিশ বোর্ড বিজ্ঞপ্তি',
    descriptionEn: 'General notices published to center, branch, or batch notice boards.',
    descriptionBn: 'কোচিং কেন্দ্র, শাখা বা ব্যাচভিত্তিক সাধারণ নোটিশের বিজ্ঞপ্তি।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Schedule & Classes ---
  {
    notificationType: 'CLASS_CANCELLED',
    category: 'SCHEDULE',
    titleEn: 'Class Cancellation Alert',
    titleBn: 'ক্লাস বাতিল সংক্রান্ত সতর্কতা',
    descriptionEn: 'Urgent notice when a scheduled batch class has been cancelled.',
    descriptionBn: 'বিশেষ কারণে ব্যাচের কোনো ক্লাস বাতিল হলে দ্রুত নোটিফিকেশন পাঠান।',
    isMandatory: true,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: true, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'CLASS_SCHEDULE_CHANGED',
    category: 'SCHEDULE',
    titleEn: 'Class Schedule Changed',
    titleBn: 'ক্লাসের সময়সূচি পরিবর্তন',
    descriptionEn: 'Notification when class time, room, or day has been shifted.',
    descriptionBn: 'ক্লাসের সময়, কক্ষ বা দিনের সময়সূচিতে কোনো পরিবর্তন আনা হলে নোটিশ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'CLASS_RESCHEDULED',
    category: 'SCHEDULE',
    titleEn: 'Class Rescheduled / Make-up Class',
    titleBn: 'মেক-আপ বা অতিরিক্ত ক্লাস',
    descriptionEn: 'Notice of replacement or extra make-up class sessions.',
    descriptionBn: 'বাতিলকৃত ক্লাসের পরিবর্তে অতিরিক্ত বা বিকল্প ক্লাসের সময় নির্ধারণ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },

  // --- Admission & Messages ---
  {
    notificationType: 'ADMISSION_CONFIRMED',
    category: 'ADMISSION',
    titleEn: 'Admission & Enrollment Confirmed',
    titleBn: 'ভর্তি নিশ্চিতকরণ তথ্য',
    descriptionEn: 'Welcome message and credentials sent upon new student enrollment.',
    descriptionBn: 'নতুন শিক্ষার্থী ভর্তি ও ব্যাচে সংযুক্তি সম্পন্ন হলে স্বাগত বার্তা।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'ADMISSION_UPDATED',
    category: 'ADMISSION',
    titleEn: 'Admission / Batch Shift Updated',
    titleBn: 'ভর্তি বা ব্যাচ স্থানান্তর তথ্য',
    descriptionEn: 'Notice when student batch, class, or enrollment profile is modified.',
    descriptionBn: 'শিক্ষার্থীর কোর্স বা ব্যাচ পরিবর্তন ও তথ্য হালনাগাদের নোটিফিকেশন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'MESSAGE_RECEIVED',
    category: 'COMMUNICATION',
    titleEn: 'Direct Message Received',
    titleBn: 'নতুন ব্যক্তিগত বার্তা',
    descriptionEn: 'Alert when a staff member or teacher sends an individual message.',
    descriptionBn: 'শিক্ষক বা অভিভাবকের পক্ষ থেকে ব্যক্তিগত বার্তা পাঠানো হলে নোটিফিকেশন।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
  {
    notificationType: 'MATERIAL_PUBLISHED',
    category: 'MATERIAL',
    titleEn: 'New Study Material Published',
    titleBn: 'নতুন পাঠ্য উপকরণ প্রকাশ',
    descriptionEn: 'Alert when lecture sheets, notes, or model question PDFs are uploaded.',
    descriptionBn: 'শিক্ষার্থীদের জন্য লেকচার শিট, হ্যান্ডনোট বা প্রশ্ন আপলোড করা হলে নোটিশ।',
    isMandatory: false,
    defaultEnabled: true,
    recipients: [
      { recipientType: 'STUDENT', isMandatory: false, defaultEnabled: true, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'GUARDIAN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_ALL_ON },
      { recipientType: 'TEACHER', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_INAPP_ONLY },
      { recipientType: 'ADMIN', isMandatory: false, defaultEnabled: false, defaultChannels: DEFAULT_CHANNELS_STAFF },
    ],
  },
];

const CATALOG_BY_TYPE = new Map(POLICY_DEFINITIONS_CATALOG.map((p) => [p.notificationType, p]));

/**
 * Checks whether a notification type is mandatory in the catalog.
 */
export function isNotificationMandatory(notificationType: string): boolean {
  const canonical = canonicalNotificationEvent(notificationType);
  const def = CATALOG_BY_TYPE.get(canonical) || CATALOG_BY_TYPE.get(notificationType);
  return def?.isMandatory ?? false;
}

/**
 * Checks whether a specific recipient type is mandatory for a notification type.
 */
export function isRecipientMandatory(notificationType: string, recipientType: NotificationRecipientType): boolean {
  const canonical = canonicalNotificationEvent(notificationType);
  const def = CATALOG_BY_TYPE.get(canonical) || CATALOG_BY_TYPE.get(notificationType);
  if (!def) return false;
  const rec = def.recipients.find((r) => r.recipientType === recipientType);
  return rec?.isMandatory ?? false;
}

export function canDisableNotification(notificationType: string): boolean {
  return !isNotificationMandatory(notificationType);
}

/**
 * Auto-seeds / backfills default policies for an organization if any policy
 * is missing. Also enforces DB-level mandatory flags match the catalog rules.
 */
export async function ensureDefaultPolicies(coachingCenterId: string): Promise<void> {
  const existing = await prisma.notificationPolicy.findMany({
    where: { coachingCenterId },
    select: { id: true, notificationType: true, isMandatory: true, isEnabled: true },
  });

  const existingMap = new Map(existing.map((e) => [e.notificationType, e]));
  const missingDefs = POLICY_DEFINITIONS_CATALOG.filter((def) => !existingMap.has(def.notificationType));

  // Create missing policies in parallel chunks to minimize database roundtrips
  if (missingDefs.length > 0) {
    const BATCH_SIZE = 6;
    for (let i = 0; i < missingDefs.length; i += BATCH_SIZE) {
      const chunk = missingDefs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map((def) =>
          prisma.notificationPolicy.create({
            data: {
              coachingCenterId,
              notificationType: def.notificationType,
              isMandatory: def.isMandatory,
              isEnabled: def.isMandatory ? true : def.defaultEnabled,
              recipients: {
                create: def.recipients.map((r) => ({
                  recipientType: r.recipientType,
                  isEnabled: r.isMandatory ? true : r.defaultEnabled,
                  isMandatory: r.isMandatory,
                  channels: {
                    create: Object.entries(r.defaultChannels).map(([ch, isEnabled]) => ({
                      channel: ch as NotificationDeliveryChannel,
                      isEnabled,
                    })),
                  },
                })),
              },
            },
          })
        )
      );
    }
  }

  // Re-assert mandatory integrity if needed
  const mandatoryToFix = existing.filter((row) => {
    const def = CATALOG_BY_TYPE.get(row.notificationType);
    return def?.isMandatory && (!row.isMandatory || !row.isEnabled);
  });

  if (mandatoryToFix.length > 0) {
    await Promise.all(
      mandatoryToFix.map((row) =>
        prisma.notificationPolicy.update({
          where: { id: row.id },
          data: { isMandatory: true, isEnabled: true },
        })
      )
    );
  }
}

export interface EnrichedNotificationPolicy {
  id: string;
  coachingCenterId: string;
  notificationType: string;
  category: NotificationCategory;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  isMandatory: boolean;
  isEnabled: boolean;
  recipients: Array<{
    id: string;
    recipientType: NotificationRecipientType;
    isEnabled: boolean;
    isMandatory: boolean;
    channels: Array<{
      id: string;
      channel: NotificationDeliveryChannel;
      isEnabled: boolean;
    }>;
  }>;
}

/**
 * Retrieves all notification alert policies for a coaching center.
 */
export async function getNotificationPolicies(coachingCenterId: string): Promise<EnrichedNotificationPolicy[]> {
  await ensureDefaultPolicies(coachingCenterId);

  const policies = await prisma.notificationPolicy.findMany({
    where: { coachingCenterId },
    include: {
      recipients: {
        include: {
          channels: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return policies.map((p) => {
    const def = CATALOG_BY_TYPE.get(p.notificationType);
    return {
      id: p.id,
      coachingCenterId: p.coachingCenterId,
      notificationType: p.notificationType,
      category: def?.category ?? 'NOTICE',
      titleEn: def?.titleEn ?? p.notificationType,
      titleBn: def?.titleBn ?? p.notificationType,
      descriptionEn: def?.descriptionEn ?? '',
      descriptionBn: def?.descriptionBn ?? '',
      isMandatory: p.isMandatory,
      isEnabled: p.isEnabled,
      recipients: p.recipients.map((r) => ({
        id: r.id,
        recipientType: r.recipientType,
        isEnabled: r.isEnabled,
        isMandatory: r.isMandatory,
        channels: r.channels.map((c) => ({
          id: c.id,
          channel: c.channel,
          isEnabled: c.isEnabled,
        })),
      })),
    };
  });
}

/**
 * Updates notification alert policies with strict server-side validation.
 * Rejects any attempts to disable mandatory notifications or mandatory recipients.
 */
export async function updateNotificationPolicies(
  coachingCenterId: string,
  user: SessionUser,
  updates: NotificationPolicyUpdateItem[]
): Promise<EnrichedNotificationPolicy[]> {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('NOTIFICATION_POLICY_ACCESS_DENIED: Only Center Owners and Admins can configure alert policies.');
  }

  // 1. Pre-validation: enforce mandatory rules BEFORE modifying database
  for (const item of updates) {
    const def = CATALOG_BY_TYPE.get(item.notificationType);
    const isMandatory = def?.isMandatory ?? isNotificationMandatory(item.notificationType);

    if (isMandatory && item.isEnabled === false) {
      throw new Error(`VALIDATION_ERROR: "${def?.titleEn || item.notificationType}" is a mandatory notification and cannot be disabled.`);
    }

    if (item.recipients) {
      for (const rec of item.recipients) {
        const isRecMandatory = isRecipientMandatory(item.notificationType, rec.recipientType);
        if (isRecMandatory && rec.isEnabled === false) {
          throw new Error(`VALIDATION_ERROR: Recipient "${rec.recipientType}" is mandatory for "${def?.titleEn || item.notificationType}" and cannot be disabled.`);
        }
      }
    }
  }

  // 2. Atomic transaction update
  await prisma.$transaction(async (tx) => {
    for (const item of updates) {
      const def = CATALOG_BY_TYPE.get(item.notificationType);
      const isMandatory = def?.isMandatory ?? isNotificationMandatory(item.notificationType);
      const enforcedEnabled = isMandatory ? true : item.isEnabled;

      const policy = await tx.notificationPolicy.upsert({
        where: {
          coachingCenterId_notificationType: {
            coachingCenterId,
            notificationType: item.notificationType,
          },
        },
        create: {
          coachingCenterId,
          notificationType: item.notificationType,
          isMandatory,
          isEnabled: enforcedEnabled,
        },
        update: {
          isMandatory,
          isEnabled: enforcedEnabled,
        },
      });

      if (item.recipients && item.recipients.length > 0) {
        for (const rec of item.recipients) {
          const isRecMandatory = isRecipientMandatory(item.notificationType, rec.recipientType);
          const recEnforcedEnabled = isRecMandatory ? true : rec.isEnabled;

          const recipientPolicy = await tx.notificationRecipientPolicy.upsert({
            where: {
              policyId_recipientType: {
                policyId: policy.id,
                recipientType: rec.recipientType,
              },
            },
            create: {
              policyId: policy.id,
              recipientType: rec.recipientType,
              isMandatory: isRecMandatory,
              isEnabled: recEnforcedEnabled,
            },
            update: {
              isMandatory: isRecMandatory,
              isEnabled: recEnforcedEnabled,
            },
          });

          if (rec.channels && rec.channels.length > 0) {
            for (const ch of rec.channels) {
              await tx.notificationChannelPolicy.upsert({
                where: {
                  recipientPolicyId_channel: {
                    recipientPolicyId: recipientPolicy.id,
                    channel: ch.channel,
                  },
                },
                create: {
                  recipientPolicyId: recipientPolicy.id,
                  channel: ch.channel,
                  isEnabled: ch.isEnabled,
                },
                update: {
                  isEnabled: ch.isEnabled,
                },
              });
            }
          }
        }
      }
    }
  });

  // 3. Record Audit Log
  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'NOTIFICATION_POLICY_UPDATED',
    entity: 'NotificationPolicy',
    entityId: null,
    details: {
      updatedCount: updates.length,
      types: updates.map((u) => u.notificationType),
    },
  });

  return getNotificationPolicies(coachingCenterId);
}

// ==========================================
// NOTIFICATION RESOLUTION ENGINE
// ==========================================

export interface ResolveRecipientsInput {
  coachingCenterId: string;
  notificationType: string;
  context: {
    studentId?: string | null;
    guardianId?: string | null;
    teacherId?: string | null;
    userId?: string | null;
  };
}

export interface ResolvedRecipientTarget {
  recipientType: NotificationRecipientType;
  recipientId: string;
  channels: NotificationDeliveryChannel[];
}

/**
 * Centrally resolves recipients and delivery channels for any event
 * based on the organization's active NotificationAlertPolicy.
 */
export async function resolveNotificationRecipients(
  input: ResolveRecipientsInput
): Promise<ResolvedRecipientTarget[]> {
  const canonicalType = canonicalNotificationEvent(input.notificationType);

  // 1. Fetch policy for this coaching center
  let policy = await prisma.notificationPolicy.findUnique({
    where: {
      coachingCenterId_notificationType: {
        coachingCenterId: input.coachingCenterId,
        notificationType: canonicalType,
      },
    },
    include: {
      recipients: {
        include: {
          channels: true,
        },
      },
    },
  });

  // If not yet in DB, seed defaults
  if (!policy) {
    await ensureDefaultPolicies(input.coachingCenterId);
    policy = await prisma.notificationPolicy.findUnique({
      where: {
        coachingCenterId_notificationType: {
          coachingCenterId: input.coachingCenterId,
          notificationType: canonicalType,
        },
      },
      include: {
        recipients: {
          include: {
            channels: true,
          },
        },
      },
    });
  }

  // If policy is completely disabled for the organization, return no recipients
  if (!policy || !policy.isEnabled) {
    return [];
  }

  const results: ResolvedRecipientTarget[] = [];
  const enabledRecipients = policy.recipients.filter((r) => r.isEnabled);

  for (const r of enabledRecipients) {
    const enabledChannels = r.channels.filter((c) => c.isEnabled).map((c) => c.channel);
    if (enabledChannels.length === 0) continue;

    if (r.recipientType === 'STUDENT' && input.context.studentId) {
      results.push({
        recipientType: 'STUDENT',
        recipientId: input.context.studentId,
        channels: enabledChannels,
      });
    }

    if (r.recipientType === 'GUARDIAN') {
      if (input.context.guardianId) {
        results.push({
          recipientType: 'GUARDIAN',
          recipientId: input.context.guardianId,
          channels: enabledChannels,
        });
      } else if (input.context.studentId) {
        // Resolve student's linked notification-enabled guardians
        const links = await prisma.studentGuardian.findMany({
          where: { studentId: input.context.studentId, canReceiveNotifications: true },
          select: { guardianId: true },
        });

        for (const link of links) {
          results.push({
            recipientType: 'GUARDIAN',
            recipientId: link.guardianId,
            channels: enabledChannels,
          });
        }
      }
    }

    if (r.recipientType === 'TEACHER' && (input.context.teacherId || input.context.userId)) {
      results.push({
        recipientType: 'TEACHER',
        recipientId: (input.context.teacherId || input.context.userId)!,
        channels: enabledChannels,
      });
    }

    if (r.recipientType === 'ADMIN' && input.context.userId) {
      results.push({
        recipientType: 'ADMIN',
        recipientId: input.context.userId,
        channels: enabledChannels,
      });
    }
  }

  return results;
}
