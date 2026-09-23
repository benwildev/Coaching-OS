import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const userCreateSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  banglaName: z.string().optional(),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Valid Bangladesh phone number required (e.g. 01712345678)'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']),
  branchId: z.string().optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().min(2, 'Name is required').optional(),
  banglaName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
