import { z } from 'zod';
import { hasBangla, hasEnglish, toEnglishNumeral } from '../format';
import { isHttpOrRelativeUrl, RESOURCE_URL_MESSAGE } from './common';

/**
 * Normalizes a Bangladeshi phone number into canonical 11-digit format (01XXXXXXXXX)
 */
export function normalizeBdPhone(phone?: string | null): string {
  if (!phone) return '';
  // Convert any Bengali numerals (০-৯) to English numerals (0-9)
  const converted = toEnglishNumeral(phone);
  // Remove spaces, hyphens, parentheses, and any non-digit characters except leading '+'
  let cleaned = converted.trim().replace(/[^0-9+]/g, '');

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
  name: z
    .string()
    .min(2, 'Student full name is required')
    .max(100)
    .refine((val) => !hasBangla(val), {
      message: 'Student full name (English) must be in English. Bangla characters are not allowed.',
    }),
  banglaName: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Student full name (Bangla) must be in Bangla. English letters are not allowed.',
    }),
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
  photoUrl: z.string().optional().or(z.literal('')).refine(isHttpOrRelativeUrl, { message: RESOURCE_URL_MESSAGE }),
  address: z.string().optional().or(z.literal('')),
  permanentAddress: z.string().optional().or(z.literal('')),
  schoolName: z.string().optional().or(z.literal('')),
  educationBoardId: z.string().optional().or(z.literal('')),
  nidBirthReg: z.string().optional().or(z.literal('')),
  sscRoll: z.string().optional().or(z.literal('')),
  sscReg: z.string().optional().or(z.literal('')),

  // Step 2: Guardian Information
  guardianId: z.string().optional().or(z.literal('')),
  guardianName: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasBangla(val), {
      message: 'Guardian name (English) must be in English. Bangla characters are not allowed.',
    }),
  guardianBanglaName: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Guardian Bangla name must be in Bangla. English letters are not allowed.',
    }),
  guardianRelationship: z.enum(GUARDIAN_RELATIONS).default('FATHER'),
  guardianPhone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
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
  secondaryName: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasBangla(val), {
      message: 'Secondary guardian name must be in English.',
    }),
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

  // Step 4 & 5: Batch Assignment
  batchId: z.string().optional().or(z.literal('')),
  overrideCapacity: z.boolean().optional(),
  overrideConflict: z.boolean().optional(),
  remarks: z.string().optional().or(z.literal('')),

  // Step 6: Fee Assignment
  feeStructureId: z.string().optional().or(z.literal('')),
  feeAmount: z.number().min(0).optional(),
  feeName: z.string().max(150).optional(),
  feeDueDate: z.string().optional().or(z.literal('')),
  // Phase 11.2: when true the server derives every fee line from the selected
  // course's Fee & Payment Plan (feeStructureId/feeAmount are ignored — amounts
  // are never taken from the client). optionalFeeIds opts this student into
  // specific optional additional fees.
  useCoursePricing: z.boolean().optional(),
  optionalFeeIds: z.array(z.string().min(1)).max(30).optional(),

  // Step 7: Discount & Waiver
  discountAmount: z.number().min(0).default(0),
  waiverAmount: z.number().min(0).default(0),
  discountReason: z.string().max(500).optional().or(z.literal('')),

  // Step 8: Initial Payment
  initialPayment: z
    .object({
      amount: z.number().min(0),
      paymentMethod: z.enum(['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER']).default('CASH'),
      transactionId: z.string().max(100).optional().or(z.literal('')),
      referenceNumber: z.string().max(100).optional().or(z.literal('')),
      senderMobile: z.string().max(20).optional().or(z.literal('')),
      bankName: z.string().max(100).optional().or(z.literal('')),
      chequeNumber: z.string().max(100).optional().or(z.literal('')),
      notes: z.string().max(500).optional().or(z.literal('')),
      idempotencyKey: z.string().max(100).optional().or(z.literal('')),
    })
    .optional(),

  idempotencyKey: z.string().max(100).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.guardianId) {
    if (!data.guardianName || data.guardianName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Guardian name is required',
        path: ['guardianName'],
      });
    }
    if (!data.guardianPhone || !isValidBdPhone(data.guardianPhone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid Bangladeshi mobile number is required for guardian',
        path: ['guardianPhone'],
      });
    }
  }
  if (data.feeAmount !== undefined) {
    const totalDeductions = (data.discountAmount || 0) + (data.waiverAmount || 0);
    if (totalDeductions > data.feeAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Discount and waiver combined cannot exceed the fee amount',
        path: ['discountAmount'],
      });
    }
  }
});

export type AdmissionInput = z.infer<typeof admissionSchema>;

export const studentUpdateSchema = z.object({
  // Personal Info
  name: z
    .string()
    .min(2, 'Name is required')
    .max(100)
    .optional()
    .refine((val) => !val || !hasBangla(val), {
      message: 'Student name (English) must be in English.',
    }),
  banglaName: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Student full name (Bangla) must be in Bangla.',
    }),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: z.string().optional().nullable().or(z.literal('')),
  bloodGroup: z.string().optional().nullable().or(z.literal('')),
  religion: z.string().optional().nullable().or(z.literal('')),
  phone: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid Bangladeshi mobile number',
    }),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  photoUrl: z.string().optional().nullable().or(z.literal('')).refine(isHttpOrRelativeUrl, { message: RESOURCE_URL_MESSAGE }),
  address: z.string().optional().nullable().or(z.literal('')),
  permanentAddress: z.string().optional().nullable().or(z.literal('')),
  schoolName: z.string().optional().nullable().or(z.literal('')),
  educationBoardId: z.string().optional().nullable().or(z.literal('')),
  nidBirthReg: z.string().optional().nullable().or(z.literal('')),
  sscRoll: z.string().optional().nullable().or(z.literal('')),
  sscReg: z.string().optional().nullable().or(z.literal('')),
  branchId: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(STUDENT_STATUSES).optional(),

  // Primary Guardian
  guardianId: z.string().optional().nullable(),
  guardianName: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .refine((val) => !val || !hasBangla(val), {
      message: 'Guardian name (English) must be in English.',
    }),
  guardianBanglaName: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Guardian name (Bangla) must be in Bangla.',
    }),
  guardianRelationship: z.enum(GUARDIAN_RELATIONS).optional(),
  guardianPhone: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid guardian mobile number',
    }),
  guardianAltPhone: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid alternative mobile number',
    }),
  guardianWhatsapp: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || isValidBdPhone(val), {
      message: 'Invalid WhatsApp number',
    }),
  guardianEmail: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  guardianOccupation: z.string().optional().nullable().or(z.literal('')),
  guardianAddress: z.string().optional().nullable().or(z.literal('')),
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
