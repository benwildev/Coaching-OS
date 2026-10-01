import { z } from 'zod';

// Unified sign-in (/login): email, phone, or student ID code + password for every account type.
// No minimum length here — the stored policy is enforced when a password is
// set, and a length check at login would only leak that policy per account.
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email, phone, or Student ID is required').max(200),
  password: z.string().min(1, 'Password is required').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(200).email('Enter a valid email address'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const userCreateSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  banglaName: z.string().optional(),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Valid Bangladesh phone number required (e.g. 01712345678)'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
