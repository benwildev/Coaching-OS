import { z } from 'zod';

export const portalLoginSchema = z.object({
  portalType: z.enum(['STUDENT', 'GUARDIAN']),
  identifier: z.string().trim().min(1, 'Identifier is required'),
  password: z.string().min(1, 'Password is required'),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100);

export const setupPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token is required'),
  password: passwordPolicy,
});
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Identifier is required'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token is required'),
  password: passwordPolicy,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordPolicy,
    confirmPassword: z.string().min(1, 'Please confirm the new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const studentProfileUpdateSchema = z.object({
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  photoUrl: optionalText,
});
export type StudentProfileUpdateInput = z.infer<typeof studentProfileUpdateSchema>;

export const guardianProfileUpdateSchema = z.object({
  phone: z.string().trim().min(1, 'Phone is required'),
  altPhone: optionalText,
  whatsapp: optionalText,
  email: optionalText,
  address: optionalText,
});
export type GuardianProfileUpdateInput = z.infer<typeof guardianProfileUpdateSchema>;
