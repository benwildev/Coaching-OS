import { z } from 'zod';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export const getOrCreateSessionSchema = z.object({
  classScheduleId: z.string().min(1, 'Class schedule is required'),
  date: z.string().min(4, 'Date is required'),
});
export type GetOrCreateSessionInput = z.infer<typeof getOrCreateSessionSchema>;

export const markStudentSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  remarks: z.string().max(300).optional().or(z.literal('')),
});
export type MarkStudentInput = z.infer<typeof markStudentSchema>;

export const bulkMarkSchema = z.object({
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(ATTENDANCE_STATUSES),
        remarks: z.string().max(300).optional().or(z.literal('')),
      })
    )
    .default([]),
  markAllPresent: z.boolean().default(false),
});
export type BulkMarkInput = z.infer<typeof bulkMarkSchema>;

export const completeSessionSchema = z.object({
  allowIncomplete: z.boolean().default(false),
});
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export const reopenSessionSchema = z.object({
  reason: z.string().min(3, 'A reason is required to reopen attendance').max(500),
});
export type ReopenSessionInput = z.infer<typeof reopenSessionSchema>;

export const attendanceHistoryFilterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  branchId: z.string().optional(),
  academicSessionId: z.string().optional(),
  programId: z.string().optional(),
  classId: z.string().optional(),
  groupId: z.string().optional(),
  batchId: z.string().optional(),
  subjectId: z.string().optional(),
  teacherId: z.string().optional(),
  status: z.string().optional(),
});
export type AttendanceHistoryFilter = z.infer<typeof attendanceHistoryFilterSchema>;

export const teacherAttendanceSchema = z.object({
  teacherId: z.string().min(1, 'Teacher is required'),
  date: z.string().min(4, 'Date is required'),
  status: z.enum(ATTENDANCE_STATUSES).default('PRESENT'),
  inTime: z.string().optional().or(z.literal('')),
  outTime: z.string().optional().or(z.literal('')),
  remarks: z.string().max(300).optional().or(z.literal('')),
});
export type TeacherAttendanceInput = z.infer<typeof teacherAttendanceSchema>;

export const thresholdSchema = z.object({
  threshold: z.number().min(1).max(100),
});
export type ThresholdInput = z.infer<typeof thresholdSchema>;

export const DEFAULT_ATTENDANCE_THRESHOLD = 75;
