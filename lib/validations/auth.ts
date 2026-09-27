import { z } from 'zod';

// Staff sign-in. Password mode requires a real password (same minimum as
// userCreateSchema); OTP mode requires the 6-digit code issued by
// /api/auth/otp/request — there is no fixed/demo code.
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, 'Email or phone number is required').max(200),
    password: z.string().max(200).optional(),
    otp: z.string().trim().optional(),
    phone: z.string().optional(),
    mode: z.enum(['password', 'otp']).default('password'),
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'otp') {
      if (!d.otp || !/^\d{6}$/.test(d.otp)) ctx.addIssue({ code: 'custom', path: ['otp'], message: 'Enter the 6-digit code' });
    } else if (!d.password || d.password.length < 6) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password must be at least 6 characters' });
    }
  });

export const otpRequestSchema = z.object({
  phone: z.string().trim().min(10, 'Valid Bangladesh phone number required (e.g. 01712345678)').max(20),
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
