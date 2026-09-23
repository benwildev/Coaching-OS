import { z } from 'zod';
import { isValidBdPhone } from './student';

export const TEACHER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export const teacherSchema = z.object({
  branchId: z.string().optional().or(z.literal('')),
  name: z.string().min(2, 'Teacher name is required').max(100),
  banglaName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => isValidBdPhone(val), { message: 'Invalid Bangladeshi mobile number' }),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  designation: z.string().max(100).optional().or(z.literal('')),
  qualification: z.string().max(200).optional().or(z.literal('')),
  bio: z.string().max(1000).optional().or(z.literal('')),
  photoUrl: z.string().optional().or(z.literal('')),
  status: z.enum(TEACHER_STATUSES).default('ACTIVE'),
  joiningDate: z.string().optional().or(z.literal('')),
  subjectIds: z.array(z.string()).default([]),
});

export type TeacherInput = z.infer<typeof teacherSchema>;
export const teacherUpdateSchema = teacherSchema.partial();
export type TeacherUpdateInput = z.infer<typeof teacherUpdateSchema>;
