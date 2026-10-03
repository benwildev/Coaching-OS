// Response shapes of the Coaching OS portal API (app/api/portal/**).
// DateTimes arrive as ISO strings; Prisma Decimals arrive as strings.

type ID = string;
type ISO = string;
type Dec = string;

export interface Named {
  id: ID;
  name: string;
  banglaName: string | null;
}
export interface Coded extends Named {
  code: string;
}
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MeResponse {
  user: { portalType: 'STUDENT' | 'GUARDIAN'; name: string; studentId: string | null; guardianId: string | null } | null;
  center: { name: string; banglaName: string | null; branding: { logoUrl: string | null; primaryColor: string } | null } | null;
}

export interface StudentProfile {
  id: ID;
  studentIdCode: string;
  name: string;
  banglaName: string | null;
  phone: string | null;
  email: string | null;
  dob: ISO | null;
  address: string | null;
  photoUrl: string | null;
  branch: { id: ID; name: string } | null;
  enrollments: Array<{
    academicSession: { id: ID; name: string };
    academicProgram: Named;
    academicClass: Named;
    academicGroup: Named | null;
  }>;
  studentBatches: Array<{ batch: Coded }>;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
  recent?: Array<{ id: ID; status: AttendanceStatus; date: ISO; batchName: string; subjectName?: string }>;
}
export interface AttendanceRecord {
  id: ID;
  status: AttendanceStatus;
  date: ISO;
  inTime: string | null;
  remarks: string | null;
  batch: Named;
  subject: Named | null;
}

export interface PortalExam {
  id: ID;
  title: string;
  banglaTitle: string | null;
  examType: string;
  status: string;
  startDate: ISO;
  endDate: ISO | null;
  batch: Named | null;
  subjects: Array<{
    id: ID;
    examDate: ISO | null;
    startTime: string | null;
    durationMinutes: number | null;
    totalMarks: number;
    subject: Coded;
  }>;
}

export interface ExamResultGroup {
  examId: ID;
  title: string;
  banglaTitle: string | null;
  examType: string;
  startDate: ISO;
  publishedAt: ISO | null;
  batch: string | null;
  rank: number | null;
  subjects: Array<{
    resultId: ID;
    subjectName: string;
    subjectBanglaName: string | null;
    status: string;
    marksObtained: number | null;
    highestMarks: number | null;
    totalMarks: number;
    grade: string | null;
    gpa: number | null;
    isPassed: boolean;
  }>;
  overall: {
    totalExamMarks: number;
    totalMarksObtained: number;
    overallPercentage: number;
    overallGrade: string;
    overallGpa: number;
    isPassed: boolean;
  };
}

export interface Notice {
  id: ID;
  title: string;
  banglaTitle: string | null;
  content: string;
  banglaContent: string | null;
  publishedAt: ISO | null;
  batch: { id: ID; name: string } | null;
}

export interface FeeSummary {
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
}
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export interface PortalInvoice {
  id: ID;
  invoiceNumber: string;
  invoiceDate: ISO;
  dueDate: ISO | null;
  totalAmount: Dec;
  paidAmount: Dec;
  dueAmount: Dec;
  status: InvoiceStatus;
}
export interface PortalPayment {
  id: ID;
  receiptNumber: string;
  amount: Dec;
  paymentMethod: string;
  paymentDate: ISO;
  status: string;
  invoice: { id: ID; invoiceNumber: string } | null;
}
export interface FeesResponse {
  summary: FeeSummary;
  invoices: PortalInvoice[];
  payments?: PortalPayment[];
}

export type HomeworkComputedStatus = 'UPCOMING' | 'DUE_SOON' | 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED';
export interface HomeworkItem {
  id: ID;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  dueAt: ISO;
  status: 'PUBLISHED' | 'CLOSED';
  subject: Coded;
  batch: Coded;
  submission: { status: string; submittedAt: ISO; isLate: boolean; feedback: string | null } | null;
  computedStatus: HomeworkComputedStatus;
}
export interface HomeworkDetail extends Omit<HomeworkItem, 'computedStatus' | 'submission'> {
  banglaDescription: string | null;
  fileUrl: string | null;
  teacher: Named | null;
  submission: {
    id: ID;
    status: string;
    submittedAt: ISO;
    isLate: boolean;
    content: string | null;
    fileUrl: string | null;
    feedback: string | null;
    reviewedAt: ISO | null;
  } | null;
}

export interface Material {
  id: ID;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  type: 'PDF' | 'VIDEO' | 'IMAGE' | 'DOCUMENT' | 'NOTE' | 'LINK';
  fileUrl: string | null;
  publishedAt: ISO | null;
  subject: Coded;
}

export interface TimetableSlot {
  id: ID;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subjectName: string;
  subjectBanglaName: string | null;
  batchName: string;
  teacherName: string | null;
  roomName: string | null;
}

export interface PortalNotification {
  id: ID;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: ISO;
}

export interface GuardianChild {
  id: ID;
  studentIdCode: string;
  name: string;
  banglaName: string | null;
  photoUrl: string | null;
  enrollments: Array<{ academicClass: Named; academicGroup: Named | null }>;
  studentBatches: Array<{ batch: Coded }>;
}

export interface GuardianDashboard {
  children: Array<{ student: GuardianChild; isPrimary: boolean }>;
  selectedChild: GuardianChild | null;
  attendance?: AttendanceSummary;
  fees?: FeeSummary | null;
  upcomingExams?: PortalExam[];
  recentResults?: ExamResultGroup[];
  notices: Notice[];
  unreadNotificationCount: number;
}

export interface StudentDashboard {
  student: StudentProfile;
  attendance: AttendanceSummary;
  fees: FeeSummary | null;
  nextDue: { dueDate: ISO | null; dueAmount: Dec; invoiceNumber: string } | null;
  upcomingExams: PortalExam[];
  recentResults: ExamResultGroup[];
  notices: Notice[];
  unreadNotificationCount: number;
}

export interface GuardianProfile {
  id: ID;
  name: string;
  banglaName: string | null;
  relationship: string;
  phone: string;
  altPhone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  studentGuardians: Array<{ isPrimary: boolean; student: { id: ID; name: string; studentIdCode: string } }>;
}

export interface PaymentOptions {
  availableOnlineGateways: Array<{ provider: 'BKASH' | 'SSLCOMMERZ'; name: string; isSandbox: boolean }>;
  manualInstructions: Array<{
    id: ID;
    paymentMethod: string;
    accountType: string | null;
    accountNumber: string | null;
    accountTitle: string | null;
    bankName: string | null;
    branchName: string | null;
    instructions: string | null;
    instructionsBn: string | null;
  }>;
  invoiceSummary?: { invoiceId: ID; invoiceNumber: string; dueAmount: number; totalAmount: number; status: string };
}
