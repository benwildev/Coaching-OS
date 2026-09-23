import { z } from 'zod';

/**
 * Normalizes a Bangladeshi phone number into canonical 11-digit format (01XXXXXXXXX)
 */
export function normalizeBdPhone(phone?: string | null): string {
  if (!phone) return '';
  // Remove spaces, hyphens, parentheses, and any non-digit characters except leading '+'
  let cleaned = phone.trim().replace(/[^0-9+]/g, '');

  if (cleaned.startsWith('+88')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('88') && cleaned.length === 13) {
    cleaned = cleaned.substring(2);
  }

  // Ensure it has 11 digits starting with 01
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Validates whether a phone number is a valid Bangladeshi mobile number
 * Operators: 013, 014, 015, 016, 017, 018, 019
 */
export function isValidBdPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const normalized = normalizeBdPhone(phone);
  return /^01[3-9]\d{8}$/.test(normalized);
}

/**
 * Format normalized BD phone for display: 01712-345678
 */
export function formatBdPhoneDisplay(phone?: string | null): string {
  const norm = normalizeBdPhone(phone);
  if (norm.length === 11) {
    return `${norm.substring(0, 5)}-${norm.substring(5)}`;
  }
  return phone || '';
}

export const GUARDIAN_RELATIONS = [
  'FATHER',
  'MOTHER',
  'BROTHER',
  'SISTER',
  'UNCLE',
  'AUNT',
  'OTHER',
] as const;

export const COMMUNICATION_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;

export const STUDENT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'TRANSFERRED',
  'COMPLETED',
  'DROPPED_OUT',
] as const;

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'O+',
  'O-',
  'AB+',
  'AB-',
] as const;

export const admissionSchema = z.object({
  // Step 1: Student Information
  name: z.string().min(2, 'Student full name is required').max(100),
  banglaName: z.string().max(100).optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: z.string().optional().or(z.literal('')),
  bloodGroup: z.string().optional().or(z.literal('')),
  religion: z.string().optional().or(z.literal('')),
  nationality: z.string().default('Bangladeshi'),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid Bangladeshi mobile number (must be 01XXXXXXXXX or +8801XXXXXXXXX)',
    }),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  photoUrl: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  permanentAddress: z.string().optional().or(z.literal('')),
  schoolName: z.string().optional().or(z.literal('')),
  educationBoardId: z.string().optional().or(z.literal('')),
  nidBirthReg: z.string().optional().or(z.literal('')),
  sscRoll: z.string().optional().or(z.literal('')),
  sscReg: z.string().optional().or(z.literal('')),

  // Step 2: Guardian Information
  guardianName: z.string().min(2, 'Guardian name is required').max(100),
  guardianBanglaName: z.string().max(100).optional().or(z.literal('')),
  guardianRelationship: z.enum(GUARDIAN_RELATIONS).default('FATHER'),
  guardianPhone: z
    .string()
    .min(1, 'Guardian mobile number is required')
    .refine((val) => isValidBdPhone(val), {
      message: 'Valid Bangladeshi mobile number is required for guardian',
    }),
  guardianAltPhone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid alternative mobile number',
    }),
  guardianWhatsapp: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid WhatsApp mobile number',
    }),
  guardianEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  guardianOccupation: z.string().optional().or(z.literal('')),
  guardianAddress: z.string().optional().or(z.literal('')),
  preferredChannel: z.enum(COMMUNICATION_CHANNELS).default('SMS'),

  // Optional secondary guardian
  hasSecondaryGuardian: z.boolean().default(false),
  secondaryName: z.string().optional().or(z.literal('')),
  secondaryRelationship: z.string().optional().or(z.literal('')),
  secondaryPhone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid secondary guardian mobile number',
    }),

  // Step 3: Academic Enrollment
  academicSessionId: z.string().min(1, 'Academic session is required'),
  branchId: z.string().min(1, 'Branch is required'),
  academicProgramId: z.string().min(1, 'Academic program is required'),
  academicClassId: z.string().min(1, 'Academic class is required'),
  academicGroupId: z.string().optional().or(z.literal('')),
  courseId: z.string().optional().or(z.literal('')),
  rollNumber: z.string().optional().or(z.literal('')),
  admissionDate: z.string().optional().or(z.literal('')),

  // Step 4: Batch Assignment
  batchId: z.string().optional().or(z.literal('')),
  remarks: z.string().optional().or(z.literal('')),
});

export type AdmissionInput = z.infer<typeof admissionSchema>;

export const studentUpdateSchema = z.object({
  // Personal Info
  name: z.string().min(2, 'Name is required').max(100).optional(),
  banglaName: z.string().max(100).optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: z.string().optional().or(z.literal('')),
  bloodGroup: z.string().optional().or(z.literal('')),
  religion: z.string().optional().or(z.literal('')),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid Bangladeshi mobile number',
    }),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  photoUrl: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  permanentAddress: z.string().optional().or(z.literal('')),
  schoolName: z.string().optional().or(z.literal('')),
  educationBoardId: z.string().optional().or(z.literal('')),
  nidBirthReg: z.string().optional().or(z.literal('')),
  sscRoll: z.string().optional().or(z.literal('')),
  sscReg: z.string().optional().or(z.literal('')),
  branchId: z.string().optional().or(z.literal('')),
  status: z.enum(STUDENT_STATUSES).optional(),

  // Primary Guardian
  guardianId: z.string().optional(),
  guardianName: z.string().min(2).max(100).optional(),
  guardianBanglaName: z.string().max(100).optional().or(z.literal('')),
  guardianRelationship: z.enum(GUARDIAN_RELATIONS).optional(),
  guardianPhone: z
    .string()
    .optional()
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid guardian mobile number',
    }),
  guardianAltPhone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid alternative mobile number',
    }),
  guardianWhatsapp: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid WhatsApp number',
    }),
  guardianEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  guardianOccupation: z.string().optional().or(z.literal('')),
  guardianAddress: z.string().optional().or(z.literal('')),
  preferredChannel: z.enum(COMMUNICATION_CHANNELS).optional(),

  // Academic enrollment update (optional: create new or update active)
  newEnrollment: z
    .object({
      academicSessionId: z.string().min(1),
      branchId: z.string().min(1),
      academicProgramId: z.string().min(1),
      academicClassId: z.string().min(1),
      academicGroupId: z.string().optional().or(z.literal('')),
      courseId: z.string().optional().or(z.literal('')),
      educationBoardId: z.string().optional().or(z.literal('')),
      rollNumber: z.string().optional().or(z.literal('')),
      batchId: z.string().optional().or(z.literal('')),
      remarks: z.string().optional().or(z.literal('')),
    })
    .optional(),
});

export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
