import type { ReportCategory } from './access';
import type { ViewHandler } from './report-utils';
import { studentDirectory, studentEnrollment, studentStatus } from './student-reports';
import { attendanceBatches, attendanceLow, attendanceStudentDetail, attendanceStudents, attendanceSummary } from './attendance-reports';
import { financeBranches, financeDiscounts, financeDue, financeMethods, financeRefunds, financeSummary, financeTrend } from './finance-reports';
import { examBatches, examDetail, examGrades, examStudentResult, examSubjects, examSummary } from './exam-reports';
import { teacherAttendance, teacherDirectory, teacherSchedule } from './teacher-reports';
import { batchDetail, batchFees, batchList } from './batch-reports';
import { communicationLogs, communicationNotices, communicationNotifications, communicationSummary } from './communication-reports';

export interface ViewDef {
  handler: ViewHandler;
  /** Whether a CSV export exists for this view. */
  csv: boolean;
}

export const REPORT_VIEWS: Record<ReportCategory, Record<string, ViewDef>> = {
  students: {
    directory: { handler: studentDirectory, csv: true },
    enrollment: { handler: studentEnrollment, csv: false },
    status: { handler: studentStatus, csv: true },
  },
  attendance: {
    summary: { handler: attendanceSummary, csv: false },
    students: { handler: attendanceStudents, csv: true },
    low: { handler: attendanceLow, csv: true },
    batches: { handler: attendanceBatches, csv: true },
    student: { handler: attendanceStudentDetail, csv: true },
  },
  finance: {
    summary: { handler: financeSummary, csv: false },
    trend: { handler: financeTrend, csv: true },
    methods: { handler: financeMethods, csv: true },
    due: { handler: financeDue, csv: true },
    discounts: { handler: financeDiscounts, csv: true },
    refunds: { handler: financeRefunds, csv: true },
    branches: { handler: financeBranches, csv: true },
  },
  exams: {
    summary: { handler: examSummary, csv: true },
    grades: { handler: examGrades, csv: true },
    subjects: { handler: examSubjects, csv: true },
    batches: { handler: examBatches, csv: true },
    exam: { handler: examDetail, csv: true },
    student: { handler: examStudentResult, csv: true },
  },
  teachers: {
    directory: { handler: teacherDirectory, csv: true },
    schedule: { handler: teacherSchedule, csv: true },
    attendance: { handler: teacherAttendance, csv: true },
  },
  batches: {
    list: { handler: batchList, csv: true },
    detail: { handler: batchDetail, csv: false },
    fees: { handler: batchFees, csv: false },
  },
  communications: {
    summary: { handler: communicationSummary, csv: false },
    logs: { handler: communicationLogs, csv: true },
    notices: { handler: communicationNotices, csv: true },
    notifications: { handler: communicationNotifications, csv: true },
  },
};
