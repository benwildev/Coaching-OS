import { z } from 'zod';
import { DAY_ENUM_VALUES, parseTimeToMinutes } from '@/lib/schedule';

export const SCHEDULE_STATUSES = ['ACTIVE', 'CANCELLED'] as const;

const timeString = z.string().refine((v) => !Number.isNaN(parseTimeToMinutes(v)), {
  message: 'Time must be in HH:mm 24-hour format',
});

export const classScheduleSchema = z
  .object({
    branchId: z.string().min(1, 'Branch is required'),
    batchId: z.string().min(1, 'Batch is required'),
    subjectId: z.string().min(1, 'Subject is required'),
    teacherId: z.string().optional().or(z.literal('')),
    roomId: z.string().optional().or(z.literal('')),
    dayOfWeek: z.enum(DAY_ENUM_VALUES as [string, ...string[]]),
    startTime: timeString,
    endTime: timeString,
    effectiveStartDate: z.string().optional().or(z.literal('')),
    effectiveEndDate: z.string().optional().or(z.literal('')),
    status: z.enum(SCHEDULE_STATUSES).default('ACTIVE'),
    overrideConflicts: z.boolean().default(false),
  })
  .refine((v) => parseTimeToMinutes(v.endTime) > parseTimeToMinutes(v.startTime), {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export type ClassScheduleInput = z.infer<typeof classScheduleSchema>;

export const classScheduleUpdateSchema = classScheduleSchema;
export type ClassScheduleUpdateInput = z.infer<typeof classScheduleUpdateSchema>;
